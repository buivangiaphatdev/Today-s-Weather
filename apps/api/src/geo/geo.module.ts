import { Module } from "@nestjs/common";
import { OpenWeatherModule } from "../openweather/openweather.module";
import { GeoController } from "./geo.controller";
import { GeoService } from "./geo.service";

@Module({
  imports: [OpenWeatherModule],
  controllers: [GeoController],
  providers: [GeoService],
})
export class GeoModule {}
