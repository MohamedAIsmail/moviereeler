import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export interface SeoRec {
  title: string;
  year: number | null;
  imdb_id: string | null;
  poster: string | null;
  because: string;
  hook: string;
}

export interface SeoPage {
  id: string;
  slug: string;
  source_title: string;
  source_year: number | null;
  imdb_id: string | null;
  source_poster: string | null;
  intro: string;
  meta_title: string | null;
  meta_description: string | null;
  recommendations: SeoRec[];
  status: "draft" | "published";
  updated_at: string;
}

export interface SeoLink {
  slug: string;
  source_title: string;
  source_year: number | null;
  source_poster: string | null;
}

function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const LINK_COLS = "slug, source_title, source_year, source_poster";

export const getPublishedSeoPage = createServerFn({ method: "GET" })
  .inputValidator((d: { slug: string }) => z.object({ slug: z.string().min(1).max(120) }).parse(d))
  .handler(async ({ data }) => {
    const db = publicClient();
    const { data: page, error } = await db
      .from("seo_pages")
      .select("*")
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) return null;
    const { data: more } = await db
      .from("seo_pages")
      .select(LINK_COLS)
      .eq("status", "published")
      .neq("slug", data.slug)
      .order("updated_at", { ascending: false })
      .limit(40);
    const pool = more ?? [];
    // Stable-but-varied pick of 6 related links per page.
    const seed = [...data.slug].reduce((a, c) => a + c.charCodeAt(0), 0);
    const related = pool
      .map((p, i) => ({ p, k: (i * 7919 + seed) % 97 }))
      .sort((a, b) => a.k - b.k)
      .slice(0, 6)
      .map((x) => x.p);
    return { page: page as unknown as SeoPage, related: related as SeoLink[] };
  });

export const listPublishedSeoPages = createServerFn({ method: "GET" }).handler(async () => {
  const db = publicClient();
  const { data, error } = await db
    .from("seo_pages")
    .select(LINK_COLS)
    .eq("status", "published")
    .order("source_title")
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data ?? []) as SeoLink[];
});

/* ---------- Admin ---------- */

async function assertAdmin(userId: string) {
  const { isAdminUser } = await import("./usage.server");
  if (!(await isAdminUser(userId))) throw new Error("Forbidden");
}

export const adminListSeoPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await context.supabase
      .from("seo_pages")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SeoPage[];
  });

export const adminSearchFilm = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string }) => z.object({ query: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { searchMovies } = await import("./movie-meta.server");
    return (await searchMovies(data.query, 8, "movie")).filter((m) => m.imdbId);
  });

export const adminCreateSeoDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { imdbId: string }) => z.object({ imdbId: z.string().regex(/^tt\d+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getMetaById } = await import("./movie-meta.server");
    const { generateSeoRecs, generateSeoCopy, slugify } = await import("./seo.server");
    const src = await getMetaById(data.imdbId, "movie");
    if (!src?.title) throw new Error("Couldn't find that film in the catalog.");
    const recs = await generateSeoRecs(src, 10);
    if (recs.length < 8) throw new Error(`Only found ${recs.length} solid picks — try again.`);
    const copy = await generateSeoCopy(src, recs.length);

    let slug = slugify(src.title);
    const { data: clash } = await context.supabase.from("seo_pages").select("id, imdb_id").eq("slug", slug).maybeSingle();
    if (clash && clash.imdb_id !== src.imdbId) slug = `${slug}-${src.year ?? "film"}`;
    if (clash && clash.imdb_id === src.imdbId) throw new Error("A page for this film already exists.");

    const { data: row, error } = await context.supabase
      .from("seo_pages")
      .insert({
        slug,
        source_title: src.title,
        source_year: src.year,
        imdb_id: src.imdbId,
        source_poster: src.posterUrl,
        intro: copy.intro,
        meta_title: copy.meta_title,
        meta_description: copy.meta_description,
        recommendations: recs as unknown as import("@/integrations/supabase/types").Json,
        status: "draft",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as SeoPage;
  });

const RecSchema = z.object({
  title: z.string().min(1).max(300),
  year: z.number().int().nullable(),
  imdb_id: z.string().max(20).nullable(),
  poster: z.string().max(1000).nullable(),
  because: z.string().max(600),
  hook: z.string().max(600),
});

export const adminSaveSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
        intro: z.string().max(2000),
        meta_title: z.string().max(200),
        meta_description: z.string().max(400),
        recommendations: z.array(RecSchema).max(12),
        status: z.enum(["draft", "published"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { id, ...rest } = data;
    const { data: row, error } = await context.supabase
      .from("seo_pages")
      .update({
        ...rest,
        recommendations: rest.recommendations as unknown as import("@/integrations/supabase/types").Json,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row as unknown as SeoPage;
  });

export const adminRegenerateSeoRec = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        imdbId: z.string().regex(/^tt\d+$/),
        exclude: z.array(z.string().max(320)).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { getMetaById } = await import("./movie-meta.server");
    const { generateSeoRecs } = await import("./seo.server");
    const src = await getMetaById(data.imdbId, "movie");
    if (!src?.title) throw new Error("Couldn't load the source film.");
    const [rec] = await generateSeoRecs(src, 1, data.exclude);
    if (!rec) throw new Error("No replacement found — try again.");
    return rec;
  });

export const adminDeleteSeoPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await context.supabase.from("seo_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
