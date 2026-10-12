import { Logger } from "@nestjs/common";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import Redis from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FailOpenThrottlerStorage } from "./fail-open-throttler-storage";

// A client pointed at a closed port that fails every command immediately
const deadRedis = () =>
  new Redis("redis://127.0.0.1:1", {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
  }).on("error", () => {});

describe("FailOpenThrottlerStorage", () => {
  beforeAll(() => Logger.overrideLogger(false));
  afterAll(() => Logger.overrideLogger(true));

  it("counts in memory when Redis is not configured", async () => {
    const storage = new FailOpenThrottlerStorage(null);

    await storage.increment("ip", 1000, 2, 1000, "burst");
    const record = await storage.increment("ip", 1000, 2, 1000, "burst");

    expect(record.totalHits).toBe(2);
    expect(record.isBlocked).toBe(false);
  });

  it("falls back to memory instead of failing the request when Redis is down", async () => {
    const redis = deadRedis();
    const storage = new FailOpenThrottlerStorage(redis);

    for (let i = 0; i < 2; i++) await storage.increment("ip", 1000, 2, 1000, "burst");
    const third = await storage.increment("ip", 1000, 2, 1000, "burst");

    expect(third.isBlocked).toBe(true);
    redis.disconnect();
  });

  it("reuses our Redis client instead of opening its own connection", () => {
    // The library checks `instanceof Redis`; two ioredis copies would make it ignore ours
    const redis = deadRedis();
    expect(new ThrottlerStorageRedisService(redis).redis).toBe(redis);
    redis.disconnect();
  });
});
