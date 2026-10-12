import { type ExecutionContext, SetMetadata } from "@nestjs/common";
import { hours, minutes, seconds, type ThrottlerOptions } from "@nestjs/throttler";
import type { Request } from "express";

// Per client IP, applied to every route. Both windows must pass.
// - burst: the search box fires one request per keystroke (no debounce yet)
// - sustained: a normal session (dashboard + ~10 favorites + browsing) stays far below
export const BURST_LIMIT: ThrottlerOptions = { name: "burst", ttl: seconds(1), limit: 20 };
export const SUSTAINED_LIMIT: ThrottlerOptions = {
  name: "sustained",
  ttl: minutes(1),
  limit: 120,
};

// Credential endpoints (login, register) get two extra, much stricter limits.
const AUTH_RATE_LIMITED = "authRateLimited";
export const AuthRateLimited = () => SetMetadata(AUTH_RATE_LIMITED, true);
const notCredentialRoute = (context: ExecutionContext) =>
  !Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler());

// Password guessing from one IP
export const AUTH_IP_LIMIT: ThrottlerOptions = {
  name: "auth",
  ttl: minutes(1),
  limit: 5,
  skipIf: notCredentialRoute,
};

// Guessing one account's password from many IPs (botnet / rotating proxies)
export const AUTH_EMAIL_LIMIT: ThrottlerOptions = {
  name: "authEmail",
  ttl: hours(1),
  limit: 10,
  skipIf: notCredentialRoute,
  getTracker: (req: Record<string, unknown>) => {
    const email = (req as unknown as Request).body?.email;
    return typeof email === "string"
      ? `email:${email.trim().toLowerCase()}`
      : `ip:${String(req.ip)}`;
  },
};
