import { createHash, randomBytes } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { OneTimeTokenPurpose } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

export const ONE_TIME_TOKEN_TTL_MS: Record<OneTimeTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 60 * 60 * 1000,
  oauth_login: 60 * 1000,
};

// Single-use secrets for email links and the Google sign-in hand-off
@Injectable()
export class OneTimeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  // Issuing a new token voids older unused ones of the same purpose: only the latest
  // email link works
  async issue(userId: string, purpose: OneTimeTokenPurpose): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.oneTimeToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: now },
      }),
      this.prisma.oneTimeToken.create({
        data: {
          userId,
          purpose,
          tokenHash: sha256(token),
          expiresAt: new Date(now.getTime() + ONE_TIME_TOKEN_TTL_MS[purpose]),
        },
      }),
    ]);
    return token;
  }

  // Returns the user id and marks the token used, atomically: the same link cannot
  // be used twice even by two simultaneous requests
  async consume(token: string, purpose: OneTimeTokenPurpose): Promise<string> {
    const row = await this.prisma.oneTimeToken.findUnique({ where: { tokenHash: sha256(token) } });
    const now = new Date();
    const valid = row && row.purpose === purpose && !row.usedAt && row.expiresAt > now;
    if (valid) {
      const { count } = await this.prisma.oneTimeToken.updateMany({
        where: { id: row.id, usedAt: null },
        data: { usedAt: now },
      });
      if (count === 1) return row.userId;
    }
    throw new BadRequestException("This link is invalid or has expired");
  }
}
