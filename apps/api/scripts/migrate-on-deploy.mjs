// Runs from the Vercel build (apps/api/vercel.json). Applies pending migrations to the
// production database only: preview deployments must never change production schema.
import { execFileSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(`[migrate] skipped (VERCEL_ENV=${process.env.VERCEL_ENV ?? "unset"})`);
  process.exit(0);
}

if (!process.env.DATABASE_URL_UNPOOLED) {
  console.error(
    "[migrate] DATABASE_URL_UNPOOLED is not set; connect Neon to the Production environment",
  );
  process.exit(1);
}

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit" });
