import { Module } from "@nestjs/common";
import { FavoritesController } from "../favorites/favorites.controller";
import { FavoritesService } from "../favorites/favorites.service";
import { HistoryController } from "../history/history.controller";
import { MeController } from "./me.controller";

// Per-user data: profile/settings, favorites, search history (all require sign-in)
@Module({
  controllers: [MeController, FavoritesController, HistoryController],
  providers: [FavoritesService],
})
export class UserDataModule {}
