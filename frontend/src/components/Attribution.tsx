// Data-source credits (Figma screen 01 footer; SPEC 2.4: Open-Meteo requires attribution in the UI).
const SOURCES: Array<[name: string, href: string]> = [
  ['Open-Meteo', 'https://open-meteo.com/'],
  ['USGS', 'https://www.usgs.gov/'],
  ['NOAA', 'https://www.noaa.gov/'],
  ['NASA', 'https://www.nasa.gov/'],
  ['Launch Library 2', 'https://thespacedevs.com/llapi'],
  ['N2YO', 'https://www.n2yo.com/'],
  ['Mapbox', 'https://www.mapbox.com/about/maps/'],
];

export default function Attribution({ className = '' }: { className?: string }) {
  return (
    <p className={`m-0 text-xs text-vt-muted ${className}`}>
      Data:{' '}
      {SOURCES.map(([name, href], i) => (
        <span key={name}>
          {i > 0 && <span aria-hidden="true"> · </span>}
          <a href={href} target="_blank" rel="noreferrer" className="text-vt-muted underline-offset-2 hover:text-white hover:underline">
            {name}
          </a>
        </span>
      ))}
    </p>
  );
}
