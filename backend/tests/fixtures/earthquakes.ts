export const earthquakeNow = () => new Date("2026-11-15T12:00:00Z");
export function earthquakeFeature() {
  return { type: "Feature", id: "test-quake", geometry: { type: "Point", coordinates: [-122.4, 37.8, 8.5] },
    properties: { type: "earthquake", mag: 3.1, place: "Test location", time: Date.parse("2026-11-15T10:00:00Z"),
      updated: Date.parse("2026-11-15T11:00:00Z"), url: "https://earthquake.usgs.gov/earthquakes/eventpage/test-quake" },
  };
}
export const earthquakeCollection = (features: unknown[] = [earthquakeFeature()]) => ({ type: "FeatureCollection", features });
export const quakeTransport = (body: unknown, status = 200): typeof fetch => async () => new Response(status === 204 ? null : JSON.stringify(body), { status });
