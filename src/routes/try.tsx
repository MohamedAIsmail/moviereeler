import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Clapperboard, Loader2, Plus, Search, Sparkles, X } from "lucide-react";
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
  const [loading, setLoading] = useState(false);
  const [slate, setSlate] = useState<DemoPick[]>([]);

  const noun = mediaType === "series" ? "series" : "movies";

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await search({ data: { query: query.trim(), mediaType } }));
    } finally {
      setSearching(false);
    }
  }

  function add(item: Item) {
    if (picked.length >= 10 || picked.some((p) => p.title === item.title && p.year === item.year)) return;
    setPicked([...picked, item]);
  }

  async function go() {
    setLoading(true);
    setSlate([]);
    try {
      const res = await recommend({
        data: { mediaType, picks: picked.map((p) => ({ title: p.title, year: p.year })) },
      });
      if (res.error) toast.error(res.error);
      setSlate(res.picks);
    } finally {
      setLoading(false);
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
            }}
          />
        </div>

        <form onSubmit={runSearch} className="mt-4 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mediaType === "series" ? "Search for a series" : "Search for a movie"}
          />
          <Button type="submit" variant="secondary" disabled={searching}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
            Search
          </Button>
        </form>

        {results.length > 0 && (
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {results.map((r) => (
              <li key={`${r.title}-${r.year}`}>
                <button
                  onClick={() => add(r)}
                  className="flex w-full items-center gap-2 rounded-xl border border-border/70 bg-card p-2 text-left text-sm hover:border-primary/60"
                >
                  <div className="w-10 shrink-0">
                    <Poster title={r.title} year={r.year} posterUrl={r.posterUrl} />
                  </div>
                  <span className="min-w-0 flex-1 truncate">
                    {r.title} <span className="text-muted-foreground">{r.year ?? ""}</span>
                  </span>
                  <Plus className="size-4 shrink-0 text-primary" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {picked.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-2">
            {picked.map((p) => (
              <span
                key={`${p.title}-${p.year}`}
                className="inline-flex items-center gap-1 rounded-full bg-secondary px-3 py-1 text-sm"
              >
                {p.title}
                <button
                  aria-label={`Remove ${p.title}`}
                  onClick={() => setPicked(picked.filter((x) => x !== p))}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
          </div>
        )}

        <Button className="mt-6" size="lg" disabled={picked.length < 3 || loading} onClick={go}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {picked.length < 3 ? `Pick ${3 - picked.length} more` : "Show my picks"}
        </Button>

        {slate.length > 0 && (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-semibold">You might enjoy</h2>
            <ul className="mt-4 space-y-4">
              {slate.filter((item) => item.posterUrl || item.overview).map((item) => (
                <li
                  key={item.title}
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
                    {item.overview && (
                      <p className="mt-3 text-sm leading-relaxed text-foreground/90">{item.overview}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
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
