import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, getSession, refreshSession, setSession } from "./http";
import type { AuthResponse } from "./types";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const session = (accessToken: string): AuthResponse => ({
  accessToken,
  expiresIn: 900,
  user: {
    id: "u1",
    email: "an@example.com",
    name: null,
    emailVerified: false,
    settings: { units: "metric", language: "vi", theme: "system" },
    createdAt: "2026-10-12T00:00:00.000Z",
  },
});

describe("API client session handling", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const calls = () => fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? "GET"} ${url}`);

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    setSession(null);
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("sends the access token as a Bearer header", async () => {
    setSession(session("token-1"));
    fetchMock.mockResolvedValue(json([]));

    await apiFetch("/favorites");

    const headers = fetchMock.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer token-1");
  });

  it("refreshes once on 401 and retries the request with the new token", async () => {
    setSession(session("expired"));
    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json(session("fresh")))
      .mockResolvedValueOnce(json([{ id: "f1" }]));

    const result = await apiFetch("/favorites");

    expect(result).toEqual([{ id: "f1" }]);
    expect(calls()).toEqual(["GET /api/favorites", "POST /api/auth/refresh", "GET /api/favorites"]);
    const retryHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(retryHeaders.Authorization).toBe("Bearer fresh");
  });

  it("sends the refresh cookie and the CSRF header on refresh", async () => {
    fetchMock.mockResolvedValue(json(session("fresh")));

    await refreshSession();

    const init = fetchMock.mock.calls[0][1]!;
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe("fetch");
  });

  it("shares one refresh between concurrent callers (no double rotation)", async () => {
    fetchMock.mockResolvedValue(json(session("fresh")));

    const results = await Promise.all([refreshSession(), refreshSession(), refreshSession()]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.every((r) => r?.accessToken === "fresh")).toBe(true);
  });

  it("retries once when another tab rotated the token first (refresh_conflict)", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ code: "refresh_conflict", message: "x" }, 401))
      .mockResolvedValueOnce(json(session("fresh")));

    const result = await refreshSession();

    expect(result?.accessToken).toBe("fresh");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("signs out when the refresh token is rejected", async () => {
    setSession(session("expired"));
    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ code: "invalid_refresh_token", message: "x" }, 401));

    await expect(apiFetch("/favorites")).rejects.toMatchObject({ status: 401 });
    expect(getSession()).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2); // no retry without a new token
  });
});
