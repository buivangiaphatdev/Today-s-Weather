import { Body, Controller, Delete, Get, HttpCode, Param, Post, Res } from "@nestjs/common";
import {
  type FavoriteCity,
  type FavoriteInput,
  favoriteInputSchema,
  type FavoritesImportInput,
  favoritesImportSchema,
} from "@weather/shared";
import type { Response } from "express";
import { type AuthenticatedUser, CurrentUser } from "../auth/guards";
import { idParam, UserData } from "../common/user-data";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { FavoritesService } from "./favorites.service";

@Controller("favorites")
@UserData()
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  // GET /api/favorites -> oldest first (the order they were added)
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<FavoriteCity[]> {
    return this.favorites.list(user.id);
  }

  // POST /api/favorites { name, country, state?, lat, lon } -> 201 new, 200 already saved
  @Post()
  async add(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(favoriteInputSchema)) body: FavoriteInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<FavoriteCity> {
    const { favorite, created } = await this.favorites.add(user.id, body);
    res.status(created ? 201 : 200);
    return favorite;
  }

  // POST /api/favorites/import [cities] -> the full list after merging
  @Post("import")
  @HttpCode(200)
  import(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(favoritesImportSchema)) body: FavoritesImportInput,
  ): Promise<FavoriteCity[]> {
    return this.favorites.import(user.id, body);
  }

  // DELETE /api/favorites/:id -> 204 (404 if it is not one of the user's favorites)
  @Delete(":id")
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", new ZodValidationPipe(idParam)) id: string,
  ): Promise<void> {
    return this.favorites.remove(user.id, id);
  }
}
