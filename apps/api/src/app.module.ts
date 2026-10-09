import { Module, RequestMethod } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import { LoggerModule } from "nestjs-pino";
import { type Env, validateEnv } from "./config/env";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        // Express 5 route syntax; the library default "*" triggers a legacy-path warning
        forRoutes: [{ path: "{*path}", method: RequestMethod.ALL }],
        pinoHttp: {
          level: config.get("LOG_LEVEL", { infer: true }),
          // Human-readable logs locally, JSON lines elsewhere (log platforms parse JSON)
          transport:
            config.get("NODE_ENV", { infer: true }) === "development"
              ? { target: "pino-pretty", options: { singleLine: true } }
              : undefined,
          // Headers are never logged, so cookies and tokens cannot leak into logs
          serializers: {
            req: (req: IncomingMessage & { id: unknown }) => ({
              id: req.id,
              method: req.method,
              url: req.url,
            }),
            res: (res: ServerResponse) => ({ statusCode: res.statusCode }),
          },
        },
      }),
    }),
  ],
})
export class AppModule {}
