/**
 * Movie & series metadata lookup via Cinemeta — a free, key-less public catalog.
 * Server-only helper: never import from client code.
 */

export type MediaType = "movie" | "series";

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

export async function searchMovies(
  query: string,
  limit = 12,
  type: MediaType = "movie",
): Promise<MovieMeta[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const res = await fetch(
      `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(trimmed)}.json`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return [];
    const body = (await res.json()) as { metas?: CinemetaMeta[] };
    return (body.metas ?? []).slice(0, limit).map(mapMeta);
  } catch {
    return [];
  }
}

/**
 * Full metadata (synopsis, genres) for an IMDb id.
 * The search catalog only returns title/poster/year — descriptions live here.
 */
export async function getMetaById(
  imdbId: string,
  type: MediaType = "movie",
): Promise<MovieMeta | null> {
  try {
    const res = await fetch(`${CINEMETA}/meta/${type}/${encodeURIComponent(imdbId)}.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { meta?: CinemetaMeta };
    return body.meta ? mapMeta(body.meta) : null;
  } catch {
    return null;
  }
}

/** Best match for a title (+ optional year), enriched with the full synopsis. */
export async function lookupMovie(
  title: string,
  year?: number | null,
  type: MediaType = "movie",
): Promise<MovieMeta | null> {
  const results = await searchMovies(title, 10, type);
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
  const best = scored[0]!.score > 0 ? scored[0]!.meta : results[0]!;

  if (!best.imdbId) return best;
  const full = await getMetaById(best.imdbId, type);
  if (!full) return best;
  return {
    ...best,
    overview: full.overview ?? best.overview,
    genres: full.genres.length ? full.genres : best.genres,
    year: best.year ?? full.year,
    posterUrl: best.posterUrl ?? full.posterUrl,
  };
}

function matchConfidence(meta: MovieMeta | null, title: string, year?: number | null): number {
  if (!meta) return -1;
  const target = normalize(title);
  const candidate = normalize(meta.title);
  let score = candidate === target ? 100 : candidate.includes(target) || target.includes(candidate) ? 55 : 0;
  if (year && meta.year) score += Math.max(-25, 30 - Math.abs(meta.year - year) * 10);
  return score;
}

/** Identify an untyped CSV row by comparing the movie and series catalogues. */
export async function identifyMedia(
  title: string,
  year?: number | null,
): Promise<{ mediaType: MediaType; meta: MovieMeta } | null> {
  const [movie, series] = await Promise.all([
    lookupMovie(title, year, "movie"),
    lookupMovie(title, year, "series"),
  ]);
  const movieScore = matchConfidence(movie, title, year);
  const seriesScore = matchConfidence(series, title, year);
  if (movieScore < 0 && seriesScore < 0) return null;
  if (seriesScore > movieScore && series) return { mediaType: "series", meta: series };
  return movie ? { mediaType: "movie", meta: movie } : series ? { mediaType: "series", meta: series } : null;
}

/** Resolve many titles with bounded concurrency. */
export async function lookupMany(
  items: { title: string; year?: number | null; type?: MediaType }[],
  concurrency = 6,
  defaultType: MediaType = "movie",
): Promise<(MovieMeta | null)[]> {
  const results: (MovieMeta | null)[] = new Array(items.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index]!;
      results[index] = await lookupMovie(item.title, item.year ?? null, item.type ?? defaultType);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
