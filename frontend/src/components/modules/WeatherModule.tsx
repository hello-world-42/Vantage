import type { WeatherData } from '@vantage/shared/modules/weather';
import { compass, describeUv, describeWeather, formatNumber, formatTemperature } from './format';
import { Headline, Stat, StatGrid } from './parts';

export default function WeatherModule({ data }: { data: WeatherData }) {
  const uv = data.dailyUvMax.index;
  return (
    <>
      <Headline
        value={formatTemperature(data.temperature)}
        label={`${describeWeather(data.weatherCode)}${data.isDay === null ? '' : data.isDay ? ' · day' : ' · night'}`}
      />
      <StatGrid>
        <Stat label="Feels like" value={formatTemperature(data.feelsLike)} />
        <Stat label="Humidity" value={data.humidity === null ? '—' : `${formatNumber(data.humidity)}%`} />
        <Stat
          label="Wind"
          value={data.windSpeed === null ? '—' : `${formatNumber(data.windSpeed)} km/h`}
          hint={data.windDirection === null ? undefined : `from ${compass(data.windDirection)}`}
        />
        <Stat label="Precipitation" value={data.precipitation === null ? '—' : `${formatNumber(data.precipitation, 1)} mm`} hint={`last ${Math.round(data.intervalSeconds / 60)} min`} />
        <Stat label="UV index (today's max)" value={uv === null ? '—' : formatNumber(uv, 1)} hint={describeUv(uv)} />
      </StatGrid>
    </>
  );
}
