import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  AddMovieSchema,
  IdSchema,
  ImportPayloadSchema,
  MediaTypePayloadSchema,
  RatingSchema,
  SearchSchema,
} from "./movies.schema";

export const listLibrary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MediaTypePayloadSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { fetchLibrary } = await import("./movies.server");
    return fetchLibrary(context.supabase, context.userId, data.mediaType);
  });

export const importMovies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ImportPayloadSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { insertLibraryRows } = await import("./movies.server");
    return insertLibraryRows(
      context.supabase,
      context.userId,
      data.rows,
      "csv",
      data.fallbackMediaType,
    );
  });

export const addMovie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AddMovieSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("watched_movies").insert({
      user_id: context.userId,
      title: data.title.trim(),
      year: data.year ?? null,
      rating: data.rating ?? null,
      poster_url: data.posterUrl ?? null,
      imdb_id: data.imdbId ?? null,
      media_type: data.mediaType,
      source: "manual",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rateMovie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RatingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watched_movies")
      .update({ rating: data.rating })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMovie = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watched_movies")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const clearLibrary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MediaTypePayloadSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("watched_movies")
      .delete()
      .eq("user_id", context.userId)
      .eq("media_type", data.mediaType);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const enrichPosters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { enrichLibraryPosters } = await import("./movies.server");
    return enrichLibraryPosters(context.supabase, context.userId);
  });

export const searchCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SearchSchema.parse(input))
  .handler(async ({ data }) => {
    const { searchMovies } = await import("./movie-meta.server");
    return searchMovies(data.query, 10, data.mediaType);
  });
