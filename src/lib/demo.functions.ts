import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const Pick = z.object({
  title: z.string().min(1).max(300),
  year: z.number().int().nullable().optional(),
});

export const demoSearch = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ query: z.string().min(1).max(120), mediaType: z.enum(["movie", "series"]) })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { searchMovies } = await import("./movie-meta.server");
    const results = await searchMovies(data.query, 12, data.mediaType);
    return results.map((r) => ({ title: r.title, year: r.year, posterUrl: r.posterUrl }));
  });

export interface DemoPick {
  title: string;
  year: number | null;
  matchScore: number;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
  because: string;
  hook: string;
}

export const demoRecommend = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        picks: z.array(Pick).min(3).max(10),
        mediaType: z.enum(["movie", "series"]),
        exclude: z.array(z.string().max(320)).max(150).default([]),
        refine: z.enum(["obscure", "recent", "lighter", "darker", "director", "shorter"]).nullable().optional(),
        note: z.string().max(200).nullable().optional(),
        count: z.number().int().min(1).max(3).default(3),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ picks: DemoPick[]; error?: string }> => {
    const { sha, cacheGet, cacheSet, clientIpHash, enforceLimit } = await import(
      "./usage.server"
    );
    const note = data.note?.trim() || null;
    const cacheable = data.exclude.length === 0 && !data.refine && !note && data.count === 3;
    const key = await sha(
      "v2|" +
        data.mediaType +
        "|" +
        data.picks
          .map((p) => `${p.title.toLowerCase()}|${p.year ?? ""}`)
          .sort()
          .join(";"),
    );
    if (cacheable) {
      const cached = await cacheGet<DemoPick[]>(key);
      if (cached) return { picks: cached };
    }

    try {
      const ipHash = await clientIpHash();
      if (data.count === 1) await enforceLimit({ ipHash }, "demo-refill", 30);
      else await enforceLimit({ ipHash }, "demo", 10);
    } catch (e) {
      return { picks: [], error: (e as Error).message };
    }

    const loved = data.picks.map((p) => ({
      id: "",
      title: p.title,
      year: p.year ?? null,
      rating: 9,
      watched_on: null,
    }));
    const profile = {
      total: loved.length,
      loved: loved as never,
      liked: [],
      disliked: [],
      recent: [],
      decades: [],
      averageRating: null,
    };
    const selected = data.picks.map((p) => `${p.title}${p.year ? ` (${p.year})` : ""}`);
    try {
      const { generateResolvedPicks } = await import("./recommend.server");
      const resolved = await generateResolvedPicks(
        profile,
        [...selected, ...data.exclude],
        null,
        data.mediaType,
        data.count,
        { refine: data.refine ?? null, note, anchors: selected },
      );
      if (resolved.length < data.count) {
        return { picks: [], error: "We couldn’t find picks right now. Please try again." };
      }
      const picks: DemoPick[] = resolved.map((s) => ({
        title: s.meta.title || s.title,
        year: s.meta.year ?? s.year ?? null,
        matchScore: Math.min(99, Math.max(1, Math.round(s.matchScore))),
        posterUrl: s.meta.posterUrl,
        overview: s.meta.overview,
        genres: s.meta.genres,
        because: s.because,
        hook: s.hook,
      }));
      if (cacheable) await cacheSet(key, picks);
      return { picks };
    } catch (e) {
      console.error(e);
      return { picks: [], error: "We couldn’t find picks right now. Please try again." };
    }
  });
