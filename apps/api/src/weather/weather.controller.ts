import { Controller, Get, Query } from "@nestjs/common";
import type { Coordinates, ForecastData, WeatherData } from "@weather/shared";
import { coordinatesQuery } from "../common/query-schemas";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { OpenWeatherClient } from "../openweather/openweather.client";

@Controller("weather")
export class WeatherController {
  constructor(private readonly openWeather: OpenWeatherClient) {}

  // GET /api/weather/current?lat=21.03&lon=105.85
  @Get("current")
  getCurrent(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
  ): Promise<WeatherData> {
    return this.openWeather.getCurrentWeather(coords);
  }

  // GET /api/weather/forecast?lat=21.03&lon=105.85 (5 days, 3-hour steps)
  @Get("forecast")
  getForecast(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
  ): Promise<ForecastData> {
    return this.openWeather.getForecast(coords);
  }
}
