import { describe, expect, it } from "vitest";
import { formatTemperature, formatWindSpeed, toDisplayTemperature } from "./units";

describe("units", () => {
  it("keeps metric as returned by the API", () => {
    expect(formatTemperature(29.4, "metric")).toBe("29°C");
    expect(formatWindSpeed(3.2, "metric")).toBe("3.2 m/s");
  });

  it("converts to imperial for display", () => {
    expect(toDisplayTemperature(0, "imperial")).toBe(32);
    expect(toDisplayTemperature(-40, "imperial")).toBe(-40);
    expect(formatTemperature(29.4, "imperial")).toBe("85°F");
    expect(formatWindSpeed(10, "imperial")).toBe("22.4 mph");
  });

  it("can omit the unit letter for compact layouts", () => {
    expect(formatTemperature(21.6, "metric", false)).toBe("22°");
  });
});
