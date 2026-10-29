// GET /api/location?lat=33.75&lng=-84.39[&country=US]
// Validates the query, then hands off to the aggregator. Always 200 with per-module statuses,
// even if some providers failed; 400 only for bad input.
import { Router } from "express";
import { locationQuerySchema } from "@vantage/shared/schemas";
import type { AggregateLocation } from "../aggregator/aggregateLocation.js";

export function createLocationRouter(aggregateLocation: AggregateLocation): Router {
  const router = Router();

  router.get("/location", async (req, res, next) => {
    const parsed = locationQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Invalid location query",
        details: parsed.error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })),
      });
      return;
    }
    try {
      res.json(await aggregateLocation(parsed.data));
    } catch (error) {
      next(error);
    }
  });

  return router;
}
