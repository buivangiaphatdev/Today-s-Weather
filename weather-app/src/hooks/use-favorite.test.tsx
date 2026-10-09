import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";
import { useFavorites } from "./use-favorite";

const hanoi = { name: "Hanoi", country: "VN", lat: 21.03, lon: 105.85 };

function renderFavorites() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  // Two instances, like FavoriteButton and the header's CitySearch using the hook at the same time
  return renderHook(() => ({ button: useFavorites(), list: useFavorites() }), { wrapper });
}

describe("useFavorites", () => {
  it("starts with an empty list", () => {
    const { result } = renderFavorites();

    expect(result.current.list.favorites).toEqual([]);
    expect(result.current.button.isFavorite(hanoi.lat, hanoi.lon)).toBe(false);
  });

  it("adds a city and persists it to localStorage", async () => {
    const { result } = renderFavorites();

    await act(() => result.current.button.addFavorite.mutateAsync(hanoi));

    await waitFor(() => expect(result.current.list.favorites).toHaveLength(1));
    expect(result.current.list.favorites[0]).toMatchObject({ ...hanoi, id: "21.03-105.85" });
    expect(result.current.button.isFavorite(hanoi.lat, hanoi.lon)).toBe(true);
    expect(JSON.parse(localStorage.getItem("favorites")!)).toHaveLength(1);
  });

  it("does not add the same city twice", async () => {
    const { result } = renderFavorites();

    await act(() => result.current.button.addFavorite.mutateAsync(hanoi));
    await act(() => result.current.button.addFavorite.mutateAsync(hanoi));

    await waitFor(() => expect(result.current.list.favorites).toHaveLength(1));
  });

  it("removes a city by id", async () => {
    const { result } = renderFavorites();

    await act(() => result.current.button.addFavorite.mutateAsync(hanoi));
    await act(() => result.current.button.removeFavorite.mutateAsync("21.03-105.85"));

    await waitFor(() => expect(result.current.list.favorites).toEqual([]));
    expect(result.current.button.isFavorite(hanoi.lat, hanoi.lon)).toBe(false);
  });

  it("keeps every hook instance in sync after a change", async () => {
    const { result } = renderFavorites();

    await act(() => result.current.button.addFavorite.mutateAsync(hanoi));

    await waitFor(() => expect(result.current.list.favorites).toHaveLength(1));
    expect(result.current.list.isFavorite(hanoi.lat, hanoi.lon)).toBe(true);
  });

  it("loads favorites saved in a previous session", () => {
    localStorage.setItem(
      "favorites",
      JSON.stringify([{ ...hanoi, id: "21.03-105.85", addedAt: 1 }]),
    );

    const { result } = renderFavorites();

    expect(result.current.list.favorites).toHaveLength(1);
  });
});
