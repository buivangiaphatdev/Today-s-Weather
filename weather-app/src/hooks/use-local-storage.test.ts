import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLocalStorage } from "./use-local-storage";

describe("useLocalStorage", () => {
  it("returns the initial value when the key is empty", () => {
    const { result } = renderHook(() => useLocalStorage("units", "metric"));

    expect(result.current[0]).toBe("metric");
  });

  it("reads an existing value from localStorage", () => {
    localStorage.setItem("units", JSON.stringify("imperial"));

    const { result } = renderHook(() => useLocalStorage("units", "metric"));

    expect(result.current[0]).toBe("imperial");
  });

  it("persists updates to localStorage", () => {
    const { result } = renderHook(() => useLocalStorage<string[]>("history", []));

    act(() => result.current[1](["Hanoi"]));

    expect(result.current[0]).toEqual(["Hanoi"]);
    expect(JSON.parse(localStorage.getItem("history")!)).toEqual(["Hanoi"]);
  });

  it("falls back to the initial value when stored JSON is corrupted", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    localStorage.setItem("history", "{not-json");

    const { result } = renderHook(() => useLocalStorage<string[]>("history", []));

    expect(result.current[0]).toEqual([]);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
