import type { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import { Logger } from "nestjs-pino";
import type { Env } from "./config/env";

// Shared by main.ts and e2e tests so both run the exact same HTTP pipeline
export function configureApp(app: INestApplication): INestApplication {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.get("CORS_ORIGINS", { infer: true }),
    credentials: true, // refresh-token cookie in phase 2
  });
  app.setGlobalPrefix("api");
  app.enableShutdownHooks();

  return app;
}
