import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MediaTypePayloadSchema,
  MediaTypeSchema,
  RecommendationStatusSchema,
} from "./movies.schema";

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => MediaTypePayloadSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { data: rowsData, error } = await context.supabase
      .from("recommendations")
      .select("*")
      .eq("user_id", context.userId)
      .eq("media_type", data.mediaType)
      .neq("status", "dismissed")
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) throw new Error(error.message);
    const rows = rowsData ?? [];

    // Backfill synopses/genres for rows saved before metadata lookup existed.
    const missing = rows.filter((row) => !row.overview).slice(0, 12);
    if (missing.length) {
      const { lookupMany } = await import("./movie-meta.server");
      const metas = await lookupMany(
        missing.map((r) => ({ title: r.title, year: r.year, type: data.mediaType })),
      );
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

const RefineEnum = z.enum(["obscure", "recent", "lighter", "darker", "director", "shorter"]);

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mood: z.string().max(200).nullable().optional(),
        mediaType: MediaTypeSchema.default("movie"),
        count: z.number().int().min(1).max(12).default(12),
        replaceNew: z.boolean().default(true),
        refine: RefineEnum.nullable().optional(),
        note: z.string().max(200).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { enforceLimit } = await import("./usage.server");
    // Single-slot refills get a separate, roomier budget.
    if (data.count === 1) await enforceLimit({ userId: context.userId }, "refill", 60);
    else await enforceLimit({ userId: context.userId }, "recommend", 30);
    const { refreshRecommendations } = await import("./recommend.server");
    return refreshRecommendations(
      context.supabase,
      context.userId,
      data.mood?.trim() || null,
      data.mediaType,
      {
        count: data.count,
        replaceNew: data.replaceNew,
        refine: data.refine ?? null,
        note: data.note?.trim() || null,
      },
    );
  });

export const markPick = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), kind: z.enum(["seen", "rejected"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rec, error } = await context.supabase
      .from("recommendations")
      .select("title, year, media_type")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rec) throw new Error("Pick not found");
    await context.supabase.from("pick_feedback").upsert(
      {
        user_id: context.userId,
        title: rec.title,
        year: rec.year,
        media_type: rec.media_type,
        kind: data.kind,
      },
      { onConflict: "user_id,media_type,title,year" },
    );
    await context.supabase
      .from("recommendations")
      .update({ status: "dismissed", feedback: data.kind === "rejected" ? -1 : null })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
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

export const setRecommendationFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ id: z.string().uuid(), feedback: z.union([z.literal(1), z.literal(-1), z.null()]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recommendations")
      .update({ feedback: data.feedback })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
