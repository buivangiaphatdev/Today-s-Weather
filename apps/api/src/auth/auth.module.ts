import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import type { Env } from "../config/env";
import { ACCESS_TOKEN_TTL_SECONDS, JWT_AUDIENCE, JWT_ISSUER } from "./auth.constants";
import { MailService } from "../mail/mail.service";
import { AccountEmailController } from "./account-email.controller";
import { AccountEmailService } from "./account-email.service";
import { AuthController } from "./auth.controller";
import { GoogleController } from "./google.controller";
import { GoogleService } from "./google.service";
import { OneTimeTokenService } from "./one-time-token.service";
import { AuthService } from "./auth.service";
import { AccessTokenGuard } from "./guards";
import { PasswordService } from "./password.service";
import { TokenService } from "./token.service";

// Global so feature modules (me, favorites, history) can use AccessTokenGuard
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get("JWT_SECRET", { infer: true }),
        signOptions: {
          algorithm: "HS256",
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
        },
        // Pin the algorithm so a token signed with "none" or another alg is rejected
        verifyOptions: { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
      }),
    }),
  ],
  controllers: [AuthController, AccountEmailController, GoogleController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    AccessTokenGuard,
    OneTimeTokenService,
    AccountEmailService,
    GoogleService,
    MailService,
  ],
  exports: [AccessTokenGuard, JwtModule],
})
export class AuthModule {}
