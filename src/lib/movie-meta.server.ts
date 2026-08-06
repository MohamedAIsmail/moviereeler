/**
 * Movie metadata lookup via Cinemeta — a free, key-less public catalog.
 * Server-only helper: never import from client code.
 */

export interface MovieMeta {
  imdbId: string | null;
  title: string;
  year: number | null;
  posterUrl: string | null;
  overview: string | null;
  genres: string[];
}

const CINEMETA = "https://v3-cinemeta.strem.io";

interface CinemetaMeta {
  id?: string;
  name?: string;
  poster?: string;
  releaseInfo?: string;
  description?: string;
  genres?: string[];
  genre?: string[];
}

function toYear(releaseInfo?: string): number | null {
  if (!releaseInfo) return null;
  const match = /\d{4}/.exec(releaseInfo);
  return match ? Number(match[0]) : null;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function mapMeta(meta: CinemetaMeta): MovieMeta {
  return {
    imdbId: meta.id ?? null,
    title: meta.name ?? "",
    year: toYear(meta.releaseInfo),
    posterUrl: meta.poster ?? null,
    overview: meta.description ?? null,
    genres: meta.genres ?? meta.genre ?? [],
  };
}

export async function searchMovies(query: string, limit = 12): Promise<MovieMeta[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const res = await fetch(
      `${CINEMETA}/catalog/movie/top/search=${encodeURIComponent(trimmed)}.json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { metas?: CinemetaMeta[] };
    return (body.metas ?? []).slice(0, limit).map(mapMeta);
  } catch {
    return [];
  }
}

/** Best match for a title (+ optional year). */
export async function lookupMovie(title: string, year?: number | null): Promise<MovieMeta | null> {
  const results = await searchMovies(title, 10);
  if (results.length === 0) return null;
  const target = normalize(title);

  const scored = results.map((meta) => {
    let score = 0;
    const candidate = normalize(meta.title);
    if (candidate === target) score += 100;
    else if (candidate.startsWith(target) || target.startsWith(candidate)) score += 60;
    if (year && meta.year) score += Math.max(0, 40 - Math.abs(meta.year - year) * 12);
    if (meta.posterUrl) score += 5;
    return { meta, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.score > 0 ? scored[0]!.meta : results[0]!;
}

/** Resolve many titles with bounded concurrency. */
export async function lookupMany(
  items: { title: string; year?: number | null }[],
  concurrency = 6,
): Promise<(MovieMeta | null)[]> {
  const results: (MovieMeta | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      results[index] = await lookupMovie(item.title, item.year ?? null);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
