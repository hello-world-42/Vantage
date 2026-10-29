// zod schemas for validating request input. Shared so the frontend can reuse them.
import { z } from "zod";

/** Query for GET /api/location. Query-string values arrive as strings, so numbers are coerced. */
export const locationQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  /** Optional ISO country code when the caller already knows it (e.g. from a search result). */
  country: z
    .string()
    .trim()
    .regex(/^[a-z]{2}$/i, "country must be a two-letter ISO code")
    .transform((value) => value.toUpperCase())
    .optional(),
});
export type LocationQuery = z.infer<typeof locationQuerySchema>;

/** Query for GET /api/geocode */
export const geocodeQuerySchema = z.object({
  q: z.string().trim().min(1, "q is required").max(200),
});
export type GeocodeQuery = z.infer<typeof geocodeQuerySchema>;
