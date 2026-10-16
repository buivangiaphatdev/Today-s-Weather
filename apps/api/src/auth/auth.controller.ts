import { Body, Controller, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import {
  type AuthResponse,
  loginSchema,
  type LoginInput,
  registerSchema,
  type RegisterInput,
} from "@weather/shared";
import type { Request, Response } from "express";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AuthRateLimited } from "../throttle/rate-limits";
import { REFRESH_COOKIE } from "./auth.constants";
import { AuthService } from "./auth.service";
import { CsrfHeaderGuard } from "./guards";
import { clearRefreshCookie, sendSession } from "./refresh-cookie";
import { RefreshTokenError } from "./token.service";
import { AccountEmailService } from "./account-email.service";
import { runInBackground } from "../common/background";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly accountEmail: AccountEmailService,
  ) {}

  // POST /api/auth/register { email, password, name? } -> 201 AuthResponse + refresh cookie
  @Post("register")
  @AuthRateLimited()
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(body, req.headers["user-agent"]);
    // After the response: the account works before the email is confirmed
    runInBackground("Verification email", this.accountEmail.sendVerification(result.user));
    return sendSession(res, result);
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
    return sendSession(res, await this.auth.login(body, req.headers["user-agent"]));
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
      return sendSession(res, await this.auth.refresh(token, req.headers["user-agent"]));
    } catch (error) {
      // A conflict means another tab just rotated: its newer cookie must survive
      if (error instanceof RefreshTokenError && error.code === "invalid_refresh_token") {
        clearRefreshCookie(res);
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
    clearRefreshCookie(res);
  }
}
