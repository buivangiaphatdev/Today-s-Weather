import { Controller, Get, Header, Inject } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../redis/redis.module";

type DependencyStatus = "up" | "down" | "disabled";

export interface HealthResponse {
  // "degraded": the API still answers (cache/limits fall back to memory) but a dependency is down
  status: "ok" | "degraded";
  uptimeSeconds: number;
  checks: { redis: { status: DependencyStatus; latencyMs?: number } };
}

const PING_TIMEOUT_MS = 1000;

@Controller("health")
// Uptime monitors poll this; never rate-limit them. Names must match the throttlers:
// a bare @SkipThrottle() only skips one called "default".
@SkipThrottle({ burst: true, sustained: true })
export class HealthController {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis | null) {}

  // GET /api/health. Postgres joins the checks once it is used (phase 2).
  @Get()
  @Header("Cache-Control", "no-store")
  async check(): Promise<HealthResponse> {
    const redis = await this.pingRedis();
    return {
      status: redis.status === "down" ? "degraded" : "ok",
      uptimeSeconds: Math.round(process.uptime()),
      checks: { redis },
    };
  }

  private async pingRedis(): Promise<HealthResponse["checks"]["redis"]> {
    if (!this.redis) return { status: "disabled" };

    const startedAt = performance.now();
    try {
      await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS).unref(),
        ),
      ]);
      return { status: "up", latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { status: "down" };
    }
  }
}
