import { Injectable } from "@nestjs/common";
import type { Coordinates, GeocodingResponse } from "@weather/shared";
import { CACHE_TTL, cacheKeys } from "../cache/cache-keys";
import { type Cached, CacheService } from "../cache/cache.service";
import { OpenWeatherClient } from "../openweather/openweather.client";

@Injectable()
export class GeoService {
  constructor(
    private readonly openWeather: OpenWeatherClient,
    private readonly cache: CacheService,
  ) {}

  search(query: string): Promise<Cached<GeocodingResponse[]>> {
    return this.cache.wrap(cacheKeys.search(query), CACHE_TTL.geo, () =>
      this.openWeather.searchLocations(query),
    );
  }

  reverse(coords: Coordinates): Promise<Cached<GeocodingResponse[]>> {
    return this.cache.wrap(cacheKeys.reverse(coords), CACHE_TTL.geo, () =>
      this.openWeather.reverseGeocode(coords),
    );
  }
}
