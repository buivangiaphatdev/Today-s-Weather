import { Module } from "@nestjs/common";
import { OpenWeatherModule } from "../openweather/openweather.module";
import { GeoController } from "./geo.controller";

@Module({
  imports: [OpenWeatherModule],
  controllers: [GeoController],
})
export class GeoModule {}
