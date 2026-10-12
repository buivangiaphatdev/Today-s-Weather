import { execFileSync } from "node:child_process";
import type { INestApplication } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import type { Env } from "../src/config/env";
import { Prisma } from "../src/generated/prisma/client";
import { PrismaService } from "../src/prisma/prisma.service";

// Runs against a real Postgres: CI provides one; locally `pnpm infra:up` then
// DATABASE_TEST_URL=postgresql://weather:weather@127.0.0.1:5433/weather_test pnpm --filter api test:run
const url = process.env.DATABASE_TEST_URL;

// This suite truncates tables between tests. Refuse anything that is not clearly a test
// database, so a mistyped URL can never wipe dev or production data.
function assertTestDatabase(connectionString: string) {
  const name = new URL(connectionString).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`DATABASE_TEST_URL must point at a database named *_test (got "${name}")`);
  }
}

describe.skipIf(!url)("with a real Postgres", () => {
  let prisma: PrismaService;

  beforeAll(() => {
    assertTestDatabase(url!);
    // migrate deploy only applies pending migrations; it never drops data. Both variables
    // are set explicitly so prisma.config.ts never falls back to the dev URL in .env.
    // (A test DB that drifted from the migrations has to be recreated by hand.)
    execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
      env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
      stdio: "pipe",
      shell: process.platform === "win32",
    });
    prisma = new PrismaService({ get: () => url } as unknown as ConfigService<Env, true>);
  }, 60_000);

  beforeEach(() => prisma.$executeRaw`TRUNCATE TABLE users CASCADE`);

  afterAll(async () => {
    await prisma?.onModuleDestroy();
  });

  const createUser = (email = "an@example.com") =>
    prisma.user.create({ data: { email, passwordHash: "x" } });

  it("applies the migrations: all tables exist", async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name <> '_prisma_migrations'
      ORDER BY table_name`;
    expect(tables.map((t) => t.table_name)).toEqual([
      "favorite_cities",
      "refresh_tokens",
      "search_history",
      "users",
    ]);
  });

  it("gives new users default settings and a UUIDv7 id", async () => {
    const user = await createUser();

    expect(user).toMatchObject({ units: "metric", language: "vi", theme: "system" });
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  });

  it("rejects a second account with the same email", async () => {
    await createUser();

    await expect(createUser()).rejects.toMatchObject({ code: "P2002" });
  });

  it("rejects the same favorite city twice for one user", async () => {
    const user = await createUser();
    const hanoi = { userId: user.id, name: "Hà Nội", country: "VN", lat: 21.0283, lon: 105.854 };

    await prisma.favoriteCity.create({ data: hanoi });
    const error = await prisma.favoriteCity.create({ data: hanoi }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(error).toMatchObject({ code: "P2002" });
  });

  it("deletes a user's favorites, history and refresh tokens with the account", async () => {
    const user = await createUser();
    const place = { userId: user.id, name: "Huế", country: "VN", lat: 16.4637, lon: 107.5909 };
    await prisma.favoriteCity.create({ data: place });
    await prisma.searchHistory.create({ data: { ...place, query: "hue" } });
    await prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId: crypto.randomUUID(),
        tokenHash: "a".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    await prisma.user.delete({ where: { id: user.id } });

    const counts = await Promise.all([
      prisma.favoriteCity.count(),
      prisma.searchHistory.count(),
      prisma.refreshToken.count(),
    ]);
    expect(counts).toEqual([0, 0, 0]);
  });

  describe("GET /api/health", () => {
    let app: INestApplication;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        .compile();
      app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
      await app.init();
    });

    afterAll(async () => {
      // The shared client is closed by the outer afterAll
      await app.close();
    });

    it("reports Postgres up", async () => {
      const res = await request(app.getHttpServer()).get("/api/health");

      expect(res.status).toBe(200);
      expect(res.body.checks.postgres).toMatchObject({ status: "up" });
      expect(res.body.checks.postgres.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
