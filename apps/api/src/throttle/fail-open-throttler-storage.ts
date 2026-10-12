import { Logger, type OnApplicationShutdown } from "@nestjs/common";
import { type ThrottlerStorage, ThrottlerStorageService } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { ThrottlerStorageRedisService } from "@nest-lab/throttler-storage-redis";
import type Redis from "ioredis";
import { createLogThrottle } from "../common/log-throttle";

// Counters in Redis are shared by every API instance (Vercel runs several), so the
// limit holds globally. If Redis fails, count in memory instead of failing the request.
export class FailOpenThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(FailOpenThrottlerStorage.name);
  private readonly shouldLog = createLogThrottle();
  private readonly memory = new ThrottlerStorageService();
  private readonly redis: ThrottlerStorageRedisService | null;

  constructor(redis: Redis | null) {
    this.redis = redis ? new ThrottlerStorageRedisService(redis) : null;
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (this.redis) {
      try {
        return await this.redis.increment(key, ttl, limit, blockDuration, throttlerName);
      } catch (error) {
        if (this.shouldLog()) {
          this.logger.warn(`Rate-limit counters fell back to memory: ${String(error)}`);
        }
      }
    }
    return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
  }

  onApplicationShutdown() {
    this.memory.onApplicationShutdown();
  }
}
