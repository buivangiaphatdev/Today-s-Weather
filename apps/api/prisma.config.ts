// Prisma CLI configuration (generate, migrate). Prisma 7 does not read .env by itself.
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Migrations need a direct connection; Neon's pooled URL (DATABASE_URL) goes
    // through PgBouncer, which does not support everything Prisma Migrate uses.
    // process.env (not env()) so `prisma generate` works without any database URL.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL ?? "",
  },
});
