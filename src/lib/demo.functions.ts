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
    const { searchMoviesDetailed } = await import("./movie-meta.server");
    const { results, failed } = await searchMoviesDetailed(data.query, 12, data.mediaType);
    return {
      failed,
      results: results.map((r) => ({ title: r.title, year: r.year, posterUrl: r.posterUrl })),
    };
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

export interface DemoCandidate {
  title: string;
  year: number;
  original_title: string | null;
  imdb_id: string | null;
  because: string;
  hook: string;
  matchScore: number;
}

/** Phase 1: AI candidates only — fast. The client resolves each one in parallel. */
export const demoCandidates = createServerFn({ method: "POST" })
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
  .handler(
    async ({
      data,
    }): Promise<{ candidates: DemoCandidate[]; error?: string; errorCode?: string }> => {
      const { sha, cacheGet, cacheSet, clientIpHash, enforceGeneration } = await import(
        "./usage.server"
      );
      const note = data.note?.trim() || null;
      const cacheable = data.exclude.length === 0 && !data.refine && !note && data.count === 3;
      const key = await sha(
        "v3|" +
          data.mediaType +
          "|" +
          data.picks
            .map((p) => `${p.title.toLowerCase()}|${p.year ?? ""}`)
            .sort()
            .join(";"),
      );
      if (cacheable) {
        const cached = await cacheGet<DemoCandidate[]>(key);
        if (cached) return { candidates: cached };
      }

      const gate = await enforceGeneration({ ipHash: await clientIpHash() });
      if (!gate.ok) return { candidates: [], error: gate.message, errorCode: gate.code };

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
        const { generateCandidates } = await import("./recommend.server");
        const candidates = await generateCandidates(
          profile,
          [...selected, ...data.exclude],
          null,
          data.mediaType,
          data.count,
          { refine: data.refine ?? null, note, anchors: selected },
        );
        if (!candidates.length) {
          return {
            candidates: [],
            error: "Something went wrong — try again",
            errorCode: "failed",
          };
        }
        if (cacheable) await cacheSet(key, candidates);
        return { candidates };
      } catch (e) {
        console.error(e);
        return { candidates: [], error: "Something went wrong — try again", errorCode: "failed" };
      }
    },
  );

/** Phase 2: resolve one candidate against the catalog. Null = incomplete, skip it. */
export const demoResolve = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        mediaType: z.enum(["movie", "series"]),
        exclude: z.array(z.string().max(320)).max(160).default([]),
        candidate: z.object({
          title: z.string().min(1).max(300),
          year: z.number().int(),
          original_title: z.string().max(300).nullable(),
          imdb_id: z.string().max(20).nullable(),
          because: z.string().max(400),
          hook: z.string().max(400),
          matchScore: z.number(),
        }),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<DemoPick | null> => {
    const { resolvePick } = await import("./movie-meta.server");
    const { normTitle } = await import("./recommend.server");
    const c = data.candidate;
    const meta = await resolvePick(
      { title: c.title, year: c.year, originalTitle: c.original_title, imdbId: c.imdb_id },
      data.mediaType,
    );
    if (!meta?.posterUrl || !meta.overview) {
      console.warn(`[demo] unresolved ${data.mediaType}: "${c.title}" (${c.year})`);
      return null;
    }
    const mk = normTitle(meta.title);
    if (mk !== normTitle(c.title) && data.exclude.some((e) => normTitle(e) === mk)) return null;
    return {
      title: meta.title || c.title,
      year: meta.year ?? c.year ?? null,
      matchScore: Math.min(99, Math.max(1, Math.round(c.matchScore))),
      posterUrl: meta.posterUrl,
      overview: meta.overview,
      genres: meta.genres,
      because: c.because,
      hook: c.hook,
    };
  });
