export function weatherFixture() {
  return {
    current_units: { time: "unixtime", interval: "seconds", temperature_2m: "°C", apparent_temperature: "°C",
      relative_humidity_2m: "%", wind_speed_10m: "km/h", wind_direction_10m: "°", precipitation: "mm" },
    current: { time: 1731672000, interval: 900, temperature_2m: 18.5, apparent_temperature: 17.2,
      relative_humidity_2m: 65, wind_speed_10m: 12.5, wind_direction_10m: 270,
      precipitation: 0, weather_code: 3, is_day: 1 },
    daily_units: { time: "unixtime", uv_index_max: "" },
    daily: { time: [1731628800], uv_index_max: [4.2] },
  };
}
export const weatherTransport = (body: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(body), { status });
