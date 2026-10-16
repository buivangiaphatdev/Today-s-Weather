import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
  type ResetPasswordInput,
  resetPasswordSchema,
  type VerifyEmailInput,
  verifyEmailSchema,
} from "@weather/shared";
import { runInBackground } from "../common/background";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PrismaService } from "../prisma/prisma.service";
import { AuthRateLimited } from "../throttle/rate-limits";
import { AccountEmailService } from "./account-email.service";
import { AccessTokenGuard, type AuthenticatedUser, CurrentUser } from "./guards";

@Controller("auth")
export class AccountEmailController {
  constructor(
    private readonly accountEmail: AccountEmailService,
    private readonly prisma: PrismaService,
  ) {}

  // POST /api/auth/verify-email { token } -> 204 (400 if invalid, expired or used)
  @Post("verify-email")
  @HttpCode(204)
  @AuthRateLimited()
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    return this.accountEmail.verifyEmail(body.token);
  }

  // POST /api/auth/verify-email/resend (signed in) -> 202
  @Post("verify-email/resend")
  @HttpCode(202)
  @UseGuards(AccessTokenGuard)
  @AuthRateLimited()
  async resendVerification(@CurrentUser() current: AuthenticatedUser): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: current.id } });
    await this.accountEmail.sendVerification(user);
  }

  // POST /api/auth/password/forgot { email } -> always 202, sent or not, answered at the
  // same speed (the email is sent after the response): no account enumeration
  @Post("password/forgot")
  @HttpCode(202)
  @AuthRateLimited()
  forgotPassword(@Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput) {
    runInBackground("Password reset", this.accountEmail.requestPasswordReset(body.email));
  }

  // POST /api/auth/password/reset { token, password } -> 204; every device is signed out
  @Post("password/reset")
  @HttpCode(204)
  @AuthRateLimited()
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.accountEmail.resetPassword(body.token, body.password);
  }
}
