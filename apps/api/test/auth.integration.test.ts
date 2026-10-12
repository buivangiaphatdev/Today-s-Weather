import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { REFRESH_TOKEN_TTL_MS, ROTATION_GRACE_MS } from "../src/auth/auth.constants";
import { PrismaService } from "../src/prisma/prisma.service";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./helpers/test-database";

const PASSWORD = "correct horse battery staple";

describe.skipIf(!testDatabaseUrl)("Auth (real Postgres)", () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let ipCounter = 0;
  let emailCounter = 0;
  // A fresh account per test: the per-email login limit (10/hour) must not carry over
  let email = "";

  // Each test speaks from its own IP so the strict login limits (5/min per IP) of one
  // test never leak into another; limits are tested explicitly below
  const newIp = () => `203.0.113.${++ipCounter}`;
  const http = (ip = newIp()) => {
    const server = app.getHttpServer();
    return {
      post: (path: string) => request(server).post(path).set("X-Forwarded-For", ip),
      ip,
    };
  };

  const refreshCookieOf = (res: request.Response) => {
    const cookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    return cookies.find((cookie) => cookie.startsWith("rt="));
  };
  const tokenOf = (res: request.Response) =>
    refreshCookieOf(res)?.split(";")[0].slice("rt=".length);

  const register = (address = email, ip?: string) =>
    http(ip).post("/api/auth/register").send({ email: address, password: PASSWORD, name: "An" });
  const refresh = (token?: string) => {
    const req = http().post("/api/auth/refresh").set("X-Requested-With", "fetch");
    return token ? req.set("Cookie", `rt=${token}`) : req;
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
    app.set("trust proxy", true); // read the test IP from X-Forwarded-For
    await app.listen(0);
  }, 60_000);

  beforeEach(async () => {
    await truncateAll(prisma);
    email = `user-${++emailCounter}@example.com`;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.onModuleDestroy();
  });

  describe("register", () => {
    it("creates the account, returns a profile and an access token, sets the refresh cookie", async () => {
      const res = await register(`  ${email.toUpperCase()} `);

      expect(res.status).toBe(201);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.body).toMatchObject({
        expiresIn: 900,
        user: { email, name: "An", emailVerified: false },
      });
      expect(res.body.user.settings).toEqual({ units: "metric", language: "vi", theme: "system" });
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|argon2/);

      const cookie = refreshCookieOf(res)!;
      for (const attribute of [
        "HttpOnly",
        "Secure",
        "SameSite=None",
        "Partitioned",
        "Path=/api/auth",
      ]) {
        expect(cookie).toContain(attribute);
      }
      expect(cookie).toContain(`Max-Age=${REFRESH_TOKEN_TTL_MS / 1000}`);

      const stored = await prisma.user.findUniqueOrThrow({ where: { email } });
      expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
      const token = await prisma.refreshToken.findFirstOrThrow();
      expect(token.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(token.tokenHash).not.toBe(tokenOf(res)); // only the hash is stored
    });

    it("issues an access token for the new user", async () => {
      const res = await register();
      const [, payload] = res.body.accessToken.split(".");
      const claims = JSON.parse(Buffer.from(payload, "base64url").toString());

      expect(claims).toMatchObject({
        sub: res.body.user.id,
        iss: "todays-weather-api",
        aud: "todays-weather-web",
      });
      expect(claims.exp - claims.iat).toBe(900);
    });

    it("refuses an email that is already registered, whatever its case", async () => {
      await register(email);
      const res = await register(email.toUpperCase());

      expect(res.status).toBe(409);
    });

    it("validates the body", async () => {
      const res = await http()
        .post("/api/auth/register")
        .send({ email: "nope", password: "short" });

      expect(res.status).toBe(400);
      expect(Object.keys(res.body.errors)).toEqual(expect.arrayContaining(["email", "password"]));
    });
  });

  describe("login", () => {
    beforeEach(() => register());

    it("signs in with the right password", async () => {
      const res = await http()
        .post("/api/auth/login")
        .send({ email: email.toUpperCase(), password: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(email);
      expect(tokenOf(res)).toBeTruthy();
    });

    it("answers the same for a wrong password and an unknown email", async () => {
      const wrong = await http().post("/api/auth/login").send({ email, password: "nope" });
      const unknown = await http()
        .post("/api/auth/login")
        .send({ email: "who@example.com", password: "nope" });

      expect(wrong.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(wrong.body.message).toBe("Invalid email or password");
      expect(unknown.body.message).toBe(wrong.body.message);
      expect(refreshCookieOf(wrong)).toBeUndefined();
    });
  });

  describe("refresh", () => {
    let token: string;

    beforeEach(async () => {
      token = tokenOf(await register())!;
    });

    it("rotates: new access token, new refresh cookie, old token marked as replaced", async () => {
      const res = await refresh(token);

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      const next = tokenOf(res)!;
      expect(next).not.toBe(token);

      const rows = await prisma.refreshToken.findMany({ orderBy: { createdAt: "asc" } });
      expect(rows).toHaveLength(2);
      expect(rows[0].revokedAt).not.toBeNull();
      expect(rows[0].replacedById).toBe(rows[1].id);
      expect(rows[1].familyId).toBe(rows[0].familyId);
      expect((await refresh(next)).status).toBe(200);
    });

    it("requires the X-Requested-With header (CSRF)", async () => {
      const res = await http().post("/api/auth/refresh").set("Cookie", `rt=${token}`);

      expect(res.status).toBe(403);
    });

    it("rejects a missing or unknown token and clears the cookie", async () => {
      const missing = await refresh();
      const unknown = await refresh("not-a-real-token");

      expect(missing.status).toBe(401);
      expect(unknown.status).toBe(401);
      expect(unknown.body.code).toBe("invalid_refresh_token");
      expect(refreshCookieOf(unknown)).toMatch(/^rt=;.*Expires=Thu, 01 Jan 1970/);
    });

    it("rejects an expired token", async () => {
      await prisma.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

      expect((await refresh(token)).status).toBe(401);
    });

    it("treats a token reused seconds after rotation as a race (other tab): 401, session kept", async () => {
      const next = tokenOf(await refresh(token))!;
      const raced = await refresh(token);

      expect(raced.status).toBe(401);
      expect(raced.body.code).toBe("refresh_conflict");
      expect(refreshCookieOf(raced)).toBeUndefined(); // the other tab's new cookie survives
      expect((await refresh(next)).status).toBe(200);
    });

    it("treats a token reused after the grace period as theft: the whole session is revoked", async () => {
      const next = tokenOf(await refresh(token))!;
      await prisma.refreshToken.updateMany({
        where: { replacedById: { not: null } },
        data: { revokedAt: new Date(Date.now() - ROTATION_GRACE_MS - 1000) },
      });

      const replayed = await refresh(token);
      expect(replayed.status).toBe(401);
      expect(replayed.body.code).toBe("invalid_refresh_token");

      // The legitimate device is signed out too: it must log in again
      expect((await refresh(next)).status).toBe(401);
      expect(await prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
    });

    it("lets only one of two simultaneous refreshes win", async () => {
      const results = await Promise.all([refresh(token), refresh(token)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
      expect(results.find((r) => r.status === 401)?.body.code).toBe("refresh_conflict");
    });

    it("keeps other devices signed in", async () => {
      const otherDevice = tokenOf(
        await http().post("/api/auth/login").send({ email, password: PASSWORD }),
      )!;
      await http()
        .post("/api/auth/logout")
        .set("X-Requested-With", "fetch")
        .set("Cookie", `rt=${token}`);

      expect((await refresh(otherDevice)).status).toBe(200);
    });
  });

  describe("logout", () => {
    it("ends the session and clears the cookie", async () => {
      const token = tokenOf(await register())!;

      const res = await http()
        .post("/api/auth/logout")
        .set("X-Requested-With", "fetch")
        .set("Cookie", `rt=${token}`);

      expect(res.status).toBe(204);
      expect(refreshCookieOf(res)).toMatch(/^rt=;/);
      expect((await refresh(token)).status).toBe(401);
    });

    it("is idempotent without a cookie", async () => {
      const res = await http().post("/api/auth/logout").set("X-Requested-With", "fetch");
      expect(res.status).toBe(204);
    });
  });

  describe("rate limits", () => {
    beforeEach(() => register());

    const login = (ip: string, address = email) =>
      http(ip).post("/api/auth/login").send({ email: address, password: "wrong-password" });

    it("allows 5 attempts per minute from one IP", async () => {
      const ip = newIp();
      const statuses = [];
      for (let i = 0; i < 6; i++) statuses.push((await login(ip)).status);

      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it("allows 10 attempts per hour on one account, even from many IPs", async () => {
      const statuses = [];
      for (let i = 0; i < 11; i++)
        statuses.push((await login(newIp(), email.toUpperCase())).status);

      expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
      // Other accounts are unaffected
      expect((await login(newIp(), `other-${email}`)).status).toBe(401);
    });

    it("does not apply the login limits to other routes", async () => {
      const ip = newIp();
      for (let i = 0; i < 5; i++) await login(ip);

      const res = await http(ip).post("/api/auth/refresh").set("X-Requested-With", "fetch");
      expect(res.status).toBe(401); // refresh still reachable, not 429
    });
  });
});
