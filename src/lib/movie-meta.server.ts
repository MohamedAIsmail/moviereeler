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

function calculateScore(title: string, year: number | null, meta: MovieMeta): number {
  const target = normalize(title);
  const candidate = normalize(meta.title);
  let score = 0;
  
  if (candidate === target) score += 100;
  else if (candidate.startsWith(target) || target.startsWith(candidate)) score += 60;
  
  if (year && meta.year) {
    score += Math.max(0, 40 - Math.abs(meta.year - year) * 12);
  }
  
  if (meta.posterUrl) score += 5;
  return score;
}

export async function searchMovies(
  query: string,
  limit = 12,
  type: MediaType = "movie",
): Promise<MovieMeta[]> {
  return (await searchMoviesDetailed(query, limit, type)).results;
}

async function cinemetaSearch(q: string, type: MediaType): Promise<MovieMeta[] | null> {
  try {
    const res = await fetch(
      `${CINEMETA}/catalog/${type}/top/search=${encodeURIComponent(q)}.json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { metas?: CinemetaMeta[] };
    return (body.metas ?? []).map(mapMeta);
  } catch {
    return null;
  }
}

/** Fallback source: IMDb's public title suggestions (key-less). */
async function imdbSuggestSearch(q: string, type: MediaType): Promise<MovieMeta[] | null> {
  try {
    const res = await fetch(
      `https://v3.sg.media-imdb.com/suggestion/x/${encodeURIComponent(q.toLowerCase())}.json`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      d?: { id?: string; l?: string; y?: number; qid?: string; i?: { imageUrl?: string } }[];
    };
    const wanted = type === "series" ? ["tvSeries", "tvMiniSeries"] : ["movie", "tvMovie"];
    return (body.d ?? [])
      .filter((d) => d.id?.startsWith("tt") && d.qid && wanted.includes(d.qid))
      .map((d) => ({
        imdbId: d.id ?? null,
        title: d.l ?? "",
        year: d.y ?? null,
        posterUrl: d.i?.imageUrl ? d.i.imageUrl.replace("._V1_.", "._V1_SX300.") : null,
        overview: null,
        genres: [],
      }));
  } catch {
    return null;
  }
}

/**
 * Catalog search with a 5s timeout: Cinemeta, one retry, then IMDb suggestions.
 * `failed` is true only when every source errored/timed out (not a real "no match").
 */
export async function searchMoviesDetailed(
  query: string,
  limit = 12,
  type: MediaType = "movie",
): Promise<{ results: MovieMeta[]; failed: boolean }> {
  const trimmed = query.trim();
  if (!trimmed) return { results: [], failed: false };
  const key = `${type}|${trimmed.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && hit.length) return { results: hit.slice(0, limit), failed: false };

  let anyAnswered = false;
  const sources = [
    () => cinemetaSearch(trimmed, type),
    () => cinemetaSearch(trimmed, type),
    () => imdbSuggestSearch(trimmed, type),
  ];
  for (const run of sources) {
    const list = await run();
    if (list) anyAnswered = true;
    if (list && list.length) {
      if (searchCache.size > 500) searchCache.clear();
      searchCache.set(key, list);
      return { results: list.slice(0, limit), failed: false };
    }
  }
  return { results: [], failed: !anyAnswered };
}
const searchCache = new Map<string, MovieMeta[]>();
const metaCache = new Map<string, MovieMeta>();

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

  const scored = results.map((meta) => ({
    meta,
    score: calculateScore(title, year ?? null, meta),
  }));

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

/**
 * Poster-only resolution: one catalog search per title (no /meta round-trip),
 * with de-duplication and an in-process cache. Much faster than lookupMany
 * when we only need poster + imdb id.
 */
const posterCache = new Map<string, { posterUrl: string | null; imdbId: string | null }>();

export async function lookupPosters(
  items: { title: string; year?: number | null; type?: MediaType }[],
  concurrency = 20,
): Promise<{ posterUrl: string | null; imdbId: string | null }[]> {
  const cacheKey = (i: { title: string; year?: number | null; type?: MediaType }) =>
    `${i.type ?? "movie"}|${normalize(i.title)}|${i.year ?? ""}`;

  const unique = new Map<string, { title: string; year?: number | null; type?: MediaType }>();
  for (const item of items) {
    const k = cacheKey(item);
    if (!posterCache.has(k) && !unique.has(k)) unique.set(k, item);
  }

  const pending = [...unique.entries()];
  let cursor = 0;
  async function worker() {
    while (cursor < pending.length) {
      const [k, item] = pending[cursor++]!;
      const results = await searchMovies(item.title, 5, item.type ?? "movie");
      let best: MovieMeta | null = null;
      let bestScore = -1;
      for (const meta of results) {
        const score = calculateScore(item.title, item.year ?? null, meta);
        if (score > bestScore) {
          bestScore = score;
          best = meta;
        }
      }
      posterCache.set(k, {
        posterUrl: best?.posterUrl ?? null,
        imdbId: best?.imdbId ?? null,
      });
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, worker),
  );

  if (posterCache.size > 5000) posterCache.clear();

  return items.map(
    (item) => posterCache.get(cacheKey(item)) ?? { posterUrl: null, imdbId: null },
  );
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

/**
 * Identify if a title is a movie or series by comparing search result scores.
 */
export async function classifyMany(
  items: { title: string; year?: number | null }[],
  concurrency = 4,
): Promise<MediaType[]> {
  const results: MediaType[] = new Array(items.length).fill("movie");
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      const { title, year } = items[index]!;
      
      try {
        const [movies, series] = await Promise.all([
          searchMovies(title, 5, "movie"),
          searchMovies(title, 5, "series"),
        ]);
        
        const bestMovie = movies[0] ? calculateScore(title, year ?? null, movies[0]) : -1;
        const bestSeries = series[0] ? calculateScore(title, year ?? null, series[0]) : -1;
        
        // Prefer exact matches. If scores are close, default to movie.
        results[index] = bestSeries > bestMovie ? "series" : "movie";
      } catch {
        results[index] = "movie";
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

/**
 * Resolve an AI pick against the catalog, stopping at the first match:
 * a) imdb id  b) English title + year(±1)  c) original title + year(±1)
 * d) title without leading "The"/"A"/"An" + year(±1)
 */
export async function resolvePick(
  pick: { title: string; year?: number | null; originalTitle?: string | null; imdbId?: string | null },
  type: MediaType = "movie",
): Promise<MovieMeta | null> {
  const year = pick.year ?? null;
  const yearOk = (m: MovieMeta) => !year || !m.year || Math.abs(m.year - year) <= 1;

  if (pick.imdbId && /^tt\d+$/.test(pick.imdbId)) {
    const meta = await getMetaById(pick.imdbId, type);
    if (meta && (meta.posterUrl || meta.overview) && yearOk(meta)) return meta;
  }

  const stripped = pick.title.replace(/^(the|a|an)\s+/i, "").trim();
  const queries = [pick.title, pick.originalTitle ?? "", stripped !== pick.title ? stripped : ""]
    .map((q) => q.trim())
    .filter(Boolean);

  for (const q of queries) {
    const results = await searchMovies(q, 10, type);
    const match = results.find(yearOk);
    if (!match) continue;
    if (!match.imdbId) return match;
    const full = await getMetaById(match.imdbId, type);
    return {
      ...match,
      overview: full?.overview ?? match.overview,
      genres: full?.genres.length ? full.genres : match.genres,
      posterUrl: match.posterUrl ?? full?.posterUrl ?? null,
    };
  }
  return null;
}
