import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { Request } from "express";
import { CSRF_HEADER } from "./auth.constants";
import type { AccessTokenPayload } from "./token.service";

export interface AuthenticatedUser {
  id: string;
}

type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

// Protects routes with the short-lived access token: `Authorization: Bearer <jwt>`
@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const [scheme, token] = (req.headers.authorization ?? "").split(" ");
    if (scheme !== "Bearer" || !token) throw new UnauthorizedException("Missing access token");

    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
      req.user = { id: payload.sub };
      return true;
    } catch {
      // Expired or tampered: the client refreshes and retries once
      throw new UnauthorizedException("Invalid or expired access token");
    }
  }
}

// See CSRF_HEADER in auth.constants.ts
@Injectable()
export class CsrfHeaderGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers[CSRF_HEADER]) throw new ForbiddenException(`Missing ${CSRF_HEADER} header`);
    return true;
  }
}

// @CurrentUser() user: AuthenticatedUser (use with AccessTokenGuard)
export const CurrentUser = createParamDecorator(
  (_: unknown, context: ExecutionContext): AuthenticatedUser => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    if (!user) throw new UnauthorizedException();
    return user;
  },
);
