# Offline land mask

`land.json` contains only the Polygon/MultiPolygon coordinates from Natural Earth
v5.1.2, 1:110 million physical land. Feature properties were removed; coordinates
were retained unchanged. The mask has 127 polygons and 5,143 positions.

Source: https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_110m_land.geojson

Upstream SHA-256: `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9`

Natural Earth data is public domain:
https://www.naturalearthdata.com/about/terms-of-use/

This coarse mask supports land-biased globe exploration, not precise coastline
or inland-water classification. Small islands may be absent, and coastline
generalization or inland waters may differ from Mapbox's detailed map.

The backend imports this JSON at startup; TypeScript copies it into the build.
Runtime selection is entirely offline and requires no API keys or geocoding.
