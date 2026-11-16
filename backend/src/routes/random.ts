import { Router } from "express";
import { z } from "zod";
import { getRandomLocation, type RandomLocation } from "../modules/geo/randomLocation.service.js";

const resultSchema = z.object({
  lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180), name: z.string().optional(),
});

export function createRandomRouter(generate: () => RandomLocation | Promise<RandomLocation> = getRandomLocation): Router {
  const router = Router();
  router.get("/", async (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      res.json(resultSchema.parse(await generate()));
    } catch {
      res.status(503).json({ error: "Random location is unavailable right now." });
    }
  });
  return router;
}
