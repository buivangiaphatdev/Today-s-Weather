import type { AuthResponse } from "./types";
import { API_BASE_URL } from "./config";

// Thrown for non-2xx responses; `message` is the API's own message (safe to show)
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as {
    message?: unknown;
    code?: unknown;
  } | null;
  const message =
    typeof body?.message === "string" ? body.message : `Request failed (${response.status})`;
  return new ApiError(
    response.status,
    message,
    typeof body?.code === "string" ? body.code : undefined,
  );
}

// ---- Session -------------------------------------------------------------------
// The access token lives only in memory (never localStorage, so injected scripts
// cannot read it from storage). The refresh token is an HttpOnly cookie the browser
// sends to /api/auth/* only; JavaScript never sees it.

let session: AuthResponse | null = null;
const listeners = new Set<(session: AuthResponse | null) => void>();

export const getSession = () => session;

export function setSession(next: AuthResponse | null) {
  session = next;
  listeners.forEach((listener) => listener(next));
}

export function onSessionChange(listener: (session: AuthResponse | null) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Cookie-authenticated calls: cross-site cookie (credentials) + the CSRF header the
// API requires on /refresh and /logout
export function authFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API_BASE_URL}/api/auth${path}`, {
    ...init,
    credentials: "include",
    headers: { "X-Requested-With": "fetch", ...init.headers },
  });
}

const CONFLICT_RETRY_MS = 300;
let refreshing: Promise<AuthResponse | null> | null = null;

// Exchanges the refresh cookie for a new access token. Concurrent callers share one
// request: rotating the same refresh token twice would look like token theft.
export function refreshSession(): Promise<AuthResponse | null> {
  refreshing ??= (async () => {
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const response = await authFetch("/refresh", { method: "POST" });
        if (response.ok) {
          const next = (await response.json()) as AuthResponse;
          setSession(next);
          return next;
        }
        const error = await toApiError(response);
        // Another tab rotated the token a moment ago; its new cookie is now ours too
        if (error.code === "refresh_conflict" && attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, CONFLICT_RETRY_MS));
          continue;
        }
        break;
      }
      setSession(null);
      return null;
    } catch {
      // Network error: keep whatever session we had, the caller decides
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ---- Authenticated API calls -----------------------------------------------------

export async function apiFetch<T>(
  path: string,
  { method = "GET", body }: { method?: string; body?: unknown } = {},
): Promise<T> {
  const send = (token: string | undefined) =>
    fetch(`${API_BASE_URL}/api${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let response = await send(session?.accessToken);
  // Access token expired (15 min): refresh once, then retry once
  if (response.status === 401) {
    const renewed = await refreshSession();
    if (renewed) response = await send(renewed.accessToken);
  }

  if (!response.ok) throw await toApiError(response);
  return (response.status === 204 ? undefined : await response.json()) as T;
}
