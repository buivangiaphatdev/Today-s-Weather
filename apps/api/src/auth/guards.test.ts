import type { ExecutionContext } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { describe, expect, it } from "vitest";
import { JWT_AUDIENCE, JWT_ISSUER } from "./auth.constants";
import { AccessTokenGuard, CsrfHeaderGuard } from "./guards";
import { PasswordService } from "./password.service";

const secret = "test-jwt-secret-that-is-at-least-32-characters";
const options = { secret, issuer: JWT_ISSUER, audience: JWT_AUDIENCE };
const jwt = new JwtService({
  secret,
  signOptions: { algorithm: "HS256", expiresIn: 900, issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
  verifyOptions: { algorithms: ["HS256"], issuer: JWT_ISSUER, audience: JWT_AUDIENCE },
});

const contextFor = (headers: Record<string, string>) => {
  const req: { headers: Record<string, string>; user?: unknown } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
  return { req, context };
};

describe("AccessTokenGuard", () => {
  const guard = new AccessTokenGuard(jwt);
  const bearer = (token: string) => contextFor({ authorization: `Bearer ${token}` });

  it("accepts a valid token and exposes the user id", async () => {
    const { req, context } = bearer(await jwt.signAsync({ sub: "user-1" }));

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(req.user).toEqual({ id: "user-1" });
  });

  it.each([
    ["no header", () => contextFor({})],
    ["another scheme", () => contextFor({ authorization: "Basic abc" })],
  ])("rejects %s", async (_, make) => {
    await expect(guard.canActivate(make().context)).rejects.toThrow("Missing access token");
  });

  it("rejects an expired token", async () => {
    const expired = await jwt.signAsync({ sub: "u" }, { ...options, expiresIn: -1 });
    await expect(guard.canActivate(bearer(expired).context)).rejects.toThrow(/expired/);
  });

  it("rejects a token signed with another secret", async () => {
    const forged = await new JwtService().signAsync(
      { sub: "u" },
      { ...options, secret: "another-secret-that-is-also-32-characters!" },
    );
    await expect(guard.canActivate(bearer(forged).context)).rejects.toThrow(/Invalid/);
  });

  it('rejects an unsigned token ("alg": "none")', async () => {
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: "none", typ: "JWT" })}.${encode({
      sub: "admin",
      iss: JWT_ISSUER,
      aud: JWT_AUDIENCE,
      exp: now + 600,
    })}.`;
    await expect(guard.canActivate(bearer(unsigned).context)).rejects.toThrow(/Invalid/);
  });

  it("rejects a token for another audience", async () => {
    const other = await jwt.signAsync({ sub: "u" }, { ...options, audience: "someone-else" });
    await expect(guard.canActivate(bearer(other).context)).rejects.toThrow(/Invalid/);
  });
});

describe("CsrfHeaderGuard", () => {
  const guard = new CsrfHeaderGuard();

  it("requires X-Requested-With", () => {
    expect(() => guard.canActivate(contextFor({}).context)).toThrow(/x-requested-with/);
    expect(guard.canActivate(contextFor({ "x-requested-with": "fetch" }).context)).toBe(true);
  });
});

describe("PasswordService", () => {
  const passwords = new PasswordService();

  it("hashes with argon2id and verifies", async () => {
    const hash = await passwords.hash("correct horse battery staple");

    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    await expect(passwords.verify(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(passwords.verify(hash, "wrong")).resolves.toBe(false);
  });

  it("returns false for accounts without a password, after doing the same work", async () => {
    await expect(passwords.verify(null, "anything")).resolves.toBe(false);
  });
});
