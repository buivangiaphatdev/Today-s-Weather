import { Body, Controller, Delete, Get, HttpCode, Post } from "@nestjs/common";
import {
  HISTORY_LIMIT,
  type HistoryInput,
  historyInputSchema,
  type SearchHistoryItem,
} from "@weather/shared";
import { type AuthenticatedUser, CurrentUser } from "../auth/guards";
import { UserData } from "../common/user-data";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { SearchHistory } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const toItem = (row: SearchHistory): SearchHistoryItem => ({
  id: row.id,
  query: row.query,
  name: row.name,
  country: row.country,
  state: row.state,
  lat: row.lat,
  lon: row.lon,
  searchedAt: row.searchedAt.toISOString(),
});

@Controller("history")
@UserData()
export class HistoryController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /api/history -> newest first, at most HISTORY_LIMIT
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<SearchHistoryItem[]> {
    const rows = await this.prisma.searchHistory.findMany({
      where: { userId: user.id },
      orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
      take: HISTORY_LIMIT,
    });
    return rows.map(toItem);
  }

  // POST /api/history { query, name, country, state?, lat, lon } -> the full list.
  // Searching a place again moves it to the top instead of adding a duplicate.
  @Post()
  @HttpCode(200)
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(historyInputSchema)) body: HistoryInput,
  ): Promise<SearchHistoryItem[]> {
    const userId = user.id;
    await this.prisma.$transaction(async (tx) => {
      await tx.searchHistory.upsert({
        where: { userId_lat_lon: { userId, lat: body.lat, lon: body.lon } },
        create: { userId, ...body },
        update: { ...body, searchedAt: new Date() },
      });
      // Keep only the newest HISTORY_LIMIT rows
      const stale = await tx.searchHistory.findMany({
        where: { userId },
        orderBy: [{ searchedAt: "desc" }, { id: "desc" }],
        skip: HISTORY_LIMIT,
        select: { id: true },
      });
      if (stale.length > 0) {
        await tx.searchHistory.deleteMany({ where: { id: { in: stale.map((row) => row.id) } } });
      }
    });
    return this.list(user);
  }

  // DELETE /api/history -> 204, clears the user's history
  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    await this.prisma.searchHistory.deleteMany({ where: { userId: user.id } });
  }
}
