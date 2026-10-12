import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { PrismaService } from "../prisma/prisma.service";
import { REFRESH_TOKEN_TTL_MS, ROTATION_GRACE_MS } from "./auth.constants";

export interface AccessTokenPayload {
  sub: string; // user id
}

const sha256 = (token: string) => createHash("sha256").update(token).digest("hex");

// 401 with a machine-readable code so the web client can react differently:
// "refresh_conflict" → retry once (another tab rotated first); anything else → signed out
export class RefreshTokenError extends UnauthorizedException {
  constructor(readonly code: "invalid_refresh_token" | "refresh_conflict") {
    super({
      statusCode: 401,
      error: "Unauthorized",
      message: "Session expired, please sign in again",
      code,
    });
  }
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  signAccessToken(userId: string): Promise<string> {
    return this.jwt.signAsync({ sub: userId } satisfies AccessTokenPayload);
  }

  // Opaque 256-bit token; only its SHA-256 is stored, so a database leak yields no
  // usable tokens. A new family starts at each sign-in (one family = one device session).
  async issueRefreshToken(
    userId: string,
    userAgent?: string,
    familyId: string = randomUUID(),
  ): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await this.prisma.refreshToken.create({
      data: {
        userId,
        familyId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        userAgent: userAgent?.slice(0, 255),
      },
    });
    return token;
  }

  // Exchanges a refresh token for a new one (rotation). Presenting a token that was
  // already rotated means it was copied: the whole family is revoked, signing out
  // both the attacker and the victim's device, unless it happened seconds ago (race).
  async rotate(
    token: string,
    userAgent?: string,
  ): Promise<{ userId: string; refreshToken: string }> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    const now = new Date();

    if (!current || current.expiresAt <= now) throw new RefreshTokenError("invalid_refresh_token");

    if (current.revokedAt) {
      const rotatedRecently =
        current.replacedById !== null &&
        now.getTime() - current.revokedAt.getTime() < ROTATION_GRACE_MS;
      if (rotatedRecently) throw new RefreshTokenError("refresh_conflict");

      await this.revokeFamily(current.familyId);
      this.logger.warn(`Refresh token reuse detected: family ${current.familyId} revoked`);
      throw new RefreshTokenError("invalid_refresh_token");
    }

    const next = randomBytes(32).toString("base64url");
    await this.prisma.$transaction(async (tx) => {
      // Atomic claim: if a concurrent request rotated this token first, count is 0
      const claimed = await tx.refreshToken.updateMany({
        where: { id: current.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (claimed.count === 0) throw new RefreshTokenError("refresh_conflict");

      const created = await tx.refreshToken.create({
        data: {
          userId: current.userId,
          familyId: current.familyId,
          tokenHash: sha256(next),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
          userAgent: userAgent?.slice(0, 255),
        },
      });
      await tx.refreshToken.update({
        where: { id: current.id },
        data: { replacedById: created.id },
      });
    });

    return { userId: current.userId, refreshToken: next };
  }

  // Sign out of one device session (the token's family). Unknown tokens are ignored.
  async revokeByToken(token: string): Promise<void> {
    const current = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(token) },
    });
    if (current) await this.revokeFamily(current.familyId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
