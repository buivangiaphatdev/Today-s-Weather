import type { AuthResponse } from "@weather/shared";
import type { CookieOptions, Response } from "express";
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import type { AuthResult } from "./auth.service";

const refreshCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  partitioned: true,
  path: REFRESH_COOKIE_PATH,
};

// Sets the refresh cookie and returns the body for the client (access token + profile)
export function sendSession(res: Response, { response, refreshToken }: AuthResult): AuthResponse {
  res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookie, maxAge: REFRESH_TOKEN_TTL_MS });
  res.setHeader("Cache-Control", "no-store");
  return response;
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, refreshCookie);
}
