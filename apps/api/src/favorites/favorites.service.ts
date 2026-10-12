import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  type FavoriteCity,
  type FavoriteInput,
  type FavoritesImportInput,
  MAX_FAVORITES,
} from "@weather/shared";
import type { FavoriteCity as FavoriteRow } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";

const toFavorite = (row: FavoriteRow): FavoriteCity => ({
  id: row.id,
  name: row.name,
  country: row.country,
  state: row.state,
  lat: row.lat,
  lon: row.lon,
  createdAt: row.createdAt.toISOString(),
});

// Every query is scoped by userId: a user can never read or change another user's rows
@Injectable()
export class FavoritesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<FavoriteCity[]> {
    const rows = await this.prisma.favoriteCity.findMany({
      where: { userId },
      // UUIDv7 ids are time-ordered: a stable tiebreak for rows imported in one batch
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toFavorite);
  }

  // Idempotent: adding a city that is already a favorite returns it (created: false)
  async add(
    userId: string,
    input: FavoriteInput,
  ): Promise<{ favorite: FavoriteCity; created: boolean }> {
    const where = { userId_lat_lon: { userId, lat: input.lat, lon: input.lon } };
    const existing = await this.prisma.favoriteCity.findUnique({ where });
    if (existing) return { favorite: toFavorite(existing), created: false };

    if ((await this.prisma.favoriteCity.count({ where: { userId } })) >= MAX_FAVORITES) {
      throw new ConflictException(`You can save up to ${MAX_FAVORITES} favorite cities`);
    }
    // upsert also covers two concurrent adds of the same city
    const row = await this.prisma.favoriteCity.upsert({
      where,
      create: { userId, ...input },
      update: {},
    });
    return { favorite: toFavorite(row), created: true };
  }

  async remove(userId: string, id: string): Promise<void> {
    const { count } = await this.prisma.favoriteCity.deleteMany({ where: { id, userId } });
    if (count === 0) throw new NotFoundException("Favorite not found");
  }

  // First sign-in on a device: merge its localStorage favorites into the account.
  // Duplicates (same coordinates) are skipped, so calling it again changes nothing.
  async import(userId: string, cities: FavoritesImportInput): Promise<FavoriteCity[]> {
    const room = MAX_FAVORITES - (await this.prisma.favoriteCity.count({ where: { userId } }));
    if (room > 0 && cities.length > 0) {
      await this.prisma.favoriteCity.createMany({
        data: cities.slice(0, room).map((city) => ({ userId, ...city })),
        skipDuplicates: true,
      });
    }
    return this.list(userId);
  }
}
