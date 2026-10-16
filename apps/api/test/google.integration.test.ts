import type { ConfigService } from "@nestjs/config";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { configureApp } from "../src/app.setup";
import { GoogleService } from "../src/auth/google.service";
import type { Env } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";
import { connectTestDatabase, testDatabaseUrl, truncateAll } from "./helpers/test-database";

const CLIENT_ID = "test-client.apps.googleusercontent.com";
const googleConfig = {
  GOOGLE_CLIENT_ID: CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "test-secret",
  API_PUBLIC_URL: "https://api.example.com",
};

// What Google's token endpoint returns: an ID token whose payload carries the claims
const idToken = (claims: Record<string, unknown>) => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "RS256" })}.${encode({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    exp: Math.floor(Date.now() / 1000) + 300,
    sub: "google-sub-1",
    email: "an@gmail.com",
    email_verified: true,
    name: "An Nguyen",
    ...claims,
  })}.signature`;
};

describe.skipIf(!testDatabaseUrl)("Google sign-in", () => {
  let prisma: PrismaService;
  let app: NestExpressApplication;
  let ipCounter = 0;
  const tokenEndpoint = vi.fn<typeof fetch>();

  const http = () => {
    const ip = `198.18.0.${++ipCounter % 250}`;
    const server = app.getHttpServer();
    return {
      get: (path: string) => request(server).get(path).set("X-Forwarded-For", ip),
      post: (path: string) => request(server).post(path).set("X-Forwarded-For", ip),
    };
  };

  // Full browser round trip: /google (sets the flow cookie) -> Google -> /callback
  const signInWithGoogle = async (claims: Record<string, unknown> = {}) => {
    tokenEndpoint.mockResolvedValueOnce(
      new Response(JSON.stringify({ id_token: idToken(claims) }), { status: 200 }),
    );
    const start = await http().get("/api/auth/google");
    const state = new URL(start.headers.location).searchParams.get("state");
    const flowCookie = (start.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    return http()
      .get(`/api/auth/google/callback?code=auth-code&state=${state}`)
      .set("Cookie", flowCookie);
  };
  const handOffCode = (callback: request.Response) =>
    new URL(callback.headers.location).hash.replace("#code=", "");
  const exchange = (code: string) =>
    http().post("/api/auth/google/exchange").set("X-Requested-With", "fetch").send({ code });

  beforeAll(async () => {
    prisma = connectTestDatabase();
    const config = { get: (key: keyof typeof googleConfig) => googleConfig[key] };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(GoogleService)
      .useValue(new GoogleService(config as unknown as ConfigService<Env, true>, prisma))
      .compile();
    app = configureApp(
      moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true }),
    );
    app.set("trust proxy", true);
    await app.listen(0);
    vi.stubGlobal("fetch", tokenEndpoint);
  }, 60_000);

  beforeEach(() => truncateAll(prisma));
  afterEach(() => tokenEndpoint.mockReset());

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app?.close();
    await prisma?.onModuleDestroy();
  });

  it("reports Google as available", async () => {
    expect((await http().get("/api/auth/providers")).body).toEqual({ google: true });
  });

  it("redirects to Google with PKCE and a state, kept in a Lax cookie", async () => {
    const res = await http().get("/api/auth/google");

    expect(res.status).toBe(302);
    const url = new URL(res.headers.location);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: CLIENT_ID,
      redirect_uri: "https://api.example.com/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      code_challenge_method: "S256",
    });
    const cookie = (res.headers["set-cookie"] as unknown as string[])[0];
    expect(cookie).toMatch(
      /^g_oauth=.+; Max-Age=600; Path=\/api\/auth\/google; .*HttpOnly; Secure; SameSite=Lax/,
    );
  });

  it("creates an account, hands a one-time code to the web, which exchanges it for a session", async () => {
    const callback = await signInWithGoogle();

    expect(callback.status).toBe(302);
    expect(callback.headers.location).toMatch(/^http:\/\/localhost:5173\/auth\/callback#code=/);
    // The token request carried the PKCE verifier and our secret
    const body = new URLSearchParams(String(tokenEndpoint.mock.calls[0][1]?.body));
    expect(body.get("code_verifier")).toBeTruthy();
    expect(body.get("client_secret")).toBe("test-secret");

    const session = await exchange(handOffCode(callback));
    expect(session.status).toBe(200);
    expect(session.body.user).toMatchObject({
      email: "an@gmail.com",
      name: "An Nguyen",
      emailVerified: true,
    });
    expect((session.headers["set-cookie"] as unknown as string[])[0]).toMatch(/^rt=.*Partitioned/);

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "an@gmail.com" } });
    expect(user.passwordHash).toBeNull();
  });

  it("accepts the hand-off code only once", async () => {
    const code = handOffCode(await signInWithGoogle());

    expect((await exchange(code)).status).toBe(200);
    expect((await exchange(code)).status).toBe(400);
  });

  it("rejects a callback whose state does not match (CSRF)", async () => {
    const res = await http()
      .get("/api/auth/google/callback?code=x&state=forged")
      .set("Cookie", "g_oauth=real.verifier");

    expect(res.headers.location).toBe("http://localhost:5173/login#error=google");
    expect(tokenEndpoint).not.toHaveBeenCalled();
  });

  it.each([
    ["an unverified Google email", { email_verified: false }],
    ["a token for another app", { aud: "someone-else" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 10 }],
  ])("refuses %s", async (_, claims) => {
    const res = await signInWithGoogle(claims);

    expect(res.headers.location).toBe("http://localhost:5173/login#error=google");
    expect(await prisma.user.count()).toBe(0);
  });

  it("links to a verified password account with the same email, keeping the password", async () => {
    await http()
      .post("/api/auth/register")
      .send({ email: "an@gmail.com", password: "my own password" });
    await prisma.user.updateMany({ data: { emailVerifiedAt: new Date() } });

    await exchange(handOffCode(await signInWithGoogle()));

    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.oAuthAccount.count()).toBe(1);
    const login = await http()
      .post("/api/auth/login")
      .send({ email: "an@gmail.com", password: "my own password" });
    expect(login.status).toBe(200);
  });

  it("blocks pre-account hijacking: an unverified look-alike account loses its password and sessions", async () => {
    // Attacker registers the victim's address first, without being able to verify it
    const attacker = await http()
      .post("/api/auth/register")
      .send({ email: "an@gmail.com", password: "attacker password" });
    const attackerCookie = (attacker.headers["set-cookie"] as unknown as string[])[0].split(";")[0];

    // The real owner signs in with Google
    await exchange(handOffCode(await signInWithGoogle()));

    const user = await prisma.user.findUniqueOrThrow({ where: { email: "an@gmail.com" } });
    expect(user.passwordHash).toBeNull();
    expect(user.emailVerifiedAt).not.toBeNull();
    const login = await http()
      .post("/api/auth/login")
      .send({ email: "an@gmail.com", password: "attacker password" });
    expect(login.status).toBe(401);
    const refresh = await http()
      .post("/api/auth/refresh")
      .set("X-Requested-With", "fetch")
      .set("Cookie", attackerCookie);
    expect(refresh.status).toBe(401);
  });

  it("recognises a returning Google user by sub even if their email changed", async () => {
    await exchange(handOffCode(await signInWithGoogle()));
    const session = await exchange(
      handOffCode(await signInWithGoogle({ email: "new-address@gmail.com" })),
    );

    expect(session.body.user.email).toBe("an@gmail.com");
    expect(await prisma.user.count()).toBe(1);
  });
});
