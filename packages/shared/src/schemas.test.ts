import { describe, expect, it } from "vitest";
import {
  favoriteInputSchema,
  favoritesImportSchema,
  historyInputSchema,
  loginSchema,
  registerSchema,
  updateSettingsSchema,
} from "./index.js";

describe("registerSchema", () => {
  it("normalises the email to trimmed lowercase", () => {
    const input = registerSchema.parse({ email: "  An.Nguyen@Gmail.COM ", password: "12345678" });
    expect(input.email).toBe("an.nguyen@gmail.com");
  });

  it.each([
    ["an invalid email", { email: "not-an-email", password: "12345678" }, "email"],
    ["a short password", { email: "a@b.co", password: "1234567" }, "password"],
    ["an overlong password", { email: "a@b.co", password: "x".repeat(129) }, "password"],
    ["an empty name", { email: "a@b.co", password: "12345678", name: "  " }, "name"],
  ])("rejects %s", (_, value, field) => {
    const result = registerSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual([field]);
  });
});

describe("loginSchema", () => {
  it("accepts passwords shorter than the current policy", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "old" }).success).toBe(true);
  });
});

describe("place schemas", () => {
  const hanoi = { name: " Hà Nội ", country: "VN", lat: 21.0283334, lon: 105.854041 };

  it("trims names and rounds coordinates to 4 decimals", () => {
    expect(favoriteInputSchema.parse(hanoi)).toEqual({
      name: "Hà Nội",
      country: "VN",
      lat: 21.0283,
      lon: 105.854,
    });
  });

  it("rejects coordinates out of range", () => {
    expect(favoriteInputSchema.safeParse({ ...hanoi, lat: 91 }).success).toBe(false);
    expect(favoriteInputSchema.safeParse({ ...hanoi, lon: -181 }).success).toBe(false);
  });

  it("caps an import at 50 favorites", () => {
    expect(favoritesImportSchema.safeParse(Array(50).fill(hanoi)).success).toBe(true);
    expect(favoritesImportSchema.safeParse(Array(51).fill(hanoi)).success).toBe(false);
  });

  it("requires the search query for history", () => {
    expect(historyInputSchema.safeParse(hanoi).success).toBe(false);
    expect(historyInputSchema.safeParse({ ...hanoi, query: "ha noi" }).success).toBe(true);
  });
});

describe("updateSettingsSchema", () => {
  it("accepts a partial update", () => {
    expect(updateSettingsSchema.parse({ units: "imperial" })).toEqual({ units: "imperial" });
  });

  it("rejects an empty update and unknown values", () => {
    expect(updateSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateSettingsSchema.safeParse({ theme: "blue" }).success).toBe(false);
  });
});
