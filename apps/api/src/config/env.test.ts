import { describe, expect, it } from "vitest";
import { validateEnv } from "./env";

const base = { OPENWEATHER_API_KEY: "key" };

describe("validateEnv", () => {
  it("applies defaults", () => {
    expect(validateEnv(base)).toEqual({
      NODE_ENV: "development",
      PORT: 3000,
      LOG_LEVEL: "info",
      CORS_ORIGINS: ["http://localhost:5173"],
      OPENWEATHER_API_KEY: "key",
      TRUST_PROXY: 0,
    });
  });

  it("coerces PORT and splits CORS_ORIGINS", () => {
    const env = validateEnv({
      ...base,
      PORT: "8080",
      CORS_ORIGINS: "http://localhost:5173, https://today-s-weather-chi.vercel.app",
    });
    expect(env.PORT).toBe(8080);
    expect(env.CORS_ORIGINS).toEqual([
      "http://localhost:5173",
      "https://today-s-weather-chi.vercel.app",
    ]);
  });

  it("fails fast when the OpenWeather key is missing", () => {
    expect(() => validateEnv({})).toThrow(/OPENWEATHER_API_KEY/);
  });

  it("rejects origins with a trailing slash, which browsers never send", () => {
    expect(() => validateEnv({ ...base, CORS_ORIGINS: "https://example.com/" })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it("rejects an invalid port", () => {
    expect(() => validateEnv({ ...base, PORT: "abc" })).toThrow(/PORT/);
  });
});
