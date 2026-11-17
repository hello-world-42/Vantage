import type { AirQualityData, AqiCategory } from '@vantage/shared/modules/airQuality';
import { formatNumber } from './format';
import { Badge, Headline, Stat, StatGrid, type Tone } from './parts';

const CATEGORY: Record<AqiCategory, { label: string; tone: Tone; advice: string }> = {
  good: { label: 'Good', tone: 'good', advice: 'Air quality is fine for everyone.' },
  moderate: { label: 'Moderate', tone: 'caution', advice: 'Fine for most people; unusually sensitive people may notice it.' },
  unhealthy_sensitive: { label: 'Unhealthy for sensitive groups', tone: 'warning', advice: 'Children, older adults and people with asthma should limit long outdoor effort.' },
  unhealthy: { label: 'Unhealthy', tone: 'danger', advice: 'Everyone may start to feel effects; limit time outdoors.' },
  very_unhealthy: { label: 'Very unhealthy', tone: 'danger', advice: 'Health alert: avoid outdoor effort.' },
  hazardous: { label: 'Hazardous', tone: 'danger', advice: 'Emergency conditions: stay indoors.' },
};

const micro = (value: number | null) => (value === null ? '—' : `${formatNumber(value, 1)} µg/m³`);

export default function AirQualityModule({ data }: { data: AirQualityData }) {
  const category = data.category ? CATEGORY[data.category] : null;
  return (
    <>
      <Headline
        value={data.usAqi === null ? '—' : `AQI ${formatNumber(data.usAqi)}`}
        label={category?.advice}
        badge={category && <Badge tone={category.tone}>{category.label}</Badge>}
      />
      <StatGrid>
        <Stat label="Fine particles (PM2.5)" value={micro(data.pm25)} />
        <Stat label="Coarse particles (PM10)" value={micro(data.pm10)} />
        <Stat label="Ozone" value={micro(data.ozone)} />
        <Stat label="Nitrogen dioxide" value={micro(data.nitrogenDioxide)} />
        <Stat label="European AQI" value={formatNumber(data.europeanAqi)} />
      </StatGrid>
    </>
  );
}
