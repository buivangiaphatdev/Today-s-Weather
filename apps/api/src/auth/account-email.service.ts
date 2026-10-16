import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import type { User } from "../generated/prisma/client";
import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { OneTimeTokenService } from "./one-time-token.service";
import { PasswordService } from "./password.service";

// Links point at the web app, with the token in the URL fragment (#token=...):
// fragments are never sent to servers or leaked in Referer headers. The web page
// then posts the token to the API.
@Injectable()
export class AccountEmailService {
  private readonly logger = new Logger(AccountEmailService.name);
  private readonly webUrl: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
    private readonly tokens: OneTimeTokenService,
    private readonly passwords: PasswordService,
    private readonly mail: MailService,
  ) {
    this.webUrl = config.get("WEB_URL", { infer: true });
  }

  async sendVerification(user: Pick<User, "id" | "email" | "emailVerifiedAt">): Promise<void> {
    if (user.emailVerifiedAt) return;
    const link = `${this.webUrl}/verify-email#token=${await this.tokens.issue(user.id, "verify_email")}`;
    await this.mail.send({
      to: user.email,
      subject: "Confirm your email for Today's Weather",
      text: `Confirm your email address by opening this link (valid for 24 hours):\n\n${link}\n\nIf you did not create an account, ignore this email.`,
      html: `<p>Confirm your email address for <b>Today's Weather</b>:</p><p><a href="${link}">Confirm email</a></p><p style="color:#666">The link is valid for 24 hours. If you did not create an account, ignore this email.</p>`,
    });
  }

  async verifyEmail(token: string): Promise<void> {
    const userId = await this.tokens.consume(token, "verify_email");
    await this.prisma.user.updateMany({
      where: { id: userId, emailVerifiedAt: null },
      data: { emailVerifiedAt: new Date() },
    });
  }

  // Same outcome whether or not the email has an account (no account enumeration)
  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return;
    const link = `${this.webUrl}/reset-password#token=${await this.tokens.issue(user.id, "reset_password")}`;
    await this.mail
      .send({
        to: user.email,
        subject: "Reset your Today's Weather password",
        text: `Choose a new password by opening this link (valid for 1 hour):\n\n${link}\n\nIf you did not ask for this, ignore this email; your password stays the same.`,
        html: `<p>Choose a new password for <b>Today's Weather</b>:</p><p><a href="${link}">Reset password</a></p><p style="color:#666">The link is valid for 1 hour. If you did not ask for this, ignore this email; your password stays the same.</p>`,
      })
      .catch((error: unknown) =>
        this.logger.error(`Password reset email failed: ${String(error)}`),
      );
  }

  // New password; signs out every device (a reset usually means the old password or a
  // device may be compromised). Opening the emailed link also proves the address.
  async resetPassword(token: string, password: string): Promise<void> {
    const userId = await this.tokens.consume(token, "reset_password");
    const passwordHash = await this.passwords.hash(password);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.user.updateMany({
        where: { id: userId, emailVerifiedAt: null },
        data: { emailVerifiedAt: now },
      }),
      this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      }),
    ]);
  }
}
