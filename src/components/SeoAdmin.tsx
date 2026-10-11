import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Eye, Loader2, Pencil, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Poster } from "@/components/Poster";
import { SeoPageBody } from "@/components/SeoPageBody";
import {
  adminCreateSeoDraft,
  adminDeleteSeoPage,
  adminListSeoPages,
  adminRegenerateSeoRec,
  adminSaveSeoPage,
  adminSearchFilm,
  type SeoPage,
} from "@/lib/seo.functions";

type Found = { imdbId: string | null; title: string; year: number | null; posterUrl: string | null };

export function SeoAdmin() {
  const qc = useQueryClient();
  const list = useServerFn(adminListSeoPages);
  const search = useServerFn(adminSearchFilm);
  const create = useServerFn(adminCreateSeoDraft);
  const { data: pages = [], isLoading } = useQuery({ queryKey: ["seo-pages"], queryFn: () => list() });
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState<string | null>(null);
  const [editing, setEditing] = useState<SeoPage | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setSearching(true);
    try {
      setFound(await search({ data: { query: q.trim() } }));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  async function generate(f: Found) {
    if (!f.imdbId) return;
    setCreating(f.imdbId);
    try {
      const page = await create({ data: { imdbId: f.imdbId } });
      toast.success(`Draft ready: Movies like ${page.source_title}`);
      setFound([]);
      setQ("");
      setEditing(page);
      qc.invalidateQueries({ queryKey: ["seo-pages"] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(null);
    }
  }

  if (editing) {
    return (
      <SeoEditor
        page={editing}
        onClose={() => {
          setEditing(null);
          qc.invalidateQueries({ queryKey: ["seo-pages"] });
        }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={runSearch} className="flex gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type a film, e.g. Coherence" />
        <Button type="submit" disabled={searching}>
          {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Find
        </Button>
      </form>
      {found.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {found.map((f) => (
            <li key={f.imdbId} className="rounded-xl bg-secondary/50 p-3">
              <Poster title={f.title} year={f.year} posterUrl={f.posterUrl} />
              <p className="mt-2 text-sm font-medium">
                {f.title} {f.year ? <span className="text-muted-foreground">({f.year})</span> : null}
              </p>
              <Button size="sm" className="mt-2 w-full" disabled={!!creating} onClick={() => generate(f)}>
                {creating === f.imdbId ? <Loader2 className="size-4 animate-spin" /> : null}
                {creating === f.imdbId ? "Writing draft…" : "Generate draft"}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {creating && <p className="text-xs text-muted-foreground">This takes about 15–30 seconds.</p>}

      {isLoading ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : pages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pages yet.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {pages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                Movies like {p.source_title} {p.source_year ? `(${p.source_year})` : ""}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs ${p.status === "published" ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"}`}
                >
                  {p.status}
                </span>
              </span>
              <span className="flex shrink-0 gap-2">
                {p.status === "published" && (
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/movies-like/$slug" params={{ slug: p.slug }} target="_blank">
                      <ExternalLink className="size-4" />
                    </Link>
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                  Edit
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SeoEditor({ page, onClose }: { page: SeoPage; onClose: () => void }) {
  const save = useServerFn(adminSaveSeoPage);
  const regen = useServerFn(adminRegenerateSeoRec);
  const del = useServerFn(adminDeleteSeoPage);
  const [p, setP] = useState<SeoPage>(page);
  const [saving, setSaving] = useState(false);
  const [regenIdx, setRegenIdx] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);

  const set = <K extends keyof SeoPage>(k: K, v: SeoPage[K]) => setP((cur) => ({ ...cur, [k]: v }));
  const setRec = (i: number, k: "because" | "hook", v: string) =>
    setP((cur) => ({ ...cur, recommendations: cur.recommendations.map((r, j) => (j === i ? { ...r, [k]: v } : r)) }));

  async function persist(status: "draft" | "published") {
    setSaving(true);
    try {
      const row = await save({
        data: {
          id: p.id,
          slug: p.slug,
          intro: p.intro,
          meta_title: p.meta_title ?? "",
          meta_description: p.meta_description ?? "",
          recommendations: p.recommendations,
          status,
        },
      });
      setP(row);
      toast.success(status === "published" ? "Published" : "Saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function regenerate(i: number) {
    if (!p.imdb_id) return;
    setRegenIdx(i);
    try {
      const exclude = p.recommendations.map((r) => `${r.title}${r.year ? ` (${r.year})` : ""}`);
      const rec = await regen({ data: { imdbId: p.imdb_id, exclude } });
      setP((cur) => ({ ...cur, recommendations: cur.recommendations.map((r, j) => (j === i ? rec : r)) }));
      toast.success(`Swapped in ${rec.title} — remember to save`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setRegenIdx(null);
    }
  }

  async function remove() {
    if (!confirm("Delete this page permanently?")) return;
    try {
      await del({ data: { id: p.id } });
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onClose}>
          ← All pages
        </Button>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={remove} aria-label="Delete page">
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPreview((v) => !v)}>
            {preview ? <Pencil className="size-4" /> : <Eye className="size-4" />}
            {preview ? "Edit" : "Preview"}
          </Button>
          <Button variant="secondary" size="sm" disabled={saving} onClick={() => persist("draft")}>
            {p.status === "published" ? "Unpublish" : "Save draft"}
          </Button>
          <Button size="sm" disabled={saving} onClick={() => persist("published")}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            {p.status === "published" ? "Save & keep live" : "Publish"}
          </Button>
        </div>
      </div>

      {preview ? (
        <div className="overflow-hidden rounded-2xl border border-border/70 bg-background">
          <p className="border-b border-border/60 px-5 py-2 text-xs text-muted-foreground">
            Preview of your current edits{p.status === "published" ? "" : " — not live yet"}. “More like this” links appear on the live page.
          </p>
          <SeoPageBody page={p} related={[]} />
        </div>
      ) : (
        <>
          <h3 className="font-display text-2xl font-bold">
            Movies like {p.source_title} {p.source_year ? `(${p.source_year})` : ""}
          </h3>

          <label className="block text-xs text-muted-foreground">
            Web address: /movies-like/
            <Input value={p.slug} onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Search title ({(p.meta_title ?? "").length} chars)
            <Input value={p.meta_title ?? ""} onChange={(e) => set("meta_title", e.target.value)} className="mt-1" />
          </label>
          <label className="block text-xs text-muted-foreground">
            Search description ({(p.meta_description ?? "").length} chars)
            <Textarea value={p.meta_description ?? ""} onChange={(e) => set("meta_description", e.target.value)} className="mt-1" rows={2} />
          </label>
          <label className="block text-xs text-muted-foreground">
            Intro
            <Textarea value={p.intro} onChange={(e) => set("intro", e.target.value)} className="mt-1" rows={4} />
          </label>

          <ol className="space-y-4">
            {p.recommendations.map((r, i) => (
              <li key={`${r.title}-${i}`} className="flex gap-4 rounded-xl bg-secondary/50 p-3">
                <Poster title={r.title} year={r.year} posterUrl={r.poster} className="w-20 shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {i + 1}. {r.title} <span className="text-muted-foreground">{r.year}</span>
                    </p>
                    <Button size="sm" variant="ghost" disabled={regenIdx !== null} onClick={() => regenerate(i)}>
                      {regenIdx === i ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      Replace
                    </Button>
                  </div>
                  <Textarea value={r.because} onChange={(e) => setRec(i, "because", e.target.value)} rows={2} aria-label="Because" />
                  <Textarea value={r.hook} onChange={(e) => setRec(i, "hook", e.target.value)} rows={2} aria-label="Hook" />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}
