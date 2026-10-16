import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setSession } from "../api/http";
import { AuthProvider } from "../context/auth-provider";
import { ThemeProvider } from "../context/theme-provider";
import SettingsPage from "./SettingsPage";

describe("SettingsPage (signed out)", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    setSession(null);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    // No refresh cookie: signed out
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ code: "invalid_refresh_token" }), { status: 401 }),
    );
    render(
      <QueryClientProvider client={new QueryClient()}>
        <AuthProvider>
          <ThemeProvider>
            <MemoryRouter>
              <SettingsPage />
            </MemoryRouter>
          </ThemeProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("saves units on this device without calling the API", async () => {
    await screen.findByText(/Saved on this device/);

    fireEvent.click(screen.getByRole("radio", { name: /Imperial/ }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem("settings")!)).toMatchObject({ units: "imperial" }),
    );
    expect(screen.getByRole("radio", { name: /Imperial/ })).toHaveAttribute("aria-checked", "true");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/me/settings"))).toBe(false);
  });

  it("applies the theme immediately", async () => {
    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });
});
