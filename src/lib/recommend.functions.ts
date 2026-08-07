import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RecommendationStatusSchema } from "./movies.schema";

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recommendations")
      .select("*")
      .eq("user_id", context.userId)
      .neq("status", "dismissed")
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    // Backfill synopses/genres for rows saved before metadata lookup existed.
    const missing = rows.filter((row) => !row.overview).slice(0, 12);
    if (missing.length) {
      const { lookupMany } = await import("./movie-meta.server");
      const metas = await lookupMany(missing.map((r) => ({ title: r.title, year: r.year })));
      await Promise.all(
        missing.map(async (row, index) => {
          const meta = metas[index];
          if (!meta?.overview) return;
          row.overview = meta.overview;
          row.genres = meta.genres.length ? meta.genres : row.genres;
          row.poster_url = row.poster_url ?? meta.posterUrl;
          await context.supabase
            .from("recommendations")
            .update({
              overview: meta.overview,
              genres: row.genres,
              poster_url: row.poster_url,
              imdb_id: row.imdb_id ?? meta.imdbId,
            })
            .eq("id", row.id)
            .eq("user_id", context.userId);
        }),
      );
    }

    return rows;
  });

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mood: z.string().max(200).nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { refreshRecommendations } = await import("./recommend.server");
    return refreshRecommendations(context.supabase, context.userId, data.mood?.trim() || null);
  });

export const setRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecommendationStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recommendations")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
