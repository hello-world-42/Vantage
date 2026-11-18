import { Router } from "express";
import type { GeocodeResponse } from "@vantage/shared";
import { geocodeQuerySchema } from "@vantage/shared/schemas";
import { forwardGeocode, GeocodingError } from "../modules/geo/mapboxGeocoding.client.js";

export interface GeocodeRouterOptions {
  /** Read configuration only when the route is called; tests supply dummy values. */
  getAccessToken: () => string | undefined;
  geocode?: typeof forwardGeocode;
}

export function createGeocodeRouter(options: GeocodeRouterOptions): Router {
  const router = Router();
  const geocode = options.geocode ?? forwardGeocode;

  router.get("/", async (req, res) => {
    const parsed = geocodeQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Provide a location query between 1 and 200 characters." });
      return;
    }
    try {
      const token = options.getAccessToken();
      if (!token?.trim()) {
        res.status(503).json({ error: "Location search is not configured." });
        return;
      }
      const body: GeocodeResponse = { results: await geocode(parsed.data.q, token) };
      res.json(body);
    } catch (error) {
      // Don't expose upstream errors, response bodies, or token-bearing URLs.
      if (error instanceof GeocodingError && error.code === "timeout") {
        res.status(504).json({ error: "Location search timed out." });
      } else if (error instanceof GeocodingError && error.code === "configuration") {
        res.status(503).json({ error: "Location search is not configured." });
      } else {
        res.status(502).json({ error: "Location search is unavailable right now." });
      }
    }
  });

  return router;
}
