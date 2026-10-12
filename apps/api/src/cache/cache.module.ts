import { Global, Module } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";
import { MemoryCacheStore, RedisCacheStore } from "./cache-store";
import { CacheService } from "./cache.service";

@Global()
@Module({
  providers: [
    {
      provide: CacheService,
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis | null) =>
        new CacheService(redis ? new RedisCacheStore(redis) : new MemoryCacheStore()),
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}
