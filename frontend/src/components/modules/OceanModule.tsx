import type { OceanData } from '@vantage/shared/modules/ocean';
import { compass, formatNumber, formatTemperature } from './format';
import { Headline, Stat, StatGrid } from './parts';

const metres = (value: number | null) => (value === null ? '—' : `${formatNumber(value, 1)} m`);
const seconds = (value: number | null) => (value === null ? undefined : `every ${formatNumber(value)} s`);

export default function OceanModule({ data }: { data: OceanData }) {
  return (
    <>
      <Headline value={data.waveHeight === null ? '—' : `${formatNumber(data.waveHeight, 1)} m waves`} label={data.waveDirection === null ? undefined : `from ${compass(data.waveDirection)}`} />
      <StatGrid>
        <Stat label="Sea temperature" value={formatTemperature(data.seaSurfaceTemperature)} />
        <Stat label="Wave period" value={data.wavePeriod === null ? '—' : `${formatNumber(data.wavePeriod)} s`} />
        <Stat label="Swell" value={metres(data.swellHeight)} hint={seconds(data.swellPeriod)} />
        <Stat
          label="Current"
          value={data.currentSpeed === null ? '—' : `${formatNumber(data.currentSpeed, 1)} km/h`}
          hint={data.currentDirection === null ? undefined : `toward ${compass(data.currentDirection)}`}
        />
      </StatGrid>
    </>
  );
}
