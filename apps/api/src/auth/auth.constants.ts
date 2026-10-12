export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// Refresh token cookie (option C, see docs/ROADMAP.md): web and API are different sites
// on vercel.app, so the cookie is SameSite=None + Partitioned (CHIPS). Path-scoped so
// it is only sent to /api/auth/*, never to weather endpoints.
export const REFRESH_COOKIE = "rt";
export const REFRESH_COOKIE_PATH = "/api/auth";

// Two tabs refreshing at once both present the same token; the slower one finds it
// already rotated. Within this window that is a race, not theft: answer 401 without
// revoking the family, and the client retries with the new cookie.
export const ROTATION_GRACE_MS = 30_000;

// Cookie-authenticated endpoints require this header. Browsers cannot add custom
// headers to cross-site form posts, and cross-origin fetches with it need a CORS
// preflight that only allowed origins pass: a cheap, robust CSRF defence.
export const CSRF_HEADER = "x-requested-with";

export const JWT_ISSUER = "todays-weather-api";
export const JWT_AUDIENCE = "todays-weather-web";
