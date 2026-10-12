import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { z } from "zod";
import { AccessTokenGuard } from "../auth/guards";

// Per-user responses are private: browsers and CDNs must never cache or share them.
// (An interceptor because Nest's @Header() only works on methods, not controllers.)
@Injectable()
class PrivateNoStoreInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    context.switchToHttp().getResponse<Response>().setHeader("Cache-Control", "private, no-store");
    return next.handle();
  }
}

// For controllers serving the signed-in user's data
export const UserData = () =>
  applyDecorators(UseGuards(AccessTokenGuard), UseInterceptors(PrivateNoStoreInterceptor));

export const idParam = z.uuid();
