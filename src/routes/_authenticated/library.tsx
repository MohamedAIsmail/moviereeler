import { useEffect, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Loader2, Plus, Search, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
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

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Your library · Reeler" },
      {
        name: "description",
        content: "Every film you've logged, imported from Letterboxd or added by hand.",
      },
      { property: "og:title", content: "Your library · Reeler" },
      {
        property: "og:description",
        content: "Every film you've logged, imported from Letterboxd or added by hand.",
      },
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

  const [filter, setFilter] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const library = useQuery({ queryKey: ["library"], queryFn: () => fetchLibrary({}) });
  const movies = library.data ?? [];

  // Progressively fill in missing posters, a batch at a time.
  const missingPosters = movies.some((movie) => movie.poster_url === null);
  useEffect(() => {
    if (!missingPosters) return;
    let cancelled = false;
    void (async () => {
      const result = await runEnrich({});
      if (!cancelled && result.updated >= 0) {
        void queryClient.invalidateQueries({ queryKey: ["library"] });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingPosters, runEnrich, queryClient]);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const { rows, skipped } = parseMovieCsv(text);
      if (rows.length === 0) {
        throw new Error("No movie titles found. The file needs a Name or Title column.");
      }
      const result = await runImport({ data: { rows } });
      return { ...result, skipped };
    },
    onSuccess: (result) => {
      setImportOpen(false);
      toast.success(
        `Imported ${result.imported} films` +
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
            {movies.length} film{movies.length === 1 ? "" : "s"} logged — the raw material for every
            recommendation.
          </p>
        </div>

        <div className="flex gap-2">
          <AddMovieDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            onSearch={(query) => runSearch({ data: { query } })}
            onAdd={async (movie) => {
              await runAdd({ data: movie });
              setAddOpen(false);
              toast.success(`${movie.title} added`);
              void queryClient.invalidateQueries({ queryKey: ["library"] });
            }}
          />
          <ImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            pending={importMutation.isPending}
            onFile={(file) => importMutation.mutate(file)}
          />
        </div>
      </div>

      <SavedPicks />


      {movies.length > 8 && (
        <div className="relative mt-6">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Filter your library"
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
          <h2 className="font-display text-lg font-semibold">Nothing logged yet</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted-foreground">
            Import your Letterboxd export (or any CSV with a title, year and rating column) and the
            engine gets to work immediately.
          </p>
          <Button className="mt-6" onClick={() => setImportOpen(true)}>
            <Upload className="size-4" />
            Import movies
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

function SavedPicks() {
  const queryClient = useQueryClient();
  const fetchRecs = useServerFn(listRecommendations);
  const setStatus = useServerFn(setRecommendationStatus);
  const runAdd = useServerFn(addMovie);

  const recs = useQuery({ queryKey: ["recommendations"], queryFn: () => fetchRecs({}) });
  const saved = (recs.data ?? []).filter((item) => item.status === "saved");

  if (saved.length === 0) return null;

  return (
    <section className="mt-8 rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center gap-2">
        <Bookmark className="size-4 text-primary" />
        <h2 className="font-display text-lg font-semibold">Saved picks</h2>
        <span className="text-sm text-muted-foreground">({saved.length})</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Recommendations you kept — mark one as watched to fold it into your library.
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

  open,
  onOpenChange,
  pending,
  onFile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pending: boolean;
  onFile: (file: File) => void;
}) {
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
          <DialogTitle>Import your movies</DialogTitle>
          <DialogDescription>
            Drop in a Letterboxd export (watched.csv or ratings.csv) or any CSV with Name/Title,
            Year and Rating columns. Star ratings are converted to a 10-point scale automatically.
          </DialogDescription>
        </DialogHeader>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-secondary/40 px-6 py-10 text-center transition-colors hover:border-primary/60">
          {pending ? (
            <Loader2 className="size-6 animate-spin text-primary" />
          ) : (
            <Upload className="size-6 text-primary" />
          )}
          <span className="text-sm font-medium">
            {pending ? "Importing…" : "Choose a CSV file"}
          </span>
          <span className="text-xs text-muted-foreground">Up to 4,000 films per import</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onFile(file);
              event.target.value = "";
            }}
          />
        </label>
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
  open,
  onOpenChange,
  onSearch,
  onAdd,
}: {
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
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CatalogResult[]>([]);
  const [searching, setSearching] = useState(false);

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
        <Button variant="secondary">
          <Plus className="size-4" />
          Add film
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a film</DialogTitle>
          <DialogDescription>Search the catalogue and add it to your library.</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex gap-2">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="e.g. In the Mood for Love"
          />
          <Button type="submit" disabled={searching}>
            {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          </Button>
        </form>

        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {results.map((result) => (
            <li key={`${result.imdbId ?? result.title}-${result.year ?? ""}`}>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-secondary"
                onClick={() =>
                  void onAdd({
                    title: result.title,
                    year: result.year,
                    posterUrl: result.posterUrl,
                    imdbId: result.imdbId,
                  })
                }
              >
                <div className="w-10 shrink-0">
                  <Poster title={result.title} posterUrl={result.posterUrl} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{result.title}</p>
                  <p className="text-xs text-muted-foreground">{result.year ?? "—"}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
