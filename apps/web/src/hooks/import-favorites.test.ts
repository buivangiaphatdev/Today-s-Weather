import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { favoritesApi } from "../api/account";
import { importLocalFavorites } from "./use-favorite";

const hanoi = {
  id: "21.0283-105.854",
  name: "Hà Nội",
  country: "VN",
  lat: 21.0283,
  lon: 105.854,
  addedAt: 1,
};

describe("importLocalFavorites (first sign-in on a device)", () => {
  const importSpy = vi.spyOn(favoritesApi, "import");

  beforeEach(() => localStorage.setItem("favorites", JSON.stringify([hanoi])));
  afterEach(() => importSpy.mockReset());

  it("sends local favorites to the account, then clears them locally", async () => {
    importSpy.mockResolvedValue([]);

    expect(await importLocalFavorites()).toBe(1);

    expect(importSpy).toHaveBeenCalledWith([
      { name: "Hà Nội", country: "VN", state: undefined, lat: 21.0283, lon: 105.854 },
    ]);
    expect(JSON.parse(localStorage.getItem("favorites")!)).toEqual([]);
  });

  it("keeps local favorites when the import fails, so nothing is lost", async () => {
    importSpy.mockRejectedValue(new Error("offline"));

    await expect(importLocalFavorites()).rejects.toThrow("offline");

    expect(JSON.parse(localStorage.getItem("favorites")!)).toHaveLength(1);
  });

  it("does nothing when there are no local favorites", async () => {
    localStorage.setItem("favorites", "[]");

    expect(await importLocalFavorites()).toBe(0);
    expect(importSpy).not.toHaveBeenCalled();
  });
});
