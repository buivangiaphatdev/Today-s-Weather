import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // esbuild cannot emit decorator metadata, which Nest's DI relies on; SWC can
  plugins: [swc.vite({ module: { type: "es6" } })],
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "http://localhost:5173",
      OPENWEATHER_API_KEY: "test-key",
      // Overrides any REDIS_URL from a local .env: tests use the in-memory store unless
      // they opt into a real Redis via REDIS_TEST_URL (test/redis.integration.test.ts)
      REDIS_URL: "",
      // Unreachable on purpose: tests that need Postgres opt in with DATABASE_TEST_URL
      // (test/db.integration.test.ts); the rest must not depend on a database
      DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused_test",
    },
  },
});
