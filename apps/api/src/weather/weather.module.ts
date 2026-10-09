import { Module } from "@nestjs/common";
import { OpenWeatherModule } from "../openweather/openweather.module";
import { WeatherController } from "./weather.controller";

@Module({
  imports: [OpenWeatherModule],
  controllers: [WeatherController],
})
export class WeatherModule {}
