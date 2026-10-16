import type { Settings } from "../api/types";

export type Units = Settings["units"];

// The API always returns metric (°C, m/s); conversion happens only for display
export const toDisplayTemperature = (celsius: number, units: Units) =>
  Math.round(units === "imperial" ? (celsius * 9) / 5 + 32 : celsius);

export const formatTemperature = (celsius: number, units: Units, withUnit = true) =>
  `${toDisplayTemperature(celsius, units)}°${withUnit ? (units === "imperial" ? "F" : "C") : ""}`;

export const formatWindSpeed = (metersPerSecond: number, units: Units) =>
  units === "imperial"
    ? `${(metersPerSecond * 2.236936).toFixed(1)} mph`
    : `${metersPerSecond.toFixed(1)} m/s`;
