import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import type { AuthResponse, LoginInput, RegisterInput } from "@weather/shared";
import { Prisma, type User } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { toUserProfile } from "../users/user-profile";
import { ACCESS_TOKEN_TTL_SECONDS } from "./auth.constants";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

export interface AuthResult {
  response: AuthResponse;
  refreshToken: string;
}

export interface RegisterResult extends AuthResult {
  user: User;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(
    { email, password, name }: RegisterInput,
    userAgent?: string,
  ): Promise<RegisterResult> {
    const passwordHash = await this.passwords.hash(password);
    const user = await this.prisma.user
      .create({ data: { email, passwordHash, name } })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw new ConflictException("This email is already registered");
        }
        throw error;
      });
    const result = await this.signIn(user, await this.tokens.issueRefreshToken(user.id, userAgent));
    return { ...result, user };
  }

  // New session for a user already authenticated another way (Google sign-in)
  async signInUser(userId: string, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return this.signIn(user, await this.tokens.issueRefreshToken(user.id, userAgent));
  }

  async login({ email, password }: LoginInput, userAgent?: string): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // One message for "no such account" and "wrong password": no account enumeration
    if (!(await this.passwords.verify(user?.passwordHash ?? null, password)) || !user) {
      throw new UnauthorizedException("Invalid email or password");
    }
    return this.signIn(user, await this.tokens.issueRefreshToken(user.id, userAgent));
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<AuthResult> {
    const rotated = await this.tokens.rotate(refreshToken, userAgent);
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: rotated.userId } });
    return this.signIn(user, rotated.refreshToken);
  }

  logout(refreshToken: string | undefined): Promise<void> {
    return refreshToken ? this.tokens.revokeByToken(refreshToken) : Promise.resolve();
  }

  private async signIn(user: User, refreshToken: string): Promise<AuthResult> {
    return {
      response: {
        accessToken: await this.tokens.signAccessToken(user.id),
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        user: toUserProfile(user),
      },
      refreshToken,
    };
  }
}
