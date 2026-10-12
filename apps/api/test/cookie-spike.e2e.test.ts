import type { INestApplication } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";

// TEMPORARY (P2-00): remove together with src/auth/cookie-spike.controller.ts
describe("Cookie spike", () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const setCookies = (res: request.Response) => res.headers["set-cookie"] as unknown as string[];

  it("sets one partitioned and one plain cross-site cookie", async () => {
    const res = await http().post("/api/auth/spike").set("Origin", "http://localhost:5173");

    expect(res.status).toBe(200);
    expect(res.headers["access-control-allow-credentials"]).toBe("true");
    const [partitioned, plain] = setCookies(res);
    for (const cookie of [partitioned, plain]) {
      expect(cookie).toMatch(/; Path=\/api\/auth/);
      expect(cookie).toMatch(/; HttpOnly/);
      expect(cookie).toMatch(/; Secure/);
      expect(cookie).toMatch(/; SameSite=None/);
      expect(cookie).toMatch(/; Max-Age=3600/);
    }
    expect(partitioned).toMatch(/^spike_partitioned=.*; Partitioned/);
    expect(plain).toMatch(/^spike_plain=/);
    expect(plain).not.toMatch(/Partitioned/);
  });

  it("reports which cookies the browser sent back", async () => {
    const res = await http()
      .get("/api/auth/spike")
      .set("Cookie", "spike_partitioned=2026-10-12T00%3A00%3A00.000Z; other=1");

    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body).toEqual({ partitioned: "2026-10-12T00:00:00.000Z", plain: null });
  });

  it("clears both cookies", async () => {
    const res = await http().delete("/api/auth/spike");

    expect(res.status).toBe(204);
    const cleared = setCookies(res);
    expect(cleared).toHaveLength(2);
    expect(cleared.every((cookie) => /Expires=Thu, 01 Jan 1970/.test(cookie))).toBe(true);
    expect(cleared[0]).toMatch(/Partitioned/);
  });
});
