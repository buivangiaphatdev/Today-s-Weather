import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { type Mail, MailService } from "../src/mail/mail.service";
import { PrismaService } from "../src/prisma/prisma.service";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./helpers/test-database";

const PASSWORD = "first password 123";

describe.skipIf(!testDatabaseUrl)("Email verification and password reset", () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let counter = 0;
  const outbox: Mail[] = [];

  const http = () => {
    const ip = `192.0.2.${++counter % 250}`;
    const server = app.getHttpServer();
    return {
      post: (path: string) => request(server).post(path).set("X-Forwarded-For", ip),
    };
  };
  // Emails are sent after the response (background): wait for the next one to arrive
  const nextMail = async (to: string) => {
    await vi.waitFor(() => expect(outbox.some((mail) => mail.to === to)).toBe(true));
    return outbox.find((mail) => mail.to === to)!;
  };
  const tokenFrom = (mail: Mail) => /#token=([\w-]+)/.exec(mail.text)![1];

  const register = async () => {
    const email = `user-${++counter}@example.com`;
    const res = await http().post("/api/auth/register").send({ email, password: PASSWORD });
    return { email, accessToken: res.body.accessToken as string, res };
  };

  beforeAll(async () => {
    prisma = connectTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(MailService)
      .useValue({ send: async (mail: Mail) => void outbox.push(mail) })
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    app.set("trust proxy", true);
    await app.listen(0);
  }, 60_000);

  beforeEach(async () => {
    await truncateAll(prisma);
    outbox.length = 0;
  });

  afterAll(async () => {
    await app?.close();
    await prisma?.onModuleDestroy();
  });

  describe("verification", () => {
    it("emails a link to the web app after sign-up; the link verifies the address once", async () => {
      const { email } = await register();
      const mail = await nextMail(email);

      expect(mail.subject).toMatch(/Confirm your email/);
      expect(mail.text).toContain("http://localhost:5173/verify-email#token=");

      const token = tokenFrom(mail);
      expect((await http().post("/api/auth/verify-email").send({ token })).status).toBe(204);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
      ).not.toBeNull();
      // Single use
      expect((await http().post("/api/auth/verify-email").send({ token })).status).toBe(400);
    });

    it("stores only a hash of the token", async () => {
      const { email } = await register();
      const token = tokenFrom(await nextMail(email));

      const row = await prisma.oneTimeToken.findFirstOrThrow();
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(row.tokenHash).not.toBe(token);
    });

    it("a resent email voids the previous link", async () => {
      const { email, accessToken } = await register();
      const first = tokenFrom(await nextMail(email));
      outbox.length = 0;

      const resend = await http()
        .post("/api/auth/verify-email/resend")
        .set("Authorization", `Bearer ${accessToken}`);
      const second = tokenFrom(await nextMail(email));

      expect(resend.status).toBe(202);
      expect((await http().post("/api/auth/verify-email").send({ token: first })).status).toBe(400);
      expect((await http().post("/api/auth/verify-email").send({ token: second })).status).toBe(
        204,
      );
    });

    it("requires sign-in to resend", async () => {
      expect((await http().post("/api/auth/verify-email/resend")).status).toBe(401);
    });
  });

  describe("password reset", () => {
    it("answers 202 for unknown emails without sending anything", async () => {
      const res = await http()
        .post("/api/auth/password/forgot")
        .send({ email: "nobody@example.com" });

      expect(res.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(outbox).toHaveLength(0);
    });

    it("resets the password, signs every device out and proves the email", async () => {
      const { email, res } = await register();
      const oldCookie = (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
      await nextMail(email); // verification email
      outbox.length = 0;

      expect((await http().post("/api/auth/password/forgot").send({ email })).status).toBe(202);
      const mail = await nextMail(email);
      expect(mail.text).toContain("http://localhost:5173/reset-password#token=");

      const reset = await http()
        .post("/api/auth/password/reset")
        .send({ token: tokenFrom(mail), password: "brand new password" });
      expect(reset.status).toBe(204);

      // Old session is gone, old password no longer works, new one does
      const refresh = await http()
        .post("/api/auth/refresh")
        .set("X-Requested-With", "fetch")
        .set("Cookie", oldCookie);
      expect(refresh.status).toBe(401);
      expect(
        (await http().post("/api/auth/login").send({ email, password: PASSWORD })).status,
      ).toBe(401);
      expect(
        (await http().post("/api/auth/login").send({ email, password: "brand new password" }))
          .status,
      ).toBe(200);
      expect(
        (await prisma.user.findUniqueOrThrow({ where: { email } })).emailVerifiedAt,
      ).not.toBeNull();
    });

    it("rejects a weak new password, an expired link and a reused link", async () => {
      const { email } = await register();
      await http().post("/api/auth/password/forgot").send({ email });
      await vi.waitFor(() => expect(outbox.filter((m) => m.to === email)).toHaveLength(2));
      const token = tokenFrom(outbox.filter((m) => m.to === email)[1]);

      expect(
        (await http().post("/api/auth/password/reset").send({ token, password: "short" })).status,
      ).toBe(400);
      expect(
        (await http().post("/api/auth/password/reset").send({ token, password: "long enough 1" }))
          .status,
      ).toBe(204);
      expect(
        (await http().post("/api/auth/password/reset").send({ token, password: "long enough 2" }))
          .status,
      ).toBe(400);

      await http().post("/api/auth/password/forgot").send({ email });
      await vi.waitFor(() => expect(outbox.filter((m) => m.to === email)).toHaveLength(3));
      await prisma.oneTimeToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
      const expired = tokenFrom(outbox.filter((m) => m.to === email)[2]);
      expect(
        (
          await http()
            .post("/api/auth/password/reset")
            .send({ token: expired, password: "long enough 3" })
        ).status,
      ).toBe(400);
    });

    it("does not accept a verification link as a reset link", async () => {
      const { email } = await register();
      const verifyToken = tokenFrom(await nextMail(email));

      const res = await http()
        .post("/api/auth/password/reset")
        .send({ token: verifyToken, password: "long enough password" });

      expect(res.status).toBe(400);
    });
  });
});
