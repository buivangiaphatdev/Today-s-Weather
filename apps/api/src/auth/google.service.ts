import { createHash, randomBytes } from "node:crypto";
import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

const AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleIdentity {
  sub: string;
  email: string;
  name?: string;
}

export class GoogleSignInError extends Error {}

const base64url = (bytes: Buffer) => bytes.toString("base64url");

// Authorization code flow with PKCE. The ID token comes straight from Google's token
// endpoint over TLS, authenticated with our client secret, so per OpenID Connect
// Core 3.1.3.7 its signature check may be replaced by TLS; issuer, audience, expiry
// and email_verified are still checked.
@Injectable()
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);
  private readonly clientId?: string;
  private readonly clientSecret?: string;
  private readonly redirectUri?: string;

  constructor(
    config: ConfigService<Env, true>,
    private readonly prisma: PrismaService,
  ) {
    this.clientId = config.get("GOOGLE_CLIENT_ID", { infer: true });
    this.clientSecret = config.get("GOOGLE_CLIENT_SECRET", { infer: true });
    const apiUrl = config.get("API_PUBLIC_URL", { infer: true });
    this.redirectUri = apiUrl ? `${apiUrl}/api/auth/google/callback` : undefined;
  }

  get enabled(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  // Returns Google's consent URL plus the state and PKCE verifier the caller keeps
  // (in a short-lived cookie) to check the callback
  start(): { url: string; state: string; verifier: string } {
    if (!this.enabled) throw new NotFoundException("Google sign-in is not configured");
    const state = base64url(randomBytes(16));
    const verifier = base64url(randomBytes(32));
    const challenge = base64url(createHash("sha256").update(verifier).digest());
    const params = new URLSearchParams({
      client_id: this.clientId!,
      redirect_uri: this.redirectUri!,
      response_type: "code",
      scope: "openid email profile",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return { url: `${AUTHORIZE_URL}?${params}`, state, verifier };
  }

  async identify(code: string, verifier: string): Promise<GoogleIdentity> {
    const response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: this.clientId!,
        client_secret: this.clientSecret!,
        redirect_uri: this.redirectUri!,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      this.logger.warn(`Google token exchange failed (${response.status})`);
      throw new GoogleSignInError("token exchange failed");
    }
    const { id_token: idToken } = (await response.json()) as { id_token?: string };
    const claims = JSON.parse(
      Buffer.from(idToken?.split(".")[1] ?? "", "base64url").toString() || "{}",
    ) as Record<string, unknown>;

    const valid =
      ISSUERS.includes(String(claims.iss)) &&
      claims.aud === this.clientId &&
      typeof claims.exp === "number" &&
      claims.exp * 1000 > Date.now() &&
      typeof claims.sub === "string" &&
      typeof claims.email === "string" &&
      // Only an address Google has verified may be linked to an existing account
      claims.email_verified === true;
    if (!valid) throw new GoogleSignInError("invalid id token");

    return {
      sub: claims.sub as string,
      email: (claims.email as string).trim().toLowerCase(),
      name: typeof claims.name === "string" ? claims.name.slice(0, 50) : undefined,
    };
  }

  // Google account already linked → that user. Otherwise an account with the same
  // (Google-verified) email gets linked; otherwise a new password-less account.
  async findOrCreateUser(identity: GoogleIdentity): Promise<string> {
    const provider = "google";
    const linked = await this.prisma.oAuthAccount.findUnique({
      where: { provider_providerAccountId: { provider, providerAccountId: identity.sub } },
    });
    if (linked) return linked.userId;

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email: identity.email } });
      const user =
        existing ??
        (await tx.user.create({
          data: { email: identity.email, name: identity.name, emailVerifiedAt: new Date() },
        }));
      // Pre-account hijacking: someone may have registered this email before its owner
      // (unverified, with a password they know). Google just proved who owns the
      // address, so that password and any sessions made with it are discarded.
      if (existing && !existing.emailVerifiedAt) {
        await tx.user.update({
          where: { id: existing.id },
          data: { emailVerifiedAt: new Date(), passwordHash: null },
        });
        await tx.refreshToken.updateMany({
          where: { userId: existing.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      await tx.oAuthAccount.create({
        data: { userId: user.id, provider, providerAccountId: identity.sub },
      });
      return user.id;
    });
  }
}
