// Response shapes of /api/weather/* and /api/geo/*. They keep OpenWeather's field
// names (so the web app can switch from calling OpenWeather directly with minimal
// changes) but only contain the fields the app uses. Units are metric.

export interface Coordinates {
  lat: number;
  lon: number;
}

export interface WeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface WeatherData {
  coord: Coordinates;
  weather: WeatherCondition[];
  main: {
    temp: number;
    feels_like: number;
    temp_min: number;
    temp_max: number;
    pressure: number;
    humidity: number;
  };
  wind: {
    speed: number;
    deg: number;
  };
  sys: {
    sunrise: number;
    sunset: number;
    country: string;
  };
  name: string;
  dt: number;
}

export interface ForecastItem {
  dt: number;
  main: WeatherData["main"];
  weather: WeatherCondition[];
  wind: WeatherData["wind"];
  dt_txt: string;
}

export interface ForecastData {
  list: ForecastItem[];
  city: {
    name: string;
    country: string;
    sunrise: number;
    sunset: number;
  };
}

// OpenWeather also returns `local_names` (dozens of translations); the app does not use it
export interface GeocodingResponse {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}
