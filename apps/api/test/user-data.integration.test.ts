import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import { HISTORY_LIMIT, MAX_FAVORITES } from "@weather/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { PrismaService } from "../src/prisma/prisma.service";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./helpers/test-database";

const hanoi = { name: "Hà Nội", country: "VN", lat: 21.0283334, lon: 105.854041 };
const hue = { name: "Huế", country: "VN", lat: 16.4637, lon: 107.5909 };
const city = (i: number) => ({ name: `City ${i}`, country: "VN", lat: 10 + i / 100, lon: 106 });

describe.skipIf(!testDatabaseUrl)("User data: /api/me, /api/favorites, /api/history", () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let counter = 0;

  // Register a fresh user (own IP and email so auth rate limits never interfere)
  const signUp = async () => {
    const n = ++counter;
    const res = await request(app.getHttpServer())
      .post("/api/auth/register")
      .set("X-Forwarded-For", `198.51.100.${n}`)
      .send({ email: `user-${n}@example.com`, password: "long enough password" });
    const token: string = res.body.accessToken;
    const as = (method: "get" | "post" | "patch" | "delete", path: string) =>
      request(app.getHttpServer())[method](path).set("Authorization", `Bearer ${token}`);
    return { id: res.body.user.id as string, as };
  };

  beforeAll(async () => {
    prisma = connectTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    app.set("trust proxy", true);
    await app.listen(0);
  }, 60_000);

  beforeEach(() => truncateAll(prisma));

  afterAll(async () => {
    await app?.close();
    await prisma?.onModuleDestroy();
  });

  it.each([
    ["GET", "/api/me"],
    ["GET", "/api/favorites"],
    ["POST", "/api/favorites"],
    ["GET", "/api/history"],
    ["DELETE", "/api/history"],
  ])("%s %s requires an access token", async (method, path) => {
    const res = await request(app.getHttpServer())[method.toLowerCase() as "get"](path);
    expect(res.status).toBe(401);
  });

  describe("/api/me", () => {
    it("returns the profile, never cached", async () => {
      const user = await signUp();
      const res = await user.as("get", "/api/me");

      expect(res.status).toBe(200);
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.body).toMatchObject({ id: user.id, emailVerified: false });
      expect(res.body).not.toHaveProperty("passwordHash");
    });

    it("updates settings partially", async () => {
      const user = await signUp();

      const res = await user.as("patch", "/api/me/settings").send({ units: "imperial" });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ units: "imperial", language: "vi", theme: "system" });
      expect((await user.as("get", "/api/me/settings")).body.units).toBe("imperial");
    });

    it("rejects invalid or empty settings", async () => {
      const user = await signUp();

      expect((await user.as("patch", "/api/me/settings").send({ theme: "blue" })).status).toBe(400);
      expect((await user.as("patch", "/api/me/settings").send({})).status).toBe(400);
    });
  });

  describe("/api/favorites", () => {
    it("adds, lists in insertion order and removes", async () => {
      const user = await signUp();

      const added = await user.as("post", "/api/favorites").send(hanoi);
      await user.as("post", "/api/favorites").send(hue);

      expect(added.status).toBe(201);
      expect(added.body).toMatchObject({ name: "Hà Nội", lat: 21.0283, lon: 105.854, state: null });
      const list = await user.as("get", "/api/favorites");
      expect(list.body.map((f: { name: string }) => f.name)).toEqual(["Hà Nội", "Huế"]);

      expect((await user.as("delete", `/api/favorites/${added.body.id}`)).status).toBe(204);
      expect((await user.as("get", "/api/favorites")).body).toHaveLength(1);
    });

    it("is idempotent: adding the same city again returns the existing one (200)", async () => {
      const user = await signUp();

      const first = await user.as("post", "/api/favorites").send(hanoi);
      // Same place after rounding to 4 decimals
      const again = await user.as("post", "/api/favorites").send({ ...hanoi, lat: 21.02831 });

      expect(again.status).toBe(200);
      expect(again.body.id).toBe(first.body.id);
      expect((await user.as("get", "/api/favorites")).body).toHaveLength(1);
    });

    it(`caps a user at ${MAX_FAVORITES} favorites`, async () => {
      const user = await signUp();
      await prisma.favoriteCity.createMany({
        data: Array.from({ length: MAX_FAVORITES }, (_, i) => ({ userId: user.id, ...city(i) })),
      });

      const res = await user.as("post", "/api/favorites").send(hanoi);

      expect(res.status).toBe(409);
    });

    it("imports localStorage favorites, skipping duplicates, and can be repeated safely", async () => {
      const user = await signUp();
      await user.as("post", "/api/favorites").send(hanoi);

      const first = await user.as("post", "/api/favorites/import").send([hanoi, hue, city(1)]);
      const second = await user.as("post", "/api/favorites/import").send([hanoi, hue, city(1)]);

      expect(first.status).toBe(200);
      expect(first.body.map((f: { name: string }) => f.name)).toEqual(["Hà Nội", "Huế", "City 1"]);
      expect(second.body).toEqual(first.body);
    });

    it("validates input and ids", async () => {
      const user = await signUp();

      expect((await user.as("post", "/api/favorites").send({ ...hanoi, lat: 95 })).status).toBe(
        400,
      );
      expect((await user.as("delete", "/api/favorites/not-a-uuid")).status).toBe(400);
      expect((await user.as("delete", `/api/favorites/${crypto.randomUUID()}`)).status).toBe(404);
    });
  });

  describe("/api/history", () => {
    const search = (q: string, place: typeof hanoi) => ({ query: q, ...place });

    it("keeps the newest searches first and moves a repeated place to the top", async () => {
      const user = await signUp();

      await user.as("post", "/api/history").send(search("ha noi", hanoi));
      await user.as("post", "/api/history").send(search("hue", hue));
      const res = await user.as("post", "/api/history").send(search("hanoi", hanoi));

      expect(res.status).toBe(200);
      expect(res.body.map((h: { query: string }) => h.query)).toEqual(["hanoi", "hue"]);
    });

    it(`keeps only the latest ${HISTORY_LIMIT} searches`, async () => {
      const user = await signUp();
      for (let i = 0; i < HISTORY_LIMIT + 2; i++) {
        await user.as("post", "/api/history").send(search(`q${i}`, city(i)));
      }

      const list = (await user.as("get", "/api/history")).body;

      expect(list).toHaveLength(HISTORY_LIMIT);
      expect(list[0].query).toBe(`q${HISTORY_LIMIT + 1}`);
      expect(await prisma.searchHistory.count()).toBe(HISTORY_LIMIT);
    });

    it("clears the history", async () => {
      const user = await signUp();
      await user.as("post", "/api/history").send(search("hue", hue));

      expect((await user.as("delete", "/api/history")).status).toBe(204);
      expect((await user.as("get", "/api/history")).body).toEqual([]);
    });
  });

  describe("isolation between users", () => {
    it("never shows, changes or deletes another user's data", async () => {
      const alice = await signUp();
      const bob = await signUp();
      const aliceFavorite = (await alice.as("post", "/api/favorites").send(hanoi)).body;
      await alice.as("post", "/api/history").send({ query: "ha noi", ...hanoi });
      await alice.as("patch", "/api/me/settings").send({ theme: "dark" });

      expect((await bob.as("get", "/api/favorites")).body).toEqual([]);
      expect((await bob.as("get", "/api/history")).body).toEqual([]);
      expect((await bob.as("get", "/api/me/settings")).body.theme).toBe("system");

      // Bob knows Alice's favorite id but cannot delete it
      expect((await bob.as("delete", `/api/favorites/${aliceFavorite.id}`)).status).toBe(404);
      await bob.as("delete", "/api/history");

      expect((await alice.as("get", "/api/favorites")).body).toHaveLength(1);
      expect((await alice.as("get", "/api/history")).body).toHaveLength(1);
    });
  });
});
