import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Coordinates, GeocodingResponse } from "@weather/shared";
import type { Response } from "express";
import { sendCached } from "../common/cache-header";
import { coordinatesQuery, type SearchQuery, searchQuery } from "../common/query-schemas";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { GeoService } from "./geo.service";

@Controller("geo")
export class GeoController {
  constructor(private readonly geo: GeoService) {}

  // GET /api/geo/search?q=Hanoi -> up to 5 matching places (cached 7 days)
  @Get("search")
  async search(
    @Query(new ZodValidationPipe(searchQuery)) { q }: SearchQuery,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GeocodingResponse[]> {
    return sendCached(res, await this.geo.search(q));
  }

  // GET /api/geo/reverse?lat=21.03&lon=105.85 -> [] or [nearest place] (cached 7 days)
  @Get("reverse")
  async reverse(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
    @Res({ passthrough: true }) res: Response,
  ): Promise<GeocodingResponse[]> {
    return sendCached(res, await this.geo.reverse(coords));
  }
}
