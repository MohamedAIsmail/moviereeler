import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Check, Clapperboard, Eye, Loader2, Play, Plus, Search, Sparkles, X } from "lucide-react";
import { RefineBar } from "@/components/RefineBar";
import { trailerUrl, type RefineKey } from "@/lib/refine";
import { toast } from "sonner";
import { demoRecommend, demoSearch, type DemoPick } from "@/lib/demo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Poster } from "@/components/Poster";
import { MediaToggle } from "@/components/MediaToggle";

export const Route = createFileRoute("/try")({
  head: () => ({
    meta: [
      { title: "Try Reeler — Get 3 picks without signing up" },
      {
        name: "description",
        content: "Pick a few movies or series you love and get three recommendations instantly. No account needed.",
      },
      { property: "og:title", content: "Try Reeler — Get 3 picks without signing up" },
      {
        property: "og:description",
        content: "Pick a few favourites and see what Reeler recommends. No account needed.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TryPage,
});

type Item = { title: string; year: number | null; posterUrl: string | null };

function TryPage() {
  const search = useServerFn(demoSearch);
  const recommend = useServerFn(demoRecommend);
  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [picked, setPicked] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const reqId = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [slate, setSlate] = useState<DemoPick[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]); // shown, seen or rejected this session
  const [refine, setRefine] = useState<RefineKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const noun = mediaType === "series" ? "series" : "movies";

  // Search as you type; only the latest request is allowed to update results.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const id = ++reqId.current;
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const r = await search({ data: { query: q, mediaType } });
        if (id === reqId.current) setResults(r);
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) {
          setSearching(false);
          setSearched(true);
        }
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, mediaType, search]);

  function add(item: Item) {
    if (picked.length >= 10 || picked.some((p) => p.title === item.title && p.year === item.year)) return;
    setPicked([...picked, item]);
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  const label = (p: { title: string; year: number | null }) =>
    `${p.title}${p.year ? ` (${p.year})` : ""}`;

  async function fetchPicks(opts: { count: number; refine: RefineKey | null; exclude: string[] }) {
    const res = await recommend({
      data: {
        mediaType,
        picks: picked.map((p) => ({ title: p.title, year: p.year })),
        exclude: opts.exclude.slice(-150),
        refine: opts.refine,
        note: note.trim() || null,
        count: opts.count,
      },
    });
    if (res.error) toast.error(res.error);
    return res.picks;
  }

  async function go() {
    setLoading(true);
    setSlate([]);
    setRefine(null);
    try {
      const picks = await fetchPicks({ count: 3, refine: null, exclude: excluded });
      setSlate(picks);
      setExcluded((x) => [...x, ...picks.map(label)]);
    } finally {
      setLoading(false);
    }
  }

  async function runRefine(k: RefineKey) {
    setRefine(k);
    setBusy(true);
    try {
      const picks = await fetchPicks({ count: 3, refine: k, exclude: excluded });
      if (picks.length) {
        setSlate(picks);
        setExcluded((x) => [...x, ...picks.map(label)]);
      }
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    setBusy(true);
    try {
      const picks = await fetchPicks({ count: 3, refine, exclude: excluded });
      setSlate((s) => [...s, ...picks]);
      setExcluded((x) => [...x, ...picks.map(label)]);
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(item: DemoPick) {
    const index = slate.indexOf(item);
    setSlate((s) => s.filter((x) => x !== item));
    const nextExcluded = [...excluded, label(item)];
    setExcluded(nextExcluded);
    const [replacement] = await fetchPicks({ count: 1, refine, exclude: nextExcluded });
    if (replacement) {
      setExcluded((x) => [...x, label(replacement)]);
      setSlate((s) => {
        const copy = [...s];
        copy.splice(Math.min(index, copy.length), 0, replacement);
        return copy;
      });
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-lg font-bold">Reeler</span>
        </Link>
        <Button asChild variant="ghost" size="sm">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-5 pb-20">
        <h1 className="mt-6 font-display text-3xl font-bold sm:text-4xl">
          Pick a few {noun} you love.
        </h1>
        <p className="mt-2 text-muted-foreground">
          Choose 3 to 10 and we’ll suggest three you’re likely to enjoy. No account needed.
        </p>

        <div className="mt-6">
          <MediaToggle
            value={mediaType}
            onChange={(v) => {
              setMediaType(v);
              setResults([]);
              setPicked([]);
              setSlate([]);
              setExcluded([]);
              setRefine(null);
            }}
          />
        </div>

        {/* Your picks shelf */}
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-medium">
              Your favourites <span className="text-muted-foreground">· {picked.length}/10</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {picked.length < 3 ? `${3 - picked.length} more to go` : "Nice — add more for sharper picks"}
            </p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.min(100, (picked.length / 3) * 100)}%` }}
            />
          </div>
          <ul className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-10">
            {Array.from({ length: Math.max(5, Math.min(10, picked.length + 1)) }).map((_, i) => {
              const p = picked[i];
              return (
                <li key={p ? `${p.title}-${p.year}` : `slot-${i}`} className="relative">
                  {p ? (
                    <button
                      aria-label={`Remove ${p.title}`}
                      onClick={() => setPicked(picked.filter((x) => x !== p))}
                      className="group relative block w-full"
                    >
                      <Poster title={p.title} year={p.year} posterUrl={p.posterUrl} />
                      <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-background/85 opacity-90 group-hover:opacity-100">
                        <X className="size-3" />
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={() => inputRef.current?.focus()}
                      className="grid aspect-[2/3] w-full place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-primary"
                      aria-label="Add a favourite"
                    >
                      <Plus className="size-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        {/* Live search */}
        <div className="relative mt-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mediaType === "series" ? "Start typing a series you love…" : "Start typing a movie you love…"}
            className="h-12 rounded-full pl-11 pr-11 text-base"
            disabled={picked.length >= 10}
          />
          {searching ? (
            <Loader2 className="absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : query ? (
            <button
              aria-label="Clear search"
              onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {query.trim().length >= 2 && !searching && searched && results.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            Nothing found for “{query.trim()}”. Try a shorter title or check the spelling.
          </p>
        )}

        {results.length > 0 && (
          <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {results.map((r) => {
              const chosen = picked.some((p) => p.title === r.title && p.year === r.year);
              return (
                <li key={`${r.title}-${r.year}`}>
                  <button
                    onClick={() => (chosen ? setPicked(picked.filter((p) => !(p.title === r.title && p.year === r.year))) : add(r))}
                    className="group block w-full text-left"
                  >
                    <div className={`relative overflow-hidden rounded-lg ring-2 transition ${chosen ? "ring-primary" : "ring-transparent group-hover:ring-primary/50"}`}>
                      <Poster title={r.title} year={r.year} posterUrl={r.posterUrl} />
                      <span className={`absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full ${chosen ? "bg-primary text-primary-foreground" : "bg-background/85 text-foreground"}`}>
                        {chosen ? <Check className="size-4" /> : <Plus className="size-4" />}
                      </span>
                    </div>
                    <p className="mt-1.5 truncate text-xs font-medium">{r.title}</p>
                    <p className="text-xs text-muted-foreground">{r.year ?? ""}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <Button className="mt-6 w-full sm:w-auto" size="lg" disabled={picked.length < 3 || loading} onClick={go}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {picked.length < 3 ? `Pick ${3 - picked.length} more` : "Show my picks"}
        </Button>

        {slate.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-semibold">You might enjoy</h2>
            <ul className="mt-4 space-y-4">
              {slate.filter((item) => item.posterUrl || item.overview).map((item) => (
                <li
                  key={`${item.title}-${item.year}`}
                  className="flex gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:gap-6 sm:p-5"
                >
                  <div className="w-24 shrink-0 sm:w-32">
                    <Poster title={item.title} year={item.year} posterUrl={item.posterUrl} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3">
                      <h3 className="font-display text-lg font-semibold">{item.title}</h3>
                      <span className="text-sm text-muted-foreground">{item.year ?? ""}</span>
                      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
                        {item.matchScore}% match
                      </span>
                    </div>
                    {item.genres.length > 0 && (
                      <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                        {item.genres.slice(0, 3).join(" · ")}
                      </p>
                    )}
                    <p className="mt-3 text-sm font-medium leading-relaxed text-primary">
                      {item.because}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                      {item.hook || item.overview}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => void dismiss(item)}>
                        <Eye className="size-4" />
                        Seen it
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void dismiss(item)}>
                        <Ban className="size-4" />
                        Not for me
                      </Button>
                      <Button asChild variant="ghost" size="sm">
                        <a href={trailerUrl(item.title, item.year)} target="_blank" rel="noopener noreferrer">
                          <Play className="size-4" />
                          Trailer
                        </a>
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <RefineBar
              busy={busy}
              active={refine}
              note={note}
              onNote={setNote}
              onRefine={(k) => void runRefine(k)}
              onMore={() => void more()}
            />
            <div className="mt-8 rounded-2xl border border-border/70 bg-card p-6 text-center">
              <p className="font-display text-lg font-semibold">Want better picks?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Create a free account and bring your full watch history for a dozen picks at a time.
              </p>
              <Button asChild className="mt-4">
                <Link to="/auth">Create free account</Link>
              </Button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
