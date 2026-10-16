import { Body, Controller, Get, HttpCode, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import {
  type AuthProviders,
  type AuthResponse,
  type OAuthExchangeInput,
  oauthExchangeSchema,
} from "@weather/shared";
import type { CookieOptions, Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { Env } from "../config/env";
import { AuthRateLimited } from "../throttle/rate-limits";
import { AuthService } from "./auth.service";
import { GoogleService } from "./google.service";
import { CsrfHeaderGuard } from "./guards";
import { OneTimeTokenService } from "./one-time-token.service";
import { sendSession } from "./refresh-cookie";

// state + PKCE verifier between /google and /google/callback. Both requests are
// top-level navigations on the API's own site, so a first-party Lax cookie works.
const FLOW_COOKIE = "g_oauth";
const flowCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "lax",
  path: "/api/auth/google",
};

@Controller("auth")
export class GoogleController {
  private readonly webUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly google: GoogleService,
    private readonly auth: AuthService,
    private readonly tokens: OneTimeTokenService,
  ) {
    this.webUrl = config.get("WEB_URL", { infer: true });
  }

  // GET /api/auth/providers -> which sign-in buttons the web should show
  @Get("providers")
  @SkipThrottle({ burst: true, sustained: true })
  providers(): AuthProviders {
    return { google: this.google.enabled };
  }

  // GET /api/auth/google -> 302 to Google's consent screen
  @Get("google")
  start(@Res() res: Response) {
    const { url, state, verifier } = this.google.start();
    res.cookie(FLOW_COOKIE, `${state}.${verifier}`, { ...flowCookie, maxAge: 10 * 60 * 1000 });
    res.redirect(302, url);
  }

  // GET /api/auth/google/callback -> 302 to the web app with a 60-second one-time code.
  // The session cookie is NOT set here: this page is on the API's site, and a
  // Partitioned cookie set now would land in the wrong partition for the web app.
  @Get("google/callback")
  async callback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const [expectedState, verifier] = String(req.cookies?.[FLOW_COOKIE] ?? "").split(".");
    res.clearCookie(FLOW_COOKIE, flowCookie);
    const fail = () => res.redirect(302, `${this.webUrl}/login#error=google`);

    // Missing/mismatched state: CSRF or a stale tab. Denied consent arrives without code.
    if (!code || !state || !expectedState || state !== expectedState || !verifier) return fail();
    try {
      const identity = await this.google.identify(code, verifier);
      const userId = await this.google.findOrCreateUser(identity);
      const handOff = await this.tokens.issue(userId, "oauth_login");
      return res.redirect(302, `${this.webUrl}/auth/callback#code=${handOff}`);
    } catch {
      return fail();
    }
  }

  // POST /api/auth/google/exchange { code } (from the web page) -> session + cookie
  @Post("google/exchange")
  @HttpCode(200)
  @UseGuards(CsrfHeaderGuard)
  @AuthRateLimited()
  async exchange(
    @Body(new ZodValidationPipe(oauthExchangeSchema)) body: OAuthExchangeInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const userId = await this.tokens.consume(body.code, "oauth_login");
    return sendSession(res, await this.auth.signInUser(userId, req.headers["user-agent"]));
  }
}
