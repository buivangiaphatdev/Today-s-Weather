import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  type AuthResponse,
  loginSchema,
  type LoginInput,
  registerSchema,
  type RegisterInput,
} from "@weather/shared";
import type { CookieOptions, Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthRateLimited } from "../throttle/rate-limits";
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH, REFRESH_TOKEN_TTL_MS } from "./auth.constants";
import { type AuthResult, AuthService } from "./auth.service";
import { CsrfHeaderGuard } from "./guards";
import { RefreshTokenError } from "./token.service";

const refreshCookie: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  partitioned: true,
  path: REFRESH_COOKIE_PATH,
};

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // POST /api/auth/register { email, password, name? } -> 201 AuthResponse + refresh cookie
  @Post("register")
  @AuthRateLimited()
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.signedIn(res, await this.auth.register(body, req.headers["user-agent"]));
  }

  // POST /api/auth/login { email, password } -> AuthResponse + refresh cookie
  @Post("login")
  @HttpCode(200)
  @AuthRateLimited()
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    return this.signedIn(res, await this.auth.login(body, req.headers["user-agent"]));
  }

  // POST /api/auth/refresh (cookie) -> new access token + rotated refresh cookie
  @Post("refresh")
  @HttpCode(200)
  @UseGuards(CsrfHeaderGuard)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new RefreshTokenError("invalid_refresh_token");
    try {
      return this.signedIn(res, await this.auth.refresh(token, req.headers["user-agent"]));
    } catch (error) {
      // A conflict means another tab just rotated: its newer cookie must survive
      if (error instanceof RefreshTokenError && error.code === "invalid_refresh_token") {
        res.clearCookie(REFRESH_COOKIE, refreshCookie);
      }
      throw error;
    }
  }

  // POST /api/auth/logout (cookie) -> 204, ends this device's session
  @Post("logout")
  @HttpCode(204)
  @UseGuards(CsrfHeaderGuard)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    res.clearCookie(REFRESH_COOKIE, refreshCookie);
  }

  private signedIn(res: Response, { response, refreshToken }: AuthResult): AuthResponse {
    res.cookie(REFRESH_COOKIE, refreshToken, { ...refreshCookie, maxAge: REFRESH_TOKEN_TTL_MS });
    res.setHeader("Cache-Control", "no-store");
    return response;
  }
}
