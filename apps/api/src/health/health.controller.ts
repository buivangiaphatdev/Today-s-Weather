import { Controller, Get, Header, Inject, Res } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import type { Response } from "express";
import type Redis from "ioredis";
import { PrismaService } from "../prisma/prisma.service";
import { REDIS_CLIENT } from "../redis/redis.module";

type DependencyStatus = "up" | "down" | "disabled";

interface DependencyCheck {
  status: DependencyStatus;
  latencyMs?: number;
}

export interface HealthResponse {
  // "ok": everything up. "degraded": an optional dependency (Redis) is down; the API
  // still answers with cache/limits in memory. "down": Postgres is unreachable, so
  // sign-in and user data fail; answered with HTTP 503 for uptime monitors.
  status: "ok" | "degraded" | "down";
  uptimeSeconds: number;
  checks: { postgres: DependencyCheck; redis: DependencyCheck };
}

const PING_TIMEOUT_MS = 1000;

async function timed(ping: () => Promise<unknown>): Promise<DependencyCheck> {
  const startedAt = performance.now();
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), PING_TIMEOUT_MS).unref(),
      ),
    ]);
    return { status: "up", latencyMs: Math.round(performance.now() - startedAt) };
  } catch {
    return { status: "down" };
  }
}

@Controller("health")
// Uptime monitors poll this; never rate-limit them. Names must match the throttlers:
// a bare @SkipThrottle() only skips one called "default".
@SkipThrottle({ burst: true, sustained: true })
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis | null,
  ) {}

  // GET /api/health
  @Get()
  @Header("Cache-Control", "no-store")
  async check(@Res({ passthrough: true }) res: Response): Promise<HealthResponse> {
    const [postgres, redis] = await Promise.all([
      timed(() => this.prisma.$queryRaw`SELECT 1`),
      this.redis
        ? timed(() => this.redis!.ping())
        : Promise.resolve<DependencyCheck>({ status: "disabled" }),
    ]);

    const status =
      postgres.status === "down" ? "down" : redis.status === "down" ? "degraded" : "ok";
    if (status === "down") res.status(503);

    return {
      status,
      uptimeSeconds: Math.round(process.uptime()),
      checks: { postgres, redis },
    };
  }
}
