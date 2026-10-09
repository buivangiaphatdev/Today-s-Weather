import { z } from "zod";

const origin = z
  .string()
  .refine((value) => URL.canParse(value) && new URL(value).origin === value, {
    message: "must be a bare origin such as https://example.com (no path or trailing slash)",
  });

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
    .pipe(z.array(origin).min(1)),
  OPENWEATHER_API_KEY: z.string().min(1),
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
