import { Module } from "@nestjs/common";
import { OpenWeatherModule } from "../openweather/openweather.module";
import { WeatherController } from "./weather.controller";
import { WeatherService } from "./weather.service";

@Module({
  imports: [OpenWeatherModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
