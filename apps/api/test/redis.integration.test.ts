import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import Redis from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { RedisCacheStore } from "../src/cache/cache-store";
import { REDIS_CLIENT } from "../src/redis/redis.module";
import { FailOpenThrottlerStorage } from "../src/throttle/fail-open-throttler-storage";
import { jsonResponse, rawCurrentWeather } from "./fixtures/openweather";

// Runs against a real Redis: CI provides one; locally `pnpm infra:up` then
// REDIS_TEST_URL=redis://127.0.0.1:6380 pnpm --filter api test:run
// Never FLUSHDB here: the URL may point at a Redis that holds someone else's data.
// Each test only touches keys it creates (random suffix) or deletes exactly what it reads.
const url = process.env.REDIS_TEST_URL;
const unique = (name: string) => `test:${name}:${crypto.randomUUID()}`;
const hanoiKey = "v1:weather:current:21.03:105.85";

describe.skipIf(!url)("with a real Redis", () => {
  let redis: Redis;

  beforeAll(() => {
    redis = new Redis(url!, { maxRetriesPerRequest: 1 });
  });

  afterAll(async () => {
    await redis.quit();
  });

  it("stores values with a TTL", async () => {
    const store = new RedisCacheStore(redis);
    const key = unique("store");

    await store.set(key, "value", 60);

    expect(await store.get(key)).toBe("value");
    expect(await redis.ttl(key)).toBeGreaterThan(55);
    await redis.del(key);
  });

  it("shares rate-limit counters between API instances", async () => {
    // Two storages = two serverless instances; the limit must hold across both
    const instanceA = new FailOpenThrottlerStorage(redis);
    const instanceB = new FailOpenThrottlerStorage(redis);

    const ip = unique("ip");

    await instanceA.increment(ip, 1000, 2, 1000, "burst");
    await instanceB.increment(ip, 1000, 2, 1000, "burst");
    const third = await instanceA.increment(ip, 1000, 2, 1000, "burst");

    expect(third.totalHits).toBe(3);
    expect(third.isBlocked).toBe(true);
  });

  describe("two app instances", () => {
    const fetchMock = vi.fn<typeof fetch>(async () => jsonResponse(rawCurrentWeather));
    const apps: INestApplication[] = [];

    const createApp = async () => {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(REDIS_CLIENT)
        .useValue(new Redis(url!, { maxRetriesPerRequest: 1 }))
        .compile();
      const app = configureApp(moduleRef.createNestApplication<NestExpressApplication>());
      apps.push(app);
      return app.init();
    };

    beforeAll(async () => {
      vi.stubGlobal("fetch", fetchMock);
      await redis.del(hanoiKey); // the only app cache key these tests rely on
    });

    afterAll(async () => {
      await Promise.all(apps.map((app) => app.close()));
      await redis.del(hanoiKey);
      vi.unstubAllGlobals();
    });

    it("serve each other's cache entries", async () => {
      const [a, b] = [await createApp(), await createApp()];

      const first = await request(a.getHttpServer()).get(
        "/api/weather/current?lat=21.03&lon=105.85",
      );
      const second = await request(b.getHttpServer()).get(
        "/api/weather/current?lat=21.03&lon=105.85",
      );

      expect(first.headers["x-cache"]).toBe("MISS");
      expect(second.headers["x-cache"]).toBe("HIT");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await redis.ttl(hanoiKey)).toBeGreaterThan(590);
    });

    it("reports Redis up in health", async () => {
      const res = await request((await createApp()).getHttpServer()).get("/api/health");

      expect(res.body).toMatchObject({ status: "ok", checks: { redis: { status: "up" } } });
      expect(res.body.checks.redis.latencyMs).toBeGreaterThanOrEqual(0);
    });
  });
});
