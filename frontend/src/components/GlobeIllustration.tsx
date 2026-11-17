// Landing-page globe: a real orthographic projection (d3-geo) of Natural Earth's 1:110m land,
// turning slowly. Stands in for the wireframe's blue-outlined globe circle (Figma screen 01).
import { useEffect, useRef } from 'react';
import { geoGraticule10, geoOrthographic, geoPath } from 'd3-geo';
import type { GeoPermissibleObjects } from 'd3-geo';
import { feature } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
// Served as a separate static file (~55 KB) so the page paints before the land arrives.
import landUrl from 'world-atlas/land-110m.json?url';

const SIZE = 400;
const RADIUS = 172;
const TILT = -20; // view centered on 20°N, so more land shows
const START_LONGITUDE = 20; // Europe and Africa in front on first paint
const DEGREES_PER_SECOND = 6; // one turn a minute

// Downloaded once per page load and shared, so remounts (React StrictMode in development,
// navigating back to the landing page) don't fetch it again.
let landRequest: Promise<GeoPermissibleObjects> | null = null;
function loadLand(): Promise<GeoPermissibleObjects> {
  landRequest ??= fetch(landUrl)
    .then((res) => (res.ok ? (res.json() as Promise<Topology>) : Promise.reject(new Error(String(res.status)))))
    .then((topology) => feature(topology, topology.objects.land as GeometryCollection))
    .catch((error: unknown) => {
      landRequest = null; // allow a retry on the next visit
      throw error;
    });
  return landRequest;
}

export default function GlobeIllustration({ className = '' }: { className?: string }) {
  const graticuleRef = useRef<SVGPathElement>(null);
  const landRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const projection = geoOrthographic()
      .scale(RADIUS)
      .translate([SIZE / 2, SIZE / 2])
      .clipAngle(90) // hide the far side
      .precision(0.5);
    const path = geoPath(projection);
    const graticule = geoGraticule10();
    let land: GeoPermissibleObjects | null = null;
    let longitude = START_LONGITUDE;
    let lastTime: number | null = null;
    let frame = 0;
    let cancelled = false;

    const draw = () => {
      projection.rotate([longitude, TILT]);
      graticuleRef.current?.setAttribute('d', path(graticule) ?? '');
      if (land) landRef.current?.setAttribute('d', path(land) ?? '');
    };

    const tick = (time: number) => {
      if (lastTime !== null) longitude = (longitude + ((time - lastTime) / 1000) * DEGREES_PER_SECOND) % 360;
      lastTime = time;
      draw();
      frame = requestAnimationFrame(tick);
    };

    draw();
    // Still for people who ask for reduced motion.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (!reduceMotion) frame = requestAnimationFrame(tick);

    loadLand()
      .then((loaded) => {
        if (cancelled) return;
        land = loaded;
        draw();
        if (landRef.current) landRef.current.style.opacity = '1';
      })
      .catch(() => {
        /* no land: the sphere and grid still read as a globe */
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, []);

  const c = SIZE / 2;
  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className={className} aria-hidden="true" focusable="false">
      <defs>
        <radialGradient id="vt-globe-glow">
          <stop offset="80%" stopColor="#4f86f7" stopOpacity="0" />
          <stop offset="86%" stopColor="#4f86f7" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#4f86f7" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="vt-globe-ocean" cx="36%" cy="30%" r="78%">
          <stop offset="0%" stopColor="#1f3155" />
          <stop offset="65%" stopColor="#111a2e" />
          <stop offset="100%" stopColor="#0a0f1c" />
        </radialGradient>
      </defs>

      <circle cx={c} cy={c} r={c} fill="url(#vt-globe-glow)" />
      <circle cx={c} cy={c} r={RADIUS} fill="url(#vt-globe-ocean)" />
      <path ref={graticuleRef} fill="none" stroke="#4f86f7" strokeOpacity="0.16" strokeWidth="0.7" />
      <path
        ref={landRef}
        fill="#4f86f7"
        fillOpacity="0.32"
        stroke="#9dbbff"
        strokeOpacity="0.75"
        strokeWidth="0.7"
        strokeLinejoin="round"
        style={{ opacity: 0, transition: 'opacity 700ms ease-out' }}
      />
      <circle cx={c} cy={c} r={RADIUS} fill="none" stroke="#4f86f7" strokeWidth="2" />
    </svg>
  );
}
