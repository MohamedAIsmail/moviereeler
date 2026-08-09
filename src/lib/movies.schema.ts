import { z } from "zod";

export const MediaTypeSchema = z.enum(["movie", "series"]);
export type MediaTypeValue = z.infer<typeof MediaTypeSchema>;

export const ImportRowSchema = z.object({
  title: z.string().min(1).max(300),
  year: z.number().int().min(1870).max(2100).nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  watchedOn: z.string().max(32).nullable().optional(),
  mediaType: MediaTypeSchema.optional(),
  imdbId: z.string().max(32).nullable().optional(),
});

export const ImportPayloadSchema = z.object({
  rows: z.array(ImportRowSchema).min(1).max(4000),
  fallbackMediaType: MediaTypeSchema.default("movie"),
});

export const AddMovieSchema = z.object({
  title: z.string().min(1).max(300),
  year: z.number().int().min(1870).max(2100).nullable().optional(),
  rating: z.number().min(0).max(10).nullable().optional(),
  posterUrl: z.string().url().max(1000).nullable().optional(),
  imdbId: z.string().max(32).nullable().optional(),
  mediaType: MediaTypeSchema.default("movie"),
});

export const IdSchema = z.object({ id: z.string().uuid() });

export const RatingSchema = z.object({
  id: z.string().uuid(),
  rating: z.number().min(0).max(10).nullable(),
});

export const SearchSchema = z.object({
  query: z.string().min(1).max(120),
  mediaType: MediaTypeSchema.default("movie"),
});

export const MediaTypePayloadSchema = z.object({
  mediaType: MediaTypeSchema.default("movie"),
});

export const RecommendationStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["new", "saved", "dismissed"]),
});

export type ImportRow = z.infer<typeof ImportRowSchema>;
