import { Controller, Get, Query } from "@nestjs/common";
import type { Coordinates, GeocodingResponse } from "@weather/shared";
import { coordinatesQuery, type SearchQuery, searchQuery } from "../common/query-schemas";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OpenWeatherClient } from "../openweather/openweather.client";

@Controller("geo")
export class GeoController {
  constructor(private readonly openWeather: OpenWeatherClient) {}

  // GET /api/geo/search?q=Hanoi -> up to 5 matching places
  @Get("search")
  search(
    @Query(new ZodValidationPipe(searchQuery)) { q }: SearchQuery,
  ): Promise<GeocodingResponse[]> {
    return this.openWeather.searchLocations(q);
  }

  // GET /api/geo/reverse?lat=21.03&lon=105.85 -> [] or [nearest place]
  @Get("reverse")
  reverse(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
  ): Promise<GeocodingResponse[]> {
    return this.openWeather.reverseGeocode(coords);
  }
}
