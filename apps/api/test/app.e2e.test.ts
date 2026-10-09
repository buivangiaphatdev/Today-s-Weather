import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";

// Env comes from vitest.config.mts (CORS_ORIGINS=http://localhost:5173)
describe("HTTP pipeline", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("sets security headers and hides the framework", async () => {
    const res = await request(app.getHttpServer()).get("/api/unknown");

    expect(res.status).toBe(404);
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["content-security-policy"]).toBeDefined();
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("allows CORS from a configured origin", async () => {
    const res = await request(app.getHttpServer())
      .options("/api/weather/current")
      .set("Origin", "http://localhost:5173")
      .set("Access-Control-Request-Method", "GET");

    expect(res.status).toBe(204);
    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("does not allow CORS from other origins", async () => {
    const res = await request(app.getHttpServer())
      .options("/api/weather/current")
      .set("Origin", "https://evil.example")
      .set("Access-Control-Request-Method", "GET");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
