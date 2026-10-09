import { z } from "zod";

const isBareOrigin = (value: string) => URL.canParse(value) && new URL(value).origin === value;

// "https://example.com", or with one "*" standing for a single DNS label segment, e.g.
// "https://today-s-weather-*-my-team.vercel.app" for Vercel preview deployments.
// The wildcard never matches dots, so it cannot be stretched to another domain.
const corsOrigin = z
  .string()
  .refine((value) => (value.match(/\*/g) ?? []).length <= 1, {
    message: "may contain at most one *",
  })
  .refine((value) => isBareOrigin(value.replace("*", "x")), {
    message: "must be a bare origin such as https://example.com (no path or trailing slash)",
  })
  .transform((value): string | RegExp => {
    if (!value.includes("*")) return value;
    const [before, after] = value
      .split("*")
      .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, "\\$&"));
    return new RegExp(`^${before}[a-z0-9-]+${after}$`);
  });

export const envSchema = z.object({
  // Defaults to production so a deploy that forgets NODE_ENV never loads dev-only tooling
  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:5173")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    )
    .pipe(z.array(corsOrigin).min(1)),
  OPENWEATHER_API_KEY: z.string().min(1),
  // Number of reverse proxies in front of the API (Vercel/Railway/Render: 1). Needed
  // so req.ip is the real client IP for rate limiting. Keep 0 when not behind a proxy,
  // otherwise clients could spoof X-Forwarded-For to dodge the limit.
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
});

export type Env = z.infer<typeof envSchema>;

// Used by ConfigModule: the app refuses to start when the environment is invalid
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
