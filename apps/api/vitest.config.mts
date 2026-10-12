import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // esbuild cannot emit decorator metadata, which Nest's DI relies on; SWC can
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    // Integration suites share one test database (TRUNCATE between tests): run files
    // one at a time so a suite never wipes rows another one is using
    fileParallelism: false,
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "http://localhost:5173",
      OPENWEATHER_API_KEY: "test-key",
      JWT_SECRET: "test-jwt-secret-that-is-at-least-32-characters",
      // Overrides any REDIS_URL from a local .env: tests use the in-memory store unless
      // they opt into a real Redis via REDIS_TEST_URL (test/redis.integration.test.ts)
      REDIS_URL: "",
      // Unreachable on purpose: tests that need Postgres opt in with DATABASE_TEST_URL
      // (test/db.integration.test.ts); the rest must not depend on a database
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused_test",
    },
  },
});
