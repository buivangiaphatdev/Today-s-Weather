import { Global, Inject, Logger, Module, type OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Redis from "ioredis";
import { createLogThrottle } from "../common/log-throttle";
import type { Env } from "../config/env";

// Injects `Redis | null`: null when REDIS_URL is not set (tests, local without Docker)
export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Redis | null => {
        const url = config.get("REDIS_URL", { infer: true });
        if (!url) return null;

        const logger = new Logger("Redis");
        const shouldLog = createLogThrottle();
        const client = new Redis(url, {
          // Fail fast: Redis is an optimisation, a slow Redis must not slow requests down
          connectTimeout: 2000,
          commandTimeout: 1000,
          maxRetriesPerRequest: 1,
          retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
        });
        // Without an "error" listener ioredis errors would crash the process
        client.on("error", (error: Error) => {
          if (shouldLog()) logger.warn(`Redis unavailable: ${error.message}`);
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  async onApplicationShutdown() {
    await this.redis?.quit().catch(() => this.redis?.disconnect());
  }
}
