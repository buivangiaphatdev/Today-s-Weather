import { Controller, Get, Query, Res } from "@nestjs/common";
import type { Coordinates, ForecastData, WeatherData } from "@weather/shared";
import type { Response } from "express";
import { sendCached } from "../common/cache-header";
import { coordinatesQuery } from "../common/query-schemas";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { WeatherService } from "./weather.service";

@Controller("weather")
export class WeatherController {
  constructor(private readonly weather: WeatherService) {}

  // GET /api/weather/current?lat=21.03&lon=105.85 (cached 10 min)
  @Get("current")
  async getCurrent(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
    @Res({ passthrough: true }) res: Response,
  ): Promise<WeatherData> {
    return sendCached(res, await this.weather.getCurrent(coords));
  }

  // GET /api/weather/forecast?lat=21.03&lon=105.85 (5 days, 3-hour steps, cached 30 min)
  @Get("forecast")
  async getForecast(
    @Query(new ZodValidationPipe(coordinatesQuery)) coords: Coordinates,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ForecastData> {
    return sendCached(res, await this.weather.getForecast(coords));
  }
}
