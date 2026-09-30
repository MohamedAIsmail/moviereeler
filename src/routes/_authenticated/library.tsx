import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Loader2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { AppShell } from "@/components/AppShell";
import { MediaToggle, type MediaType, copyFor } from "@/components/MediaToggle";
import { Poster } from "@/components/Poster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { parseMovieCsv } from "@/lib/csv";
import {
  addMovie,
  clearLibrary,
  enrichPosters,
  importMovies,
  listLibrary,
  rateMovie,
  removeMovie,
  searchCatalog,
} from "@/lib/movies.functions";
import { listRecommendations, setRecommendationStatus } from "@/lib/recommend.functions";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Your library · Reeler" },
      {
        name: "description",
        content: "Keep your movies, series, ratings, and saved picks together.",
      },
      { property: "og:title", content: "Your library · Reeler" },
      {
        property: "og:description",
        content: "Keep your movies, series, ratings, and saved picks together.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const queryClient = useQueryClient();
  const fetchLibrary = useServerFn(listLibrary);
  const runImport = useServerFn(importMovies);
  const runEnrich = useServerFn(enrichPosters);
  const runSearch = useServerFn(searchCatalog);
  const runAdd = useServerFn(addMovie);
  const runRate = useServerFn(rateMovie);
  const runRemove = useServerFn(removeMovie);
  const runClear = useServerFn(clearLibrary);

  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const copy = copyFor(mediaType);
  const [filter, setFilter] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const library = useQuery({
    queryKey: ["library", mediaType],
    queryFn: () => fetchLibrary({ data: { mediaType } }),
  });
  const movies = library.data ?? [];

  const missingPosters = movies.some((movie) => movie.poster_url === null);
  useEffect(() => {
    if (!missingPosters) return;
    let cancelled = false;
    void (async () => {
      // Keep pulling batches until every poster is resolved.
      for (let pass = 0; pass < 40 && !cancelled; pass++) {
        const result = await runEnrich({});
        if (cancelled) return;
        void queryClient.invalidateQueries({ queryKey: ["library"] });
        if (result.remaining === 0) return;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingPosters, runEnrich, queryClient]);


  const importMutation = useMutation({
    mutationFn: async ({ file, autoDetect }: { file: File; autoDetect: boolean }) => {
      const text = await file.text();
      const { rows, skipped } = parseMovieCsv(text);
      if (rows.length === 0) {
        throw new Error("No titles found. The file needs a Name or Title column.");
      }
      const result = await runImport({ 
        data: { rows, mediaType: autoDetect ? undefined : mediaType } 
      });
      return { ...result, skipped };
    },
    onSuccess: (result) => {
      setImportOpen(false);
      track("letterboxd_import_completed", { movies: result.movies, series: result.series, duplicates: result.duplicates, skipped: result.skipped });
      const parts = [];
      if (result.movies > 0) parts.push(`${result.movies} movies`);
      if (result.series > 0) parts.push(`${result.series} series`);
      
      toast.success(
        `Imported ${parts.join(" and ") || "items"}` +
          (result.duplicates ? ` · ${result.duplicates} already in your library` : ""),
      );
      void queryClient.invalidateQueries({ queryKey: ["library"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const visible = movies.filter((movie) =>
    movie.title.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold sm:text-4xl">Your library</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {movies.length} {movies.length === 1 ? copy.singular : copy.plural} in your library.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <AddMovieDialog
            mediaType={mediaType}
            open={addOpen}
            onOpenChange={setAddOpen}
            onSearch={(query) => {
              track("search", { query, media_type: mediaType, page: "library" });
              return runSearch({ data: { query, mediaType } });
            }}
            onAdd={async (movie) => {
              await runAdd({ data: { ...movie, mediaType } });
              setAddOpen(false);
              track("film_added", { title: movie.title, year: movie.year, media_type: mediaType, source: "library" });
              toast.success(`${movie.title} added`);
              void queryClient.invalidateQueries({ queryKey: ["library"] });
            }}
          />
          <ImportDialog
            mediaType={mediaType}
            open={importOpen}
            onOpenChange={setImportOpen}
            pending={importMutation.isPending}
            onFile={(file, autoDetect) => importMutation.mutate({ file, autoDetect })}
          />
          {movies.length > 0 && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive hover:text-destructive">
                  <Trash2 className="size-4" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove every {copy.singular}?</AlertDialogTitle>
                  <AlertDialogDescription>
                     This removes all {movies.length} {copy.plural} from your library. Your{" "}
                    {mediaType === "movie" ? "series" : "movies"} and saved picks stay put. This
                    can't be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await runClear({ data: { mediaType } });
                      toast.success(`${copy.label} cleared`);
                      void queryClient.invalidateQueries({ queryKey: ["library"] });
                    }}
                  >
                    Delete everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <div className="mt-6">
        <MediaToggle value={mediaType} onChange={setMediaType} />
      </div>

      <SavedPicks mediaType={mediaType} />

      {movies.length > 8 && (
        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={`Search your ${copy.plural}`}
            className="pl-9"
          />
        </div>
      )}

      {library.isLoading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : movies.length === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
          <h2 className="font-display text-lg font-semibold">Your {copy.singular} library is empty</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Import a CSV file or add {copy.plural} one at a time. Ratings help us make better
            recommendations.
          </p>
          <Button className="mt-6" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Import {copy.plural}
          </Button>
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {visible.map((movie) => (
            <MovieCard
              key={movie.id}
              movie={movie}
              onRate={(rating) => runRate({ data: { id: movie.id, rating } })}
              onRemove={async () => {
                await runRemove({ data: { id: movie.id } });
                void queryClient.invalidateQueries({ queryKey: ["library"] });
              }}
            />
          ))}
        </ul>
      )}
    </AppShell>
  );
}

interface LibraryMovie {
  id: string;
  title: string;
  year: number | null;
  rating: number | null;
  poster_url: string | null;
}

function MovieCard({
  movie,
  onRate,
  onRemove,
}: {
  movie: LibraryMovie;
  onRate: (rating: number) => Promise<unknown>;
  onRemove: () => void | Promise<void>;
}) {
  const [rating, setRating] = useState(movie.rating ?? 0);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirty.current) setRating(movie.rating ?? 0);
  }, [movie.rating]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  return (
    <li className="group">
      <Poster title={movie.title} year={movie.year} posterUrl={movie.poster_url} />
      <div className="mt-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{movie.title}</p>
          <p className="text-xs text-muted-foreground">
            {movie.year ?? "—"}
            {rating > 0 ? ` · ${rating}/10` : ""}
          </p>
        </div>
        <button
          type="button"
          aria-label={`Remove ${movie.title}`}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
          onClick={() => void onRemove()}
        >
          <Trash2 className="size-4" />
        </button>
      </div>
      <input
        type="range"
        min={0}
        max={10}
        step={0.5}
        aria-label={`Your rating for ${movie.title}`}
        value={rating}
        onChange={(event) => {
          const next = Number(event.target.value);
          dirty.current = true;
          setRating(next);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            void onRate(next).finally(() => {
              dirty.current = false;
            });
          }, 400);
        }}
        className="mt-2 h-1 w-full cursor-pointer accent-primary"
      />
    </li>
  );
}

function SavedPicks({ mediaType }: { mediaType: MediaType }) {
  const queryClient = useQueryClient();
  const fetchRecs = useServerFn(listRecommendations);
  const setStatus = useServerFn(setRecommendationStatus);
  const runAdd = useServerFn(addMovie);
  const copy = copyFor(mediaType);

  const recs = useQuery({
    queryKey: ["recommendations", mediaType],
    queryFn: () => fetchRecs({ data: { mediaType } }),
  });
  const saved = (recs.data ?? []).filter((item) => item.status === "saved");

  if (saved.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center gap-2">
        <Bookmark className="size-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Saved {copy.label.toLowerCase()}</h2>
        <span className="text-sm text-muted-foreground">({saved.length})</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {copy.label} you saved for later. If you’ve watched one, add it to your library.
      </p>

      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {saved.map((item) => (
          <li key={item.id}>
            <Poster title={item.title} year={item.year} posterUrl={item.poster_url} />
            <p className="mt-2 truncate text-sm font-medium">{item.title}</p>
            <p className="text-xs text-muted-foreground">{item.year ?? "—"}</p>
            <div className="mt-2 flex gap-1">
              <Button
                size="sm"
                variant="secondary"
                className="h-7 flex-1 px-2 text-xs"
                onClick={async () => {
                  await runAdd({
                    data: {
                      title: item.title,
                      year: item.year,
                      posterUrl: item.poster_url,
                      imdbId: item.imdb_id,
                      mediaType,
                    },
                  });
                  await setStatus({ data: { id: item.id, status: "dismissed" } });
                  toast.success(`${item.title} added to your library`);
                  void queryClient.invalidateQueries({ queryKey: ["library"] });
                  void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
                }}
              >
                Watched
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Remove ${item.title} from saved`}
                className="h-7 px-2 text-muted-foreground"
                onClick={async () => {
                  await setStatus({ data: { id: item.id, status: "dismissed" } });
                  void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
                }}
              >
                <X className="size-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ImportDialog({
  mediaType,
  open,
  onOpenChange,
  pending,
  onFile,
}: {
  mediaType: MediaType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onFile: (file: File, autoDetect: boolean) => void;
}) {
  const copy = copyFor(mediaType);
  const [autoDetect, setAutoDetect] = useState(true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="size-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import movies and series</DialogTitle>
          <DialogDescription>
            Choose a CSV from IMDb, Letterboxd, or another app. We’ll sort movies and series for you
            and keep your ratings on a 10-point scale.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex items-center space-x-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/20">
            <Checkbox
              id="auto-detect"
              checked={autoDetect}
              onCheckedChange={(checked) => setAutoDetect(!!checked)}
            />
            <div className="grid gap-1.5 leading-none">
              <label
                htmlFor="auto-detect"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                 Sort movies and series automatically
              </label>
              <p className="text-xs text-muted-foreground">
                 Leave this on for a mixed file. Turn it off to import everything as{" "}
                 {copy.plural.toLowerCase()}.
              </p>
            </div>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center transition-colors hover:border-primary/60">
            {pending ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <Upload className="size-6 text-primary" />
            )}
            <span className="text-sm font-medium">
              {pending ? "Importing…" : "Choose a CSV file"}
            </span>
            <span className="text-xs text-muted-foreground">You can import up to 4,000 titles at once</span>
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={pending}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file, autoDetect);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface CatalogResult {
  title: string;
  year: number | null;
  posterUrl: string | null;
  imdbId: string | null;
}

function AddMovieDialog({
  mediaType,
  open,
  onOpenChange,
  onSearch,
  onAdd,
}: {
  mediaType: MediaType;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => Promise<CatalogResult[]>;
  onAdd: (movie: {
    title: string;
    year: number | null;
    posterUrl: string | null;
    imdbId: string | null;
  }) => Promise<void>;
}) {
  const copy = copyFor(mediaType);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setResults([]);
  }, [mediaType]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    try {
      setResults(await onSearch(query));
    } finally {
      setSearching(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          Add {copy.singular}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a {copy.singular.toLowerCase()}</DialogTitle>
          <DialogDescription>
             Search by title, then add the right match to your library.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="mt-4 flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
             placeholder={`Search for a ${copy.singular.toLowerCase()}`}
            className="flex-1"
          />
          <Button type="submit" disabled={searching || !query.trim()}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </form>

        <ul className="mt-6 max-h-[40vh] space-y-3 overflow-y-auto pr-1">
          {results.map((result) => (
            <li
              key={result.imdbId ?? result.title + result.year}
              className="flex items-center gap-4 rounded-lg border border-border p-2 transition-colors hover:bg-secondary/40"
            >
              <div className="h-16 w-11 flex-shrink-0 overflow-hidden rounded bg-secondary">
                {result.posterUrl && (
                  <img
                    src={result.posterUrl}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{result.title}</p>
                <p className="text-xs text-muted-foreground">{result.year ?? "—"}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void onAdd(result)}
                className="h-8 w-8 p-0"
              >
                <Plus className="size-4" />
              </Button>
            </li>
          ))}
          {results.length === 0 && !searching && query && (
            <p className="py-10 text-center text-sm text-muted-foreground">We couldn’t find that title.</p>
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
