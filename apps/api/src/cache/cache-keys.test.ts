import { describe, expect, it } from "vitest";
import { cacheKeys } from "./cache-keys";

describe("cacheKeys", () => {
  it("rounds coordinates to 2 decimals so nearby requests share an entry", () => {
    expect(cacheKeys.current({ lat: 21.0283, lon: 105.8542 })).toBe(
      cacheKeys.current({ lat: 21.0261, lon: 105.8497 }),
    );
    expect(cacheKeys.current({ lat: 21.0283, lon: 105.8542 })).toBe(
      "v1:weather:current:21.03:105.85",
    );
  });

  it("keeps different places apart", () => {
    expect(cacheKeys.current({ lat: 21.03, lon: 105.85 })).not.toBe(
      cacheKeys.current({ lat: 10.78, lon: 106.7 }),
    );
  });

  it("separates endpoints that share coordinates", () => {
    const hanoi = { lat: 21.03, lon: 105.85 };
    const keys = [cacheKeys.current(hanoi), cacheKeys.forecast(hanoi), cacheKeys.reverse(hanoi)];
    expect(new Set(keys).size).toBe(3);
  });

  it("normalises -0 so both sides of the equator/meridian round the same", () => {
    expect(cacheKeys.current({ lat: -0.001, lon: 0.001 })).toBe("v1:weather:current:0.00:0.00");
  });

  it("normalises search case, spacing and Unicode form", () => {
    const composed = "Hà Nội";
    const decomposed = composed.normalize("NFD");
    expect(cacheKeys.search(`  ${decomposed.toUpperCase()}  `)).toBe(cacheKeys.search(composed));
    expect(cacheKeys.search("ha   noi")).toBe("v1:geo:search:ha noi");
  });
});
