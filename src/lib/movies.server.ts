import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { lookupMany, type MediaType } from "./movie-meta.server";
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
  mediaType: MediaType = "movie",
): Promise<{ imported: number; duplicates: number }> {
  const existing = await fetchLibrary(supabase, userId, mediaType);
  const seen = new Set(existing.map((row) => key(row.title, row.year)));

  const fresh: Database["public"]["Tables"]["watched_movies"]["Insert"][] = [];
  let duplicates = 0;

  for (const row of rows) {
    const rowKey = key(row.title, row.year ?? null);
    if (seen.has(rowKey)) {
      duplicates++;
      continue;
    }
    seen.add(rowKey);
    fresh.push({
      user_id: userId,
      title: row.title.trim(),
      year: row.year ?? null,
      rating: row.rating ?? null,
      watched_on: row.watchedOn ?? null,
      media_type: mediaType,
      source,
    });
  }

  for (let i = 0; i < fresh.length; i += 200) {
    const { error } = await supabase.from("watched_movies").insert(fresh.slice(i, i + 200));
    if (error) throw new Error(error.message);
  }

  return { imported: fresh.length, duplicates };
}

/** Fill in posters for library rows that don't have one yet. */
export async function enrichLibraryPosters(
  supabase: Client,
  userId: string,
  batchSize = 18,
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

  const metas = await lookupMany(
    pending.map((row) => ({
      title: row.title,
      year: row.year,
      type: (row.media_type === "series" ? "series" : "movie") as MediaType,
    })),
  );

  let updated = 0;
  await Promise.all(
    pending.map(async (row, index) => {
      const meta = metas[index];
      const posterUrl = meta?.posterUrl;
      if (!posterUrl) {
        // Mark as attempted so we don't loop on it forever.
        await supabase.from("watched_movies").update({ poster_url: "" }).eq("id", row.id);
        return;
      }
      const { error: updateError } = await supabase
        .from("watched_movies")
        .update({ poster_url: posterUrl, imdb_id: meta?.imdbId ?? null })
        .eq("id", row.id);
      if (!updateError) updated++;
    }),
  );

  const { count } = await supabase
    .from("watched_movies")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("poster_url", null);

  return { updated, remaining: count ?? 0 };
}
