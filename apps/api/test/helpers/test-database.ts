import { execFileSync } from "node:child_process";
import type { ConfigService } from "@nestjs/config";
import type { Env } from "../../src/config/env";
import { settleBackgroundWork } from "../../src/common/background";
import { PrismaService } from "../../src/prisma/prisma.service";

// Real-Postgres suites opt in with DATABASE_TEST_URL (CI provides one; locally
// `pnpm infra:up` then DATABASE_TEST_URL=postgresql://weather:weather@127.0.0.1:5433/weather_test)
export const testDatabaseUrl = process.env.DATABASE_TEST_URL;

// Suites truncate tables between tests. Refuse anything that is not clearly a test
// database, so a mistyped URL can never wipe dev or production data.
function assertTestDatabase(connectionString: string) {
  const name = new URL(connectionString).pathname.slice(1);
  if (!name.endsWith("_test")) {
    throw new Error(`DATABASE_TEST_URL must point at a database named *_test (got "${name}")`);
  }
}

// Applies pending migrations (never drops data) and returns a client for the test DB.
// Both URL variables are set explicitly so prisma.config.ts never falls back to .env.
export function connectTestDatabase(): PrismaService {
  const url = testDatabaseUrl!;
  assertTestDatabase(url);
  execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url },
    stdio: "pipe",
    shell: process.platform === "win32",
  });
  return new PrismaService({ get: () => url } as unknown as ConfigService<Env, true>);
}

// Waits for background writes first (e.g. the verification email token issued after
// sign-up): truncating while they run deadlocks
export async function truncateAll(prisma: PrismaService) {
  await settleBackgroundWork();
  await prisma.$executeRaw`TRUNCATE TABLE users CASCADE`;
}
