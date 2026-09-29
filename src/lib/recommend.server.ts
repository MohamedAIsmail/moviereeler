import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { MediaType } from "./movie-meta.server";
import { fetchLibrary, type WatchedMovie } from "./movies.server";
import { z } from "zod";
import { REFINES, type RefineKey } from "./refine";

type Client = SupabaseClient<Database>;

export interface TasteProfile {
  total: number;
  loved: WatchedMovie[];
  liked: WatchedMovie[];
  disliked: WatchedMovie[];
  recent: WatchedMovie[];
  decades: { decade: string; count: number }[];
  averageRating: number | null;
}

function label(movie: WatchedMovie) {
  const year = movie.year ? ` (${movie.year})` : "";
  const rating = movie.rating != null ? ` — rated ${movie.rating}/10` : "";
  return `${movie.title}${year}${rating}`;
}

export function buildTasteProfile(library: WatchedMovie[]): TasteProfile {
  const rated = library.filter((movie) => movie.rating != null);
  const decadeCounts = new Map<string, number>();
  for (const movie of library) {
    if (!movie.year) continue;
    const decade = `${Math.floor(movie.year / 10) * 10}s`;
    decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
  }

  return {
    total: library.length,
    loved: rated.filter((m) => (m.rating ?? 0) >= 8.5).slice(0, 45),
    liked: rated.filter((m) => (m.rating ?? 0) >= 7 && (m.rating ?? 0) < 8.5).slice(0, 30),
    disliked: rated.filter((m) => (m.rating ?? 0) <= 4.5).slice(0, 25),
    recent: [...library]
      .sort((a, b) => (b.watched_on ?? "").localeCompare(a.watched_on ?? ""))
      .slice(0, 25),
    decades: [...decadeCounts.entries()]
      .map(([decade, count]) => ({ decade, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5),
    averageRating: rated.length
      ? Math.round((rated.reduce((sum, m) => sum + (m.rating ?? 0), 0) / rated.length) * 10) / 10
      : null,
  };
}

export interface GenOptions {
  refine?: RefineKey | null;
  note?: string | null;
  /** Titles the viewer explicitly picked; "because" lines should cite these. */
  anchors?: string[];
  count?: number;
}

function buildPrompt(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType,
  opts: GenOptions,
) {
  const noun = mediaType === "series" ? "TV series" : "films";
  const section = (title: string, movies: WatchedMovie[]) =>
    movies.length ? `${title}:\n${movies.map((m) => `- ${label(m)}`).join("\n")}` : "";
  const refine = opts.refine ? REFINES[opts.refine] : null;

  return [
    `The viewer has logged ${profile.total} ${noun}.` +
      (profile.averageRating != null
        ? ` Their average rating is ${profile.averageRating}/10 — calibrate: a "good" title for them is above that number.`
        : ""),
    profile.decades.length
      ? `Decade distribution: ${profile.decades.map((d) => `${d.decade} (${d.count})`).join(", ")}.`
      : "",
    section("FAVOURITES (strongest positive signal)", profile.loved),
    section("LIKED", profile.liked),
    section("DISLIKED (avoid these qualities)", profile.disliked),
    section("RECENTLY WATCHED (current mood)", profile.recent),
    mood ? `The viewer is specifically in the mood for: "${mood}". Weight this heavily.` : "",
    refine
      ? `REFINE INSTRUCTION (must follow): ${refine.prompt} Every "because" line must reflect this instruction explicitly (e.g. "Lighter than your picks, but it keeps the same...").`
      : "",
    opts.note ? `Extra request from the viewer (must respect): "${opts.note}"` : "",
    `Recommend ONLY ${mediaType === "series" ? "television series (no feature films)" : "feature films (no television series)"}.`,
    `Return ${opts.count ?? 12} recommendations. Across the picks, cite at least 2 different titles from the viewer's list in the "because" lines where possible.`,
    exclude.length
      ? `NEVER RECOMMEND any of these — already selected, seen, rejected or already shown:\n${exclude.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function systemPrompt(mediaType: MediaType) {
  const noun = mediaType === "series" ? "series" : "film";
  return `You are the most perceptive ${mediaType === "series" ? "television" : "film"} curator alive — part critic, part programmer of a repertory ${mediaType === "series" ? "channel" : "cinema"}.

Method (follow strictly):
1. Infer the viewer's underlying taste VECTORS from their ratings, not surface genres: tone, pacing, moral ambiguity, visual style, era affinity, creator/writer signatures, national ${mediaType === "series" ? "television" : "cinemas"}, structural risk-taking, emotional register.
2. Pay close attention to what they rated LOW — those are anti-signals.
3. Where they diverge from popular opinion, that divergence is the most valuable signal you have.
4. Build a slate, not a list: bullseyes, adjacent discoveries and a few genuine stretches. Avoid obvious mass-market ${noun}s unless their profile clearly points there.
5. No franchise filler, no padding with the same creator more than twice, never recommend a title in the exclusion list.
6. Recommend ONLY ${mediaType === "series" ? "TV series" : "feature films"}. The "year" is the first-release year.

For each pick write:
- "because": ONE specific sentence starting with "Because you liked <Title>:" naming at least one title from THEIR list and the concrete connection — tone, themes, structure, pacing, director style or mood. Generic genre words alone ("both are thrillers") are forbidden. Example: "Because you liked Coherence: another low-budget mind-bender where one dinner party unravels reality through dialogue, not effects."
- "hook": a spoiler-free story pitch, at most 2 short lines (~30 words), written to make someone want to press play.

matchScore is your honest confidence from 60-99. Do not inflate.`;
}

export interface RawRecommendation {
  title: string;
  year: number;
  original_title: string | null;
  imdb_id: string | null;
  because: string;
  hook: string;
  matchScore: number;
}

export interface ResolvedPick extends RawRecommendation {
  meta: import("./movie-meta.server").MovieMeta;
}

export const normTitle = (t: string) =>
  t
    .replace(/\s*\(\d{4}\)\s*$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/**
 * Resolve picks against the catalog; drop excluded ones and ones missing a
 * poster or overview, then ask the AI for replacements up to `retries` times.
 */
export async function generateResolvedPicks(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType,
  want: number,
  opts: GenOptions = {},
  retries = 2,
): Promise<ResolvedPick[]> {
  const { resolvePick } = await import("./movie-meta.server");
  const out: ResolvedPick[] = [];
  const shown = [...exclude];
  const seen = new Set<string>(exclude.map(normTitle));

  for (let attempt = 0; attempt <= retries && out.length < want; attempt++) {
    const ask = Math.min(12, Math.max((want - out.length) * 2 + 2, 5));
    const slate = (await generateSlate(profile, shown, mood, mediaType, { ...opts, count: ask }))
      .sort((a, b) => b.matchScore - a.matchScore);
    shown.push(...slate.map((s) => `${s.title}${s.year ? ` (${s.year})` : ""}`));
    const fresh = slate.filter((s) => {
      const k = normTitle(s.title);
      const ko = s.original_title ? normTitle(s.original_title) : "";
      if (seen.has(k) || (ko && seen.has(ko))) {
        console.warn(`[recommend] filtered excluded pick: "${s.title}"`);
        return false;
      }
      seen.add(k);
      return true;
    });

    const candidates = fresh.slice(0, Math.max(want - out.length + 3, want * 2));
    let cursor = 0;
    const resolved: (ResolvedPick | null)[] = new Array(candidates.length).fill(null);
    await Promise.all(
      Array.from({ length: Math.min(6, candidates.length) }, async () => {
        while (cursor < candidates.length) {
          const i = cursor++;
          const s = candidates[i]!;
          const meta = await resolvePick(
            { title: s.title, year: s.year, originalTitle: s.original_title, imdbId: s.imdb_id },
            mediaType,
          );
          if (meta?.posterUrl && meta.overview) {
            // Catalog title may differ from the AI's; re-check it against exclusions.
            const mk = normTitle(meta.title);
            if (mk !== normTitle(s.title) && exclude.some((e) => normTitle(e) === mk)) continue;
            resolved[i] = { ...s, meta };
          } else
            console.warn(
              `[recommend] unresolved ${mediaType}: "${s.title}" (${s.year})` +
                (s.original_title ? ` orig="${s.original_title}"` : "") +
                (s.imdb_id ? ` imdb=${s.imdb_id}` : "") +
                ` poster=${!!meta?.posterUrl} overview=${!!meta?.overview}`,
            );
        }
      }),
    );
    for (const r of resolved) if (r && out.length < want) out.push(r);
  }
  return out;
}

const PickSchema = z.object({
  title: z.string().min(1).max(300),
  year: z.number().int().min(1880).max(2100),
  original_title: z.string().max(300).nullable(),
  imdb_id: z.string().max(20).nullable(),
  because: z.string().min(10).max(400),
  hook: z.string().min(10).max(400),
  matchScore: z.number(),
});
const SlateSchema = z.object({ recommendations: z.array(PickSchema).min(1) });

export async function generateSlate(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType = "movie",
  opts: GenOptions = {},
): Promise<RawRecommendation[]> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await callModel(profile, exclude, mood, mediaType, opts);
    try {
      const jsonText = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
      const parsed = SlateSchema.parse(JSON.parse(jsonText));
      return parsed.recommendations.slice(0, 12);
    } catch (e) {
      console.warn(`[recommend] invalid AI JSON (attempt ${attempt + 1})`, (e as Error).message);
    }
  }
  throw new Error("We couldn’t find picks right now. Please try again.");
}

async function callModel(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType,
  opts: GenOptions,
): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      messages: [
        { role: "system", content: systemPrompt(mediaType) },
        { role: "user", content: buildPrompt(profile, exclude, mood, mediaType, opts) },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "recommendation_slate",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              recommendations: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    title: { type: "string", description: "Common English release title" },
                    year: { type: "integer" },
                    original_title: {
                      type: ["string", "null"],
                      description: "Original-language title if non-English, else null",
                    },
                    imdb_id: {
                      type: ["string", "null"],
                      description: "IMDb id like tt1234567 only if certain, else null",
                    },
                    because: { type: "string" },
                    hook: { type: "string" },
                    matchScore: { type: "integer" },
                  },
                  required: ["title", "year", "original_title", "imdb_id", "because", "hook", "matchScore"],
                },
              },
            },
            required: ["recommendations"],
          },
        },
      },
    }),
  });

  if (res.status === 429) throw new Error("Too many requests right now — try again in a minute.");
  if (res.status === 402) throw new Error("AI credits are exhausted. Add credits to continue.");
  if (!res.ok) throw new Error(`Recommendation engine failed (${res.status}).`);

  const body = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return body.choices?.[0]?.message?.content ?? "";
}

export async function refreshRecommendations(
  supabase: Client,
  userId: string,
  mood: string | null,
  mediaType: MediaType = "movie",
  opts: { count?: number; replaceNew?: boolean; refine?: RefineKey | null; note?: string | null } = {},
) {
  const count = opts.count ?? 12;
  const replaceNew = opts.replaceNew ?? true;
  const library = await fetchLibrary(supabase, userId, mediaType);
  if (library.length < 3) {
    throw new Error(
      mediaType === "series"
        ? "Add at least 3 series to your library first so we can learn what you like."
        : "Add at least 3 movies to your library first so we can learn what you like.",
    );
  }

  const [{ data: previous }, { data: feedback }] = await Promise.all([
    supabase
      .from("recommendations")
      .select("title, year, status")
      .eq("user_id", userId)
      .eq("media_type", mediaType)
      .limit(300),
    supabase
      .from("pick_feedback")
      .select("title, year")
      .eq("user_id", userId)
      .eq("media_type", mediaType)
      .limit(500),
  ]);

  const fmt = (r: { title: string; year: number | null }) => `${r.title}${r.year ? ` (${r.year})` : ""}`;
  const exclude = [
    ...(feedback ?? []).map(fmt),
    ...library.map(fmt),
    ...(previous ?? []).map(fmt),
  ].slice(0, 900);

  const profile = buildTasteProfile(library);
  const resolved = await generateResolvedPicks(profile, exclude, mood, mediaType, count, {
    refine: opts.refine ?? null,
    note: opts.note ?? null,
  });
  if (resolved.length === 0) throw new Error("We couldn’t find any recommendations. Please try again.");

  if (replaceNew) {
    await supabase
      .from("recommendations")
      .delete()
      .eq("user_id", userId)
      .eq("status", "new")
      .eq("media_type", mediaType);
  }

  const rows = resolved.map((item) => {
    const meta = item.meta;
    return {
      user_id: userId,
      title: meta.title || item.title,
      year: meta.year ?? item.year ?? null,
      reason: item.because,
      hook: item.hook,
      match_score: Math.min(99, Math.max(1, Math.round(item.matchScore))),
      poster_url: meta.posterUrl,
      overview: meta.overview,
      genres: meta.genres,
      imdb_id: meta.imdbId,
      media_type: mediaType,
      status: "new",
    };
  });

  const { error } = await supabase.from("recommendations").insert(rows);
  if (error) throw new Error(error.message);

  return { count: rows.length };
}
