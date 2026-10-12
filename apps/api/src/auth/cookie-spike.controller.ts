import { Controller, Delete, Get, Header, HttpCode, Module, Post, Req, Res } from "@nestjs/common";
import type { CookieOptions, Request, Response } from "express";

// TEMPORARY (P2-00): checks whether browsers keep a cross-site refresh-token-style
// cookie between today-s-weather-web.vercel.app and the API. Two cookies are set so
// the result shows both "partitioned works" and "plain third-party cookies blocked".
// Delete this file (and its route on the web) when P2-03 lands.

const PARTITIONED = "spike_partitioned";
const PLAIN = "spike_plain";

const base: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "none",
  path: "/api/auth",
  maxAge: 60 * 60 * 1000,
};

function readCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie ?? "";
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([name, value]) => name && value !== undefined)
      .map(([name, ...rest]) => [name, decodeURIComponent(rest.join("="))]),
  );
}

@Controller("auth/spike")
export class CookieSpikeController {
  @Post()
  @HttpCode(200)
  set(@Res({ passthrough: true }) res: Response) {
    const value = new Date().toISOString();
    res.cookie(PARTITIONED, value, { ...base, partitioned: true });
    res.cookie(PLAIN, value, base);
    return { set: value };
  }

  @Get()
  @Header("Cache-Control", "no-store")
  check(@Req() req: Request) {
    const cookies = readCookies(req);
    return { partitioned: cookies[PARTITIONED] ?? null, plain: cookies[PLAIN] ?? null };
  }

  @Delete()
  @HttpCode(204)
  clear(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(PARTITIONED, { ...base, partitioned: true, maxAge: undefined });
    res.clearCookie(PLAIN, { ...base, maxAge: undefined });
  }
}

@Module({ controllers: [CookieSpikeController] })
export class CookieSpikeModule {}
