import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lookupMany, classifyMany, type MediaType } from "./movie-meta.server";
import type { ImportRow } from "./movies.schema";

type Client = SupabaseClient<Database>;

export type WatchedMovie = Database["public"]["Tables"]["watched_movies"]["Row"];

function key(title: string, year: number | null | undefined) {
  return `${title.trim().toLowerCase()}|${year ?? ""}`;
}

export async function fetchLibrary(
  supabase: Client,
  userId: string,
  mediaType?: MediaType,
): Promise<WatchedMovie[]> {
  let query = supabase.from("watched_movies").select("*").eq("user_id", userId);
  if (mediaType) query = query.eq("media_type", mediaType);
  const { data, error } = await query
    .order("rating", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertLibraryRows(
  supabase: Client,
  userId: string,
  rows: ImportRow[],
  source: string,
  defaultMediaType?: MediaType,
): Promise<{ movies: number; series: number; duplicates: number }> {
  // 1. Auto-classify rows that don't have a media type if no default is provided
  const rowsToClassify = rows.filter((r) => !r.mediaType && !defaultMediaType);
  if (rowsToClassify.length > 0) {
    const detectedTypes = await classifyMany(
      rowsToClassify.map((r) => ({ title: r.title, year: r.year ?? null })),
      6
    );
    rowsToClassify.forEach((row, i) => {
      row.mediaType = detectedTypes[i];
    });
  }

  // 2. Fetch all existing entries for this user
  const { data: existing } = await supabase
    .from("watched_movies")
    .select("title, year, media_type")
    .eq("user_id", userId);
  
  const seen = new Set((existing ?? []).map((row) => `${row.media_type}|${key(row.title, row.year)}`));

  const fresh: Database["public"]["Tables"]["watched_movies"]["Insert"][] = [];
  let duplicates = 0;
  let movieCount = 0;
  let seriesCount = 0;

  for (const row of rows) {
    const finalType = row.mediaType ?? defaultMediaType ?? "movie";
    const rowKey = `${finalType}|${key(row.title, row.year ?? null)}`;
    
    if (seen.has(rowKey)) {
      duplicates++;
      continue;
    }
    seen.add(rowKey);
    
    if (finalType === "movie") movieCount++;
    else seriesCount++;

    fresh.push({
      user_id: userId,
      title: row.title.trim(),
      year: row.year ?? null,
      rating: row.rating ?? null,
      watched_on: row.watchedOn ?? null,
      media_type: finalType,
      source,
    });
  }

  // 3. Insert in batches
  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await supabase.from("watched_movies").insert(fresh.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return { movies: movieCount, series: seriesCount, duplicates };
}

export async function enrichLibraryPosters(
  supabase: Client,
  userId: string,
  batchSize = 60,
): Promise<{ updated: number; remaining: number }> {
  const { data, error } = await supabase
    .from("watched_movies")
    .select("id, title, year, media_type")
    .eq("user_id", userId)
    .is("poster_url", null)
    .limit(batchSize);
  if (error) throw new Error(error.message);

  const pending = data ?? [];
  if (pending.length === 0) return { updated: 0, remaining: 0 };

  const metas = await lookupPosters(
    pending.map((row) => ({
      title: row.title,
      year: row.year,
      type: (row.media_type === "series" ? "series" : "movie") as MediaType,
    })),
    24,
  );

  let updated = 0;
  await Promise.all(
    pending.map(async (row, index) => {
      const meta = metas[index];
      const posterUrl = meta?.posterUrl ?? "";
      const { error: updateError } = await supabase
        .from("watched_movies")
        .update({ poster_url: posterUrl, imdb_id: meta?.imdbId ?? null })
        .eq("id", row.id);
      if (!updateError && posterUrl) updated++;
    }),
  );

  const { count } = await supabase
    .from("watched_movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("poster_url", null);

  return { updated, remaining: count ?? 0 };
}

