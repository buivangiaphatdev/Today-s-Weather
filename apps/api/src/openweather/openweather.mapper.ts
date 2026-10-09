import type {
  ForecastData,
  ForecastItem,
  GeocodingResponse,
  WeatherCondition,
  WeatherData,
} from "@weather/shared";

// Raw OpenWeather responses are supersets of the shared types. Copy fields
// explicitly so only the documented contract leaves the API, whatever the
// provider adds later.

const toCondition = ({ id, main, description, icon }: WeatherCondition): WeatherCondition => ({
  id,
  main,
  description,
  icon,
});

const toMain = (main: WeatherData["main"]): WeatherData["main"] => ({
  temp: main.temp,
  feels_like: main.feels_like,
  temp_min: main.temp_min,
  temp_max: main.temp_max,
  pressure: main.pressure,
  humidity: main.humidity,
});

const toWind = ({ speed, deg }: WeatherData["wind"]): WeatherData["wind"] => ({ speed, deg });

export function toWeatherData(raw: WeatherData): WeatherData {
  return {
    coord: { lat: raw.coord.lat, lon: raw.coord.lon },
    weather: raw.weather.map(toCondition),
    main: toMain(raw.main),
    wind: toWind(raw.wind),
    sys: { sunrise: raw.sys.sunrise, sunset: raw.sys.sunset, country: raw.sys.country },
    name: raw.name,
    dt: raw.dt,
  };
}

const toForecastItem = (item: ForecastItem): ForecastItem => ({
  dt: item.dt,
  main: toMain(item.main),
  weather: item.weather.map(toCondition),
  wind: toWind(item.wind),
  dt_txt: item.dt_txt,
});

export function toForecastData(raw: ForecastData): ForecastData {
  return {
    list: raw.list.map(toForecastItem),
    city: {
      name: raw.city.name,
      country: raw.city.country,
      sunrise: raw.city.sunrise,
      sunset: raw.city.sunset,
    },
  };
}

export function toGeocodingResponse(raw: GeocodingResponse): GeocodingResponse {
  return {
    name: raw.name,
    lat: raw.lat,
    lon: raw.lon,
    country: raw.country,
    ...(raw.state ? { state: raw.state } : {}),
  };
}
