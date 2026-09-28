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
    const results = await searchMovies(data.query, 8, data.mediaType);
    return results.map((r) => ({ title: r.title, year: r.year, posterUrl: r.posterUrl }));
  });

export interface DemoPick {
  title: string;
  year: number | null;
  matchScore: number;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
}

export const demoRecommend = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        picks: z.array(Pick).min(3).max(10),
        mediaType: z.enum(["movie", "series"]),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ picks: DemoPick[]; error?: string }> => {
    const { sha, cacheGet, cacheSet, clientIpHash, enforceLimit } = await import(
      "./usage.server"
    );
    const key = await sha(
      data.mediaType +
        "|" +
        data.picks
          .map((p) => `${p.title.toLowerCase()}|${p.year ?? ""}`)
          .sort()
          .join(";"),
    );
    const cached = await cacheGet<DemoPick[]>(key);
    if (cached) return { picks: cached };

    try {
      await enforceLimit({ ipHash: await clientIpHash() }, "demo", 5);
    } catch (e) {
      return { picks: [], error: (e as Error).message };
    }

    const { generateSlate } = await import("./recommend.server");
    const { lookupMany } = await import("./movie-meta.server");
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
    try {
      const { generateResolvedPicks } = await import("./recommend.server");
      const resolved = await generateResolvedPicks(
        profile,
        data.picks.map((p) => `${p.title}${p.year ? ` (${p.year})` : ""}`),
        null,
        data.mediaType,
        3,
      );
      if (resolved.length < 3) {
        return { picks: [], error: "We couldn’t find picks right now. Please try again." };
      }
      const picks: DemoPick[] = resolved.map((s) => ({
        title: s.meta.title || s.title,
        year: s.meta.year ?? s.year ?? null,
        matchScore: Math.min(99, Math.max(1, Math.round(s.matchScore))),
        posterUrl: s.meta.posterUrl,
        overview: s.meta.overview,
        genres: s.meta.genres,
      }));
      await cacheSet(key, picks);
      return { picks };
    } catch (e) {
      console.error(e);
      return { picks: [], error: "We couldn’t find picks right now. Please try again." };
    }
  });
