import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lookupMany, type MediaType } from "./movie-meta.server";
import { fetchLibrary, type WatchedMovie } from "./movies.server";

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

function buildPrompt(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType,
) {
  const noun = mediaType === "series" ? "TV series" : "films";
  const section = (title: string, movies: WatchedMovie[]) =>
    movies.length ? `${title}:\n${movies.map((m) => `- ${label(m)}`).join("\n")}` : "";

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
    `Recommend ONLY ${mediaType === "series" ? "television series (no feature films)" : "feature films (no television series)"}.`,
    exclude.length
      ? `NEVER recommend any of these — already seen or already suggested:\n${exclude.join(", ")}`
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
2. Pay close attention to what they rated LOW — those are anti-signals. Never recommend something that shares the disliked qualities.
3. Contrast their ratings against the general consensus. Where they diverge from popular opinion, that divergence is the most valuable signal you have.
4. Build a slate, not a list. Roughly: 5 high-confidence bullseyes, 4 adjacent discoveries they likely haven't considered, and 3 genuine stretches that follow one strong thread of their taste. Avoid obvious mass-market ${noun}s unless their profile clearly points there.
5. No franchise filler, no padding with the same creator more than twice, and never recommend a title in the exclusion list.
6. Recommend ONLY ${mediaType === "series" ? "TV series" : "feature films"}. The "year" is the first-release year.

For each pick, the "reason" must name at least one specific title from THEIR list and explain the concrete connection in 1-2 sharp sentences. Never write generic copy.

matchScore is your honest confidence from 60-99. Do not inflate — the stretches should score lower than the bullseyes.`;
}

interface RawRecommendation {
  title: string;
  year: number;
  reason: string;
  matchScore: number;
}

export async function generateSlate(
  profile: TasteProfile,
  exclude: string[],
  mood: string | null,
  mediaType: MediaType = "movie",
): Promise<RawRecommendation[]> {
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
        { role: "user", content: buildPrompt(profile, exclude, mood, mediaType) },
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
                    title: { type: "string" },
                    year: { type: "integer" },
                    reason: { type: "string" },
                    matchScore: { type: "integer" },
                  },
                  required: ["title", "year", "reason", "matchScore"],
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
  const content = body.choices?.[0]?.message?.content ?? "";
  const jsonText = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
  const parsed = JSON.parse(jsonText) as { recommendations?: RawRecommendation[] };
  return (parsed.recommendations ?? []).slice(0, 12);
}

export async function refreshRecommendations(
  supabase: Client,
  userId: string,
  mood: string | null,
  mediaType: MediaType = "movie",
) {
  const library = await fetchLibrary(supabase, userId, mediaType);
  if (library.length < 3) {
    throw new Error(
      mediaType === "series"
        ? "Add at least 3 series to your library first so we can learn what you like."
        : "Add at least 3 movies to your library first so we can learn what you like.",
    );
  }

  const { data: previous } = await supabase
    .from("recommendations")
    .select("title, year, status")
    .eq("user_id", userId)
    .eq("media_type", mediaType)
    .limit(200);

  const exclude = [
    ...library.map((m) => `${m.title}${m.year ? ` (${m.year})` : ""}`),
    ...(previous ?? [])
      .filter((r) => r.status !== "saved")
      .map((r) => `${r.title}${r.year ? ` (${r.year})` : ""}`),
  ].slice(0, 700);

  const profile = buildTasteProfile(library);
  const slate = await generateSlate(profile, exclude, mood, mediaType);
  if (slate.length === 0) throw new Error("We couldn’t find any recommendations. Please try again.");

  const metas = await lookupMany(
    slate.map((item) => ({ title: item.title, year: item.year, type: mediaType })),
  );

  await supabase
    .from("recommendations")
    .delete()
    .eq("user_id", userId)
    .eq("status", "new")
    .eq("media_type", mediaType);

  const rows = slate.map((item, index) => {
    const meta = metas[index];
    return {
      user_id: userId,
      title: item.title,
      year: item.year ?? null,
      reason: item.reason,
      match_score: Math.min(99, Math.max(1, Math.round(item.matchScore))),
      poster_url: meta?.posterUrl ?? null,
      overview: meta?.overview ?? null,
      genres: meta?.genres ?? [],
      imdb_id: meta?.imdbId ?? null,
      media_type: mediaType,
      status: "new",
    };
  });

  const { error } = await supabase.from("recommendations").insert(rows);
  if (error) throw new Error(error.message);

  return { count: rows.length };
}
