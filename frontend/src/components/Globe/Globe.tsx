import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { MapSelection } from '../../types';
import {
  DESKTOP_MIN_WIDTH,
  PANEL_TRANSITION_MS,
  PANEL_WIDTH,
  SHEET_HEIGHT_RATIO,
} from '../LocationPanel/layout';

interface GlobeProps {
  selected: MapSelection | null;
  /** When true the dashboard is open and the globe shifts out of its way. */
  panelOpen: boolean;
  onSelect: (selection: MapSelection) => void;
}

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN;
// satellite-streets draws land/ocean from a satellite *imagery* layer. If that imagery
// doesn't load, swap to a vector style, e.g. 'mapbox://styles/mapbox/outdoors-v12'.
const MAP_STYLE = 'mapbox://styles/mapbox/outdoors-v12';
// .env.example ships with a placeholder; treat it the same as "not set".
const TOKEN_MISSING = !MAPBOX_TOKEN || MAPBOX_TOKEN.includes('your_public_token');
const NO_PADDING: mapboxgl.PaddingOptions = { top: 0, right: 0, bottom: 0, left: 0 };
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3); // matches the panel's CSS easing

/**
 * Camera padding reserves the area covered by the dashboard. Mapbox centers the
 * globe in the *remaining* area, which is what makes it slide left (desktop) or
 * up (mobile) smoothly without resizing the canvas.
 */
function getPadding(panelOpen: boolean, container: HTMLElement): mapboxgl.PaddingOptions {
  if (!panelOpen) return NO_PADDING;
  const isDesktop = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH}px)`).matches;
  return isDesktop
    ? { ...NO_PADDING, right: PANEL_WIDTH }
    : { ...NO_PADDING, bottom: Math.round(container.clientHeight * SHEET_HEIGHT_RATIO) };
}

export default function Globe({ selected, panelOpen, onSelect }: GlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null);
  const prevSelectedRef = useRef<MapSelection | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Latest values for long-lived map listeners (avoids re-creating the map).
  const onSelectRef = useRef(onSelect);
  const panelOpenRef = useRef(panelOpen);
  useEffect(() => {
    onSelectRef.current = onSelect;
    panelOpenRef.current = panelOpen;
  });

  // Create the map once.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || TOKEN_MISSING) return;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container,
        style: MAP_STYLE,
        projection: 'globe',
        center: [0, 20],
        zoom: 1.6,
      });
    } catch (err) {
      // Typically WebGL being unavailable (hardware acceleration off, blocked, etc.)
      console.error('[Globe] could not create map', err);
      setMapError('Could not start the map. Make sure WebGL / hardware acceleration is enabled in your browser.');
      return;
    }
    map.setPadding(getPadding(panelOpenRef.current, container));
    mapRef.current = map;

    map.on('error', (e) => {
      // Name the failing source/URL so tile problems are diagnosable from the console.
      const evt = e as unknown as { sourceId?: string; error?: { status?: number; url?: string; message?: string } };
      console.error('[Globe] map error', {
        source: evt.sourceId,
        status: evt.error?.status,
        url: evt.error?.url,
        message: evt.error?.message,
      });
      const status = (e.error as { status?: number } | undefined)?.status;
      if (status === 401 || status === 403) {
        setMapError('Mapbox rejected the access token (' + status + '). Check VITE_MAPBOX_TOKEN and any URL restrictions on the token.');
      }
    });

    map.on('style.load', () => {
      // Space backdrop: stars + atmosphere glow around the globe.
      map.setFog({
        color: 'rgb(186, 210, 235)',
        'high-color': 'rgb(36, 92, 223)',
        'horizon-blend': 0.02,
        'space-color': 'rgb(5, 6, 15)',
        'star-intensity': 0.7,
      });
    });

    map.on('click', (e) => {
      const { lat, lng } = e.lngLat.wrap(); // normalize longitude into [-180, 180]
      onSelectRef.current({ lat, lng, source: 'click' });
    });

    // Switching between side panel and bottom sheet (rotation, window resize): snap, don't animate.
    const onResize = () => {
      map.easeTo({ padding: getPadding(panelOpenRef.current, container), duration: 0 });
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('resize', onResize);
      markerRef.current?.remove();
      markerRef.current = null;
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // One effect owns the camera so a new selection and the panel opening
  // (which happen in the same render) never cancel each other's animation.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const padding = getPadding(panelOpen, map.getContainer());
    const selectionChanged = selected !== prevSelectedRef.current;
    prevSelectedRef.current = selected;

    if (selected && selectionChanged) {
      const center: [number, number] = [selected.lng, selected.lat];
      if (markerRef.current) {
        markerRef.current.setLngLat(center);
      } else {
        markerRef.current = new mapboxgl.Marker({ color: '#38bdf8' }).setLngLat(center).addTo(map);
      }
      if (selected.source === 'search') {
        map.flyTo({ center, zoom: Math.max(map.getZoom(), 4.5), padding, easing: easeOutCubic });
      } else {
        map.easeTo({ center, zoom: Math.max(map.getZoom(), 2.5), padding, duration: PANEL_TRANSITION_MS, easing: easeOutCubic });
      }
    } else {
      // Panel opened/closed: only the padding changes, so the globe glides left/back to center.
      map.easeTo({ padding, duration: PANEL_TRANSITION_MS, easing: easeOutCubic });
    }
  }, [selected, panelOpen]);

  if (TOKEN_MISSING) {
    return (
      <div className="absolute inset-0 grid place-items-center p-6 text-center">
        <p className="max-w-sm text-sm text-slate-400">
          Set <code className="text-sky-300">VITE_MAPBOX_TOKEN</code> to a real public token in the repo-root{' '}
          <code>.env</code> (see <code>.env.example</code>) and restart the dev server to load the globe.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Wrapper owns the positioning. Mapbox's unlayered CSS sets `position: relative` on the
          map element, which beats Tailwind v4's layered `absolute` and collapses it to 0 height. */}
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {mapError && (
        <div role="alert" className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
          <p className="max-w-sm rounded-xl border border-red-400/30 bg-red-950/60 p-4 text-sm text-red-200">{mapError}</p>
        </div>
      )}
    </>
  );
}
