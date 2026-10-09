import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { weatherAPI } from "../api/weather";
import { SEARCH_DEBOUNCE_MS, useLocationSearch } from "./use-weather";

function renderSearch(initialQuery: string) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(({ query }) => useLocationSearch(query), {
    wrapper,
    initialProps: { query: initialQuery },
  });
}

describe("useLocationSearch", () => {
  const search = vi.spyOn(weatherAPI, "searchLocations");

  beforeEach(() => {
    vi.useFakeTimers();
    search.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    search.mockReset();
  });

  it("sends one request after the user stops typing, not one per key", async () => {
    const { rerender } = renderSearch("");

    for (const query of ["H", "Ha", "Han", "Hano", "Hanoi"]) {
      rerender({ query });
      await act(() => vi.advanceTimersByTimeAsync(50));
    }
    expect(search).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));

    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith("Hanoi");
  });

  it("does not search for fewer than 3 characters", async () => {
    renderSearch("Ha");

    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2));

    expect(search).not.toHaveBeenCalled();
  });

  it("ignores surrounding spaces", async () => {
    renderSearch("  Hue  ");

    await act(() => vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS));

    expect(search).toHaveBeenCalledWith("Hue");
  });
});
