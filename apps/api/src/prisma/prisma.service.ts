import { Injectable, type OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";
import type { Env } from "../config/env";
import { PrismaClient } from "../generated/prisma/client";

// Connects lazily: the pool opens connections on the first query, so the app (and
// weather endpoints) still start when Postgres is unreachable.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(config: ConfigService<Env, true>) {
    const pool = new Pool({
      connectionString: config.get("DATABASE_URL", { infer: true }),
      // Serverless: few connections per instance; Neon's pooler multiplexes the rest
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 10_000,
    });
    // On Vercel Fluid compute, release idle connections before the instance is
    // suspended, otherwise they leak and exhaust the database's connection limit
    if (process.env.VERCEL) attachDatabasePool(pool);

    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  // Idempotent: Nest may call it on shutdown after the adapter already closed the pool
  async onModuleDestroy() {
    await this.$disconnect();
    if (!this.pool.ended) await this.pool.end();
  }
}
