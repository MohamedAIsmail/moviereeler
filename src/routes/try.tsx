import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Check, Clapperboard, Eye, Loader2, Play, Plus, Search, Sparkles, X } from "lucide-react";
import { RefineBar } from "@/components/RefineBar";
import { trailerUrl, type RefineKey } from "@/lib/refine";
import { AlertCircle } from "lucide-react";
import { demoCandidates, demoLookup, demoResolve, demoSearch, type DemoPick } from "@/lib/demo.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Poster } from "@/components/Poster";
import { MediaToggle } from "@/components/MediaToggle";
import { PickReactions } from "@/components/PickReactions";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/try")({
  validateSearch: (s: Record<string, unknown>): { add?: string } =>
    typeof s.add === "string" && /^tt\d{5,10}$/.test(s.add) ? { add: s.add } : {},
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

type Slot = { key: string; pick: DemoPick | null };
let slotSeq = 0;
const newKeys = (n: number) => Array.from({ length: n }, () => `slot-${++slotSeq}`);

function TryPage() {
  const searchFn = useServerFn(demoSearch);
  const searchRef = useRef(searchFn);
  searchRef.current = searchFn;
  const getCandidates = useServerFn(demoCandidates);
  const resolveOne = useServerFn(demoResolve);
  const [mediaType, setMediaType] = useState<"movie" | "series">("movie");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [picked, setPicked] = useState<Item[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [searchSlow, setSearchSlow] = useState<null | "retrying" | "failed">(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [slate, setSlate] = useState<Slot[]>([]);
  const [excluded, setExcluded] = useState<string[]>([]); // shown, seen or rejected this session
  const [refine, setRefine] = useState<RefineKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState<{ message: string; limit: boolean } | null>(null);
  const retryRef = useRef<null | (() => void)>(null);

  const noun = mediaType === "series" ? "series" : "movies";

  const { add: addId } = Route.useSearch();
  const lookupFn = useServerFn(demoLookup);
  useEffect(() => {
    if (!addId) return;
    let live = true;
    lookupFn({ data: { imdbId: addId } })
      .then((m) => {
        if (!live || !m) return;
        setMediaType("movie");
        setPicked((cur) => (cur.some((p) => p.title === m.title && p.year === m.year) ? cur : [m, ...cur].slice(0, 10)));
        track("film_added", { title: m.title, year: m.year, media_type: "movie", source: "seo_prefill" });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addId]);

  // Debounced search (300ms); outdated requests are aborted.
  useEffect(() => {
    const q = query.trim();
    setSearchSlow(null);
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        for (let attempt = 0; attempt < 2; attempt++) {
          let r: Awaited<ReturnType<typeof searchFn>> | null = null;
          try {
            r = await searchRef.current({ data: { query: q, mediaType } });
          } catch {
            if (ctrl.signal.aborted) return;
          }
          if (ctrl.signal.aborted) return;
          if (r && !r.failed) {
            track("search", { query: q, media_type: mediaType, results: r.results.length, page: "try" });
            setResults(r.results);
            setSearchSlow(null);
            setSearched(true);
            return;
          }
          setSearchSlow(attempt === 0 ? "retrying" : "failed");
        }
        setResults([]);
        setSearched(true);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, mediaType]);

  function add(item: Item) {
    if (picked.length >= 10 || picked.some((p) => p.title === item.title && p.year === item.year)) return;
    setPicked([...picked, item]);
    track("film_added", { title: item.title, year: item.year, media_type: mediaType, source: "try" });
    setQuery("");
    setResults([]);
    inputRef.current?.focus();
  }

  const label = (p: { title: string; year: number | null }) =>
    `${p.title}${p.year ? ` (${p.year})` : ""}`;

  const GENERIC = "Something went wrong — try again";

  /** Fill the given (skeleton) slots: one fast AI call, then resolve each pick in parallel. */
  async function fill(keys: string[], opts: { refine: RefineKey | null; exclude: string[] }) {
    const dropSlots = () => setSlate((s) => s.filter((x) => !keys.includes(x.key) || x.pick));
    setGenError(null);
    track("picks_requested", { count: keys.length, refine: opts.refine, media_type: mediaType, favourites: picked.length });
    let res: Awaited<ReturnType<typeof getCandidates>>;
    try {
      res = await Promise.race([
        getCandidates({
          data: {
            mediaType,
            picks: picked.map((p) => ({ title: p.title, year: p.year })),
            exclude: opts.exclude.slice(-150),
            refine: opts.refine,
            note: note.trim() || null,
            count: keys.length,
          },
        }),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 30_000)),
      ]);
    } catch {
      res = { candidates: [], error: GENERIC, errorCode: "failed" };
    }
    if (res.error || !res.candidates.length) {
      setGenError({
        message: res.error ?? GENERIC,
        limit: res.errorCode === "rate_limit",
      });
      dropSlots();
      return;
    }
    const queue = [...res.candidates];
    const shown = queue.map(label);
    setExcluded((x) => [...x, ...shown]);
    const exclude = [...opts.exclude, ...shown].slice(-160);
    const resolved: DemoPick[] = [];
    await Promise.all(
      keys.map(async (key) => {
        while (queue.length) {
          const candidate = queue.shift()!;
          const pick = await resolveOne({ data: { mediaType, exclude, candidate } }).catch(() => null);
          if (pick) {
            resolved.push(pick);
            setSlate((s) => s.map((x) => (x.key === key ? { key, pick } : x)));
            return;
          }
        }
        setSlate((s) => s.filter((x) => x.key !== key));
      }),
    );
    track("picks_shown", {
      titles: resolved.map(label),
      refine: opts.refine,
      media_type: mediaType,
    });
  }

  async function go() {
    retryRef.current = () => void go();
    const keys = newKeys(3);
    setLoading(true);
    setRefine(null);
    setSlate(keys.map((key) => ({ key, pick: null })));
    try {
      await fill(keys, { refine: null, exclude: excluded });
    } finally {
      setLoading(false);
    }
  }

  async function runRefine(k: RefineKey) {
    retryRef.current = () => void runRefine(k);
    const keys = newKeys(3);
    setRefine(k);
    setBusy(true);
    setSlate(keys.map((key) => ({ key, pick: null })));
    try {
      await fill(keys, { refine: k, exclude: excluded });
    } finally {
      setBusy(false);
    }
  }

  async function more() {
    retryRef.current = () => void more();
    const keys = newKeys(3);
    setBusy(true);
    setSlate((s) => [...s, ...keys.map((key) => ({ key, pick: null }))]);
    try {
      await fill(keys, { refine, exclude: excluded });
    } finally {
      setBusy(false);
    }
  }

  async function dismiss(slot: Slot, kind: "seen_it" | "not_for_me") {
    if (!slot.pick) return;
    track(kind, { title: slot.pick.title, year: slot.pick.year, page: "try" });
    const [key] = newKeys(1);
    setSlate((s) => s.map((x) => (x.key === slot.key ? { key: key!, pick: null } : x)));
    const nextExcluded = [...excluded, label(slot.pick)];
    setExcluded(nextExcluded);
    await fill([key!], { refine, exclude: nextExcluded });
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

        {query.trim().length >= 2 && searchSlow && (
          <p className="mt-4 text-sm text-muted-foreground">
            {searchSlow === "retrying"
              ? "Search is slow, retrying…"
              : "Search is slow right now. Give it a moment and try again."}
          </p>
        )}

        {query.trim().length >= 2 && !searching && searched && !searchSlow && results.length === 0 && (
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

        {genError && (
          <div className="mt-8 rounded-2xl border border-border/70 bg-card p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold">
                  {genError.limit ? "That’s today’s free picks" : "Something went wrong"}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{genError.message}</p>
                <div className="mt-4">
                  {genError.limit ? (
                    <Button asChild>
                      <Link to="/auth">Create free account</Link>
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setGenError(null);
                        retryRef.current?.();
                      }}
                    >
                      Try again
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


        {slate.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-semibold">You might enjoy</h2>
            <ul className="mt-4 space-y-4">
              {slate.map((slot) => {
                const item = slot.pick;
                if (!item)
                  return (
                    <li
                      key={slot.key}
                      aria-busy="true"
                      className="flex animate-pulse gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:gap-6 sm:p-5"
                    >
                      <div className="aspect-[2/3] w-24 shrink-0 rounded-lg bg-secondary sm:w-32" />
                      <div className="flex-1 space-y-3 pt-1">
                        <div className="h-5 w-1/2 rounded bg-secondary" />
                        <div className="h-3 w-1/4 rounded bg-secondary" />
                        <div className="h-4 w-full rounded bg-secondary" />
                        <div className="h-4 w-5/6 rounded bg-secondary" />
                      </div>
                    </li>
                  );
                if (!item.posterUrl && !item.overview) return null;
                return (
                <li
                  key={slot.key}
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
                      <Button variant="secondary" size="sm" onClick={() => void dismiss(slot, "seen_it")}>
                        <Eye className="size-4" />
                        Seen it
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void dismiss(slot, "not_for_me")}>
                        <Ban className="size-4" />
                        Not for me
                      </Button>
                      <PickReactions title={item.title} year={item.year} page="try" />
                      <Button asChild variant="ghost" size="sm">
                        <a
                          href={trailerUrl(item.title, item.year)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => track("trailer_clicked", { title: item.title, year: item.year, page: "try" })}
                        >
                          <Play className="size-4" />
                          Trailer
                        </a>
                      </Button>
                    </div>
                  </div>
                </li>
                );
              })}
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
