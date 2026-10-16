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

const optionalString = (schema: z.ZodString) =>
  z.preprocess((value) => (value === "" ? undefined : value), schema.optional());

const urlWithProtocols = (protocols: string[], message: string) =>
  z.string().refine((value) => URL.canParse(value) && protocols.includes(new URL(value).protocol), {
    message,
  });

export const envSchema = z
  .object({
    // Defaults to production so a deploy that forgets NODE_ENV never loads dev-only tooling
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
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
    // Signs access tokens (HS256). Generate with: node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
    JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
    // Pooled connection used by the app (Neon: host contains "-pooler"). Migrations use
    // DATABASE_URL_UNPOOLED via prisma.config.ts, not this schema.
    DATABASE_URL: z
      .string()
      .refine(
        (value) =>
          URL.canParse(value) && ["postgres:", "postgresql:"].includes(new URL(value).protocol),
        { message: "must be a postgres:// or postgresql:// URL" },
      ),
    // redis://localhost:6379 (docker compose) or rediss://... (Upstash). Optional: without
    // it the cache and rate-limit counters live in memory, per instance.
    REDIS_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .refine(
          (value) => URL.canParse(value) && ["redis:", "rediss:"].includes(new URL(value).protocol),
          { message: "must be a redis:// or rediss:// URL" },
        )
        .optional(),
    ),

    // Web app origin for links in emails and OAuth redirects. Defaults to the first
    // non-wildcard CORS origin (the production web domain on Vercel).
    WEB_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .refine(isBareOrigin, { message: "must be an origin such as https://example.com" })
        .optional(),
    ),

    // Email (P2-05). smtp(s)://user:pass@host:port, e.g. Gmail (app password) or Brevo.
    // Unset: emails are not sent (development logs them instead).
    SMTP_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      urlWithProtocols(["smtp:", "smtps:"], "must be an smtp:// or smtps:// URL").optional(),
    ),
    MAIL_FROM: z.string().default("Today's Weather <no-reply@todays-weather.local>"),

    // Google sign-in (P2-04). Disabled unless GOOGLE_CLIENT_ID is set.
    GOOGLE_CLIENT_ID: optionalString(z.string()),
    GOOGLE_CLIENT_SECRET: optionalString(z.string()),
    // Public origin of this API, for the OAuth callback URL registered at Google
    // (production: https://today-s-weather-api.vercel.app, local: http://localhost:5173)
    API_PUBLIC_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z
        .string()
        .refine(isBareOrigin, { message: "must be an origin such as https://example.com" })
        .optional(),
    ),
  })
  .superRefine((env, ctx) => {
    if (env.GOOGLE_CLIENT_ID && (!env.GOOGLE_CLIENT_SECRET || !env.API_PUBLIC_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["GOOGLE_CLIENT_ID"],
        message: "Google sign-in also needs GOOGLE_CLIENT_SECRET and API_PUBLIC_URL",
      });
    }
  })
  .transform(({ WEB_URL, ...env }) => ({
    ...env,
    WEB_URL:
      WEB_URL ??
      env.CORS_ORIGINS.find((origin): origin is string => typeof origin === "string") ??
      "http://localhost:5173",
  }));

export type Env = z.infer<typeof envSchema>;

// Used by ConfigModule: the app refuses to start when the environment is invalid
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
