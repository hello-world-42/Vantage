import type { LightPollutionLevel, SkyConditionsData } from '@vantage/shared/modules/skyConditions';
import { formatNumber } from './format';
import { Badge, Stat, StatGrid, type Tone } from './parts';

const LEVEL: Record<LightPollutionLevel, { label: string; tone: Tone; text: string }> = {
  very_dark: { label: 'Very dark sky', tone: 'good', text: 'Excellent for stargazing: the Milky Way should be easy to see.' },
  rural: { label: 'Rural sky', tone: 'good', text: 'Good for stargazing away from local lights.' },
  suburban: { label: 'Suburban sky', tone: 'caution', text: 'Bright stars and planets only; the Milky Way is washed out.' },
  urban: { label: 'Urban sky', tone: 'warning', text: 'Heavy light pollution: only the brightest stars show.' },
  city_center: { label: 'City-center sky', tone: 'danger', text: 'Very heavy light pollution.' },
};

export default function SkyConditionsModule({ data }: { data: SkyConditionsData }) {
  const level = data.lightPollution ? LEVEL[data.lightPollution.level] : null;
  return (
    <>
      {level && (
        <div className="mb-3">
          <Badge tone={level.tone}>{level.label}</Badge>
          <p className="m-0 mt-1.5 text-sm text-slate-300">{level.text}</p>
        </div>
      )}
      <StatGrid>
        {data.lightPollution && (
          <Stat
            label="Night-time brightness"
            value={`${formatNumber(data.lightPollution.radiance, 2)} nW/cm²/sr`}
            hint={data.lightPollution.year ? `${data.lightPollution.year} average` : undefined}
          />
        )}
        {data.population && (
          <Stat
            label="Population density"
            value={`${formatNumber(data.population.densityPerKm2, data.population.densityPerKm2 < 10 ? 1 : 0)} people/km²`}
            hint={data.population.year ? `${data.population.year} estimate` : undefined}
          />
        )}
      </StatGrid>
    </>
  );
}
