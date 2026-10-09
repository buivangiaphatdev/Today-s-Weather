import { Injectable } from "@nestjs/common";
import type { Coordinates, ForecastData, WeatherData } from "@weather/shared";
import { CACHE_TTL, cacheKeys } from "../cache/cache-keys";
import { type Cached, CacheService } from "../cache/cache.service";
import { OpenWeatherClient } from "../openweather/openweather.client";

@Injectable()
export class WeatherService {
  constructor(
    private readonly openWeather: OpenWeatherClient,
    private readonly cache: CacheService,
  ) {}

  getCurrent(coords: Coordinates): Promise<Cached<WeatherData>> {
    return this.cache.wrap(cacheKeys.current(coords), CACHE_TTL.current, () =>
      this.openWeather.getCurrentWeather(coords),
    );
  }

  getForecast(coords: Coordinates): Promise<Cached<ForecastData>> {
    return this.cache.wrap(cacheKeys.forecast(coords), CACHE_TTL.forecast, () =>
      this.openWeather.getForecast(coords),
    );
  }
}
