// Trimmed copies of real OpenWeather responses. Extra fields (base, visibility,
// clouds, local_names, ...) are kept on purpose: the API must strip them.

export const rawCurrentWeather = {
  coord: { lon: 105.8542, lat: 21.0283 },
  weather: [{ id: 803, main: "Clouds", description: "broken clouds", icon: "04d" }],
  base: "stations",
  main: {
    temp: 29.4,
    feels_like: 33.1,
    temp_min: 29.4,
    temp_max: 29.4,
    pressure: 1008,
    humidity: 70,
    sea_level: 1008,
    grnd_level: 1007,
  },
  visibility: 10000,
  wind: { speed: 3.2, deg: 140, gust: 4.1 },
  clouds: { all: 75 },
  dt: 1791532800,
  sys: { type: 1, id: 9308, country: "VN", sunrise: 1791499800, sunset: 1791542400 },
  timezone: 25200,
  id: 1581130,
  name: "Hanoi",
  cod: 200,
};

export const rawForecast = {
  cod: "200",
  message: 0,
  cnt: 1,
  list: [
    {
      dt: 1791543600,
      main: {
        temp: 27.8,
        feels_like: 31.2,
        temp_min: 27.1,
        temp_max: 27.8,
        pressure: 1009,
        sea_level: 1009,
        grnd_level: 1008,
        humidity: 78,
        temp_kf: 0.7,
      },
      weather: [{ id: 500, main: "Rain", description: "light rain", icon: "10n" }],
      clouds: { all: 90 },
      wind: { speed: 2.4, deg: 120, gust: 3.9 },
      visibility: 10000,
      pop: 0.4,
      sys: { pod: "n" },
      dt_txt: "2026-10-09 15:00:00",
    },
  ],
  city: {
    id: 1581130,
    name: "Hanoi",
    coord: { lat: 21.0283, lon: 105.8542 },
    country: "VN",
    population: 1431270,
    timezone: 25200,
    sunrise: 1791499800,
    sunset: 1791542400,
  },
};

export const rawGeocoding = [
  {
    name: "Hà Nội",
    local_names: { vi: "Hà Nội", en: "Hanoi", fr: "Hanoï", ja: "ハノイ" },
    lat: 21.0283334,
    lon: 105.854041,
    country: "VN",
    state: "Hà Nội",
  },
  {
    name: "Hanoi",
    lat: 21.03,
    lon: 105.85,
    country: "VN",
  },
];

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
