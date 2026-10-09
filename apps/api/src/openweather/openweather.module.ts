import { Module } from "@nestjs/common";
import { OpenWeatherClient } from "./openweather.client";

@Module({
  providers: [OpenWeatherClient],
  exports: [OpenWeatherClient],
})
export class OpenWeatherModule {}
