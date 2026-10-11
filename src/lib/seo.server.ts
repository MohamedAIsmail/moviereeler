import type { WatchedMovie } from "./movies.server";
import type { TasteProfile } from "./recommend.server";
import type { MovieMeta } from "./movie-meta.server";

export interface SeoRec {
  title: string;
  year: number | null;
  imdb_id: string | null;
  poster: string | null;
  because: string;
  hook: string;
}

export function slugify(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function sourceProfile(src: MovieMeta): TasteProfile {
  const row = {
    id: "seo",
    user_id: "seo",
    title: src.title,
    year: src.year,
    rating: 10,
    watched_on: null,
    poster_url: src.posterUrl,
    imdb_id: src.imdbId,
    source: "seo",
    created_at: new Date().toISOString(),
    media_type: "movie",
  } as WatchedMovie;
  return { total: 1, loved: [row], liked: [], disliked: [], recent: [], decades: [], averageRating: null };
}

const label = (t: string, y: number | null) => `${t}${y ? ` (${y})` : ""}`;

/** Generates up to `want` catalog-verified picks for a single source film. */
export async function generateSeoRecs(src: MovieMeta, want: number, exclude: string[] = []): Promise<SeoRec[]> {
  const { generateResolvedPicks } = await import("./recommend.server");
  const picks = await generateResolvedPicks(
    sourceProfile(src),
    [label(src.title, src.year), ...exclude],
    `Titles that genuinely feel like ${label(src.title, src.year)} — same tone, themes, structure or mood. Every "because" line must start with "Because you liked ${src.title}:" and name a concrete connection.`,
    "movie",
    want,
    { anchors: [src.title], count: Math.min(12, want + 3) },
    2,
  );
  return picks.map((p) => ({
    title: p.meta.title || p.title,
    year: p.meta.year ?? p.year,
    imdb_id: p.meta.imdbId ?? p.imdb_id,
    poster: p.meta.posterUrl,
    because: p.because,
    hook: p.hook,
  }));
}

/** Intro + meta title/description for a "movies like" page. */
export async function generateSeoCopy(src: MovieMeta, count: number) {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("AI is not configured for this project.");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
    body: JSON.stringify({
      model: "google/gemini-3.6-flash",
      reasoning_effort: "low",
      messages: [
        {
          role: "system",
          content:
            "You are a sharp film critic writing for a recommendation site. Be specific and concrete; never generic. No spoilers.",
        },
        {
          role: "user",
          content: `Film: ${label(src.title, src.year)}.\nSynopsis: ${src.overview ?? "n/a"}\n\nWrite:\n- intro: 2–3 sentences explaining what makes this film special — its tone, themes and structure. Concrete details, no clichés like "a must-watch".\n- meta_title: in the style "${count} Movies Like ${src.title} That Mess With Your Head | Reeler" — start with "${count} Movies Like ${src.title}", add a short hook that fits this film's feel, end with " | Reeler". Max 65 characters if possible.\n- meta_description: 140–158 characters, specific to this film, inviting a click.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "seo_copy",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              intro: { type: "string" },
              meta_title: { type: "string" },
              meta_description: { type: "string" },
            },
            required: ["intro", "meta_title", "meta_description"],
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`AI request failed (${res.status}).`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as {
    intro?: string;
    meta_title?: string;
    meta_description?: string;
  };
  return {
    intro: parsed.intro?.trim() ?? "",
    meta_title: parsed.meta_title?.trim() || `${count} Movies Like ${src.title} | Reeler`,
    meta_description: parsed.meta_description?.trim() ?? "",
  };
}
