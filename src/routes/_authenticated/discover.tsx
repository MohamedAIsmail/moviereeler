import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Ban, Bookmark, Eye, Loader2, Play, Sparkles } from "lucide-react";
import { RefineBar } from "@/components/RefineBar";
import { trailerUrl, type RefineKey } from "@/lib/refine";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { MediaToggle, type MediaType, copyFor } from "@/components/MediaToggle";
import { Poster } from "@/components/Poster";
import { PickReactions } from "@/components/PickReactions";
import { track } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLibrary } from "@/lib/movies.functions";
import {
  generateRecommendations,
  listRecommendations,
  setRecommendationStatus,
  markPick,
} from "@/lib/recommend.functions";

export const Route = createFileRoute("/_authenticated/discover")({
  head: () => ({
    meta: [
      { title: "Discover · Reeler" },
      {
        name: "description",
        content: "Find movies and series picked from what you already enjoy.",
      },
      { property: "og:title", content: "Discover · Reeler" },
      {
        property: "og:description",
        content: "Find movies and series picked from what you already enjoy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DiscoverPage,
});

function DiscoverPage() {
  const queryClient = useQueryClient();
  const fetchRecs = useServerFn(listRecommendations);
  const fetchLibrary = useServerFn(listLibrary);
  const generate = useServerFn(generateRecommendations);
  const setStatus = useServerFn(setRecommendationStatus);
  const sendMark = useServerFn(markPick);
  const [refine, setRefine] = useState<RefineKey | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingSlots] = useState(0);
  const [replacing, setReplacing] = useState<Set<string>>(new Set());
  const [ratingFor, setRatingFor] = useState<string | null>(null);

  const [mediaType, setMediaType] = useState<MediaType>("movie");
  const copy = copyFor(mediaType);
  const [mood, setMood] = useState("");

  const recs = useQuery({
    queryKey: ["recommendations", mediaType],
    queryFn: () => fetchRecs({ data: { mediaType } }),
  });
  const library = useQuery({
    queryKey: ["library", mediaType],
    queryFn: () => fetchLibrary({ data: { mediaType } }),
  });
  const libraryCount = library.data?.length ?? 0;

  const generateMutation = useMutation({
    mutationFn: () => {
      setRefine(null);
      track("picks_requested", { page: "discover", media_type: mediaType, mood: mood.trim() || null });
      return generate({ data: { mood: mood.trim() || null, mediaType, note: note.trim() || null } });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["recommendations", mediaType] });
      const list = (queryClient.getQueryData(["recommendations", mediaType]) as { title: string; status: string }[] | undefined) ?? [];
      track("picks_shown", { page: "discover", titles: list.filter((r) => r.status === "new").slice(0, 12).map((r) => r.title) });
      toast.success(`${result.count} new recommendations are ready`);
      void queryClient.invalidateQueries({ queryKey: ["recommendations", mediaType] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = recs.data ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["recommendations", mediaType] });

  async function runGenerate(opts: { count: number; replaceNew: boolean; refine: RefineKey | null }) {
    setBusy(true);
    track("picks_requested", { page: "discover", media_type: mediaType, refine: opts.refine, count: opts.count });
    try {
      await generate({
        data: { mood: mood.trim() || null, mediaType, note: note.trim() || null, ...opts },
      });
      await invalidate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function mark(id: string, kind: "seen" | "rejected", rating: number | null = null) {
    const it = items.find((r) => r.id === id);
    track(kind === "seen" ? "seen_it" : "not_for_me", { title: it?.title, year: it?.year, page: "discover", rating });
    setRatingFor(null);
    const key = ["recommendations", mediaType];
    setReplacing((s) => new Set(s).add(id));
    try {
      await sendMark({ data: { id, kind, rating } });
      if (kind === "seen") {
        toast.success(
          `${it?.title ?? "Added"} added to your library${rating ? ` · ${rating}/10` : ""}`,
        );
        void queryClient.invalidateQueries({ queryKey: ["library"] });
      }
      await generate({
        data: { mood: mood.trim() || null, mediaType, note: note.trim() || null, count: 1, replaceNew: false, refine },
      });
      const before = (queryClient.getQueryData(key) as typeof items | undefined) ?? [];
      const beforeIds = new Set(before.map((r) => r.id));
      const slot = before.findIndex((r) => r.id === id);
      await queryClient.refetchQueries({ queryKey: key, exact: true });
      queryClient.setQueryData(key, (fresh: typeof items | undefined) => {
        if (!fresh) return fresh;
        const added = fresh.find((r) => !beforeIds.has(r.id));
        const rest = fresh.filter((r) => r.id !== id && r !== added);
        if (added && slot >= 0) rest.splice(Math.min(slot, rest.length), 0, added);
        else if (added) rest.push(added);
        return rest;
      });
    } catch (e) {
      toast.error((e as Error).message);
      queryClient.setQueryData(key, (old: typeof items | undefined) => old?.filter((r) => r.id !== id));
    } finally {
      setReplacing((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function updateStatus(id: string, status: "saved" | "dismissed") {
    await setStatus({ data: { id, status } });
    void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
  }

  return (
    <AppShell>
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-lift sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Made for you
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
          What are you in the mood for?
        </h1>
        <p className="mt-2 max-w-xl text-sm text-muted-foreground">
          Tell us what sounds good, or leave it blank. We’ll use your ratings to find {copy.plural}
          you’re likely to enjoy.
        </p>

        <div className="mt-6">
          <MediaToggle value={mediaType} onChange={setMediaType} />
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input
            value={mood}
            onChange={(event) => setMood(event.target.value)}
            placeholder="Optional: something slow, funny, or under two hours"
          />
          <Button
            className="sm:w-auto"
            disabled={generateMutation.isPending || libraryCount < 3}
            onClick={() => generateMutation.mutate()}
          >
            {generateMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Sparkles className="size-4" />
            )}
            {items.length ? "Find new picks" : "Find something to watch"}
          </Button>
        </div>

        {libraryCount < 3 && (
          <p className="mt-3 text-sm text-muted-foreground">
            Add at least 3 {copy.plural} so we have enough to go on —{" "}
            <Link to="/library" className="font-medium text-primary underline-offset-4 hover:underline">
              go to your library
            </Link>
            .
          </p>
        )}
      </section>


      {recs.isLoading ? (
        <div className="mt-16 flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <p className="mt-12 text-center text-sm text-muted-foreground">
          No recommendations yet. When you’re ready, we’ll find some for you.
        </p>
      ) : (
        <ul className="mt-8 space-y-4">
          {items.filter((item) => item.poster_url || item.overview).map((item) => replacing.has(item.id) ? (
            <li
              key={item.id}
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
          ) : (
            <li
              key={item.id}
              className="flex gap-4 rounded-2xl border border-border/70 bg-card p-4 transition-shadow hover:shadow-glow sm:gap-6 sm:p-5"
            >
              <div className="w-24 shrink-0 sm:w-32">
                <Poster title={item.title} year={item.year} posterUrl={item.poster_url} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 className="font-display text-lg font-semibold sm:text-xl">{item.title}</h2>
                  <span className="text-sm text-muted-foreground">{item.year ?? ""}</span>
                  {item.match_score != null && (
                    <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {item.match_score}% match
                    </span>
                  )}
                  {item.status === "saved" && (
                    <span className="rounded-full border border-primary/40 px-2.5 py-0.5 text-xs text-primary">
                      Saved
                    </span>
                  )}
                </div>

                {item.genres && item.genres.length > 0 && (
                  <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                    {item.genres.slice(0, 3).join(" · ")}
                  </p>
                )}

                {item.reason && (
                  <p className="mt-3 text-sm font-medium leading-relaxed text-primary">{item.reason}</p>
                )}
                {(item.hook || item.overview) && (
                  <p className="mt-2 text-sm leading-relaxed text-foreground/90">
                    {item.hook || item.overview}
                  </p>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void updateStatus(item.id, "saved")}
                    disabled={item.status === "saved"}
                  >
                    <Bookmark className="size-4" />
                    Save
                  </Button>
                  <Button
                    variant={ratingFor === item.id ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setRatingFor(ratingFor === item.id ? null : item.id)}
                  >
                    <Eye className="size-4" />
                    Seen it
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void mark(item.id, "rejected")}>
                    <Ban className="size-4" />
                    Not for me
                  </Button>
                  <PickReactions title={item.title} year={item.year} page="discover" />
                  <Button asChild variant="ghost" size="sm">
                    <a
                      href={trailerUrl(item.title, item.year)}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => track("trailer_clicked", { title: item.title, year: item.year, page: "discover" })}
                    >
                      <Play className="size-4" />
                      Trailer
                    </a>
                  </Button>
                </div>

                {ratingFor === item.id && (
                  <div className="mt-4 rounded-xl border border-border/70 bg-secondary/40 p-3">
                    <p className="text-sm font-medium">How would you rate it?</p>
                    <p className="text-xs text-muted-foreground">
                      We’ll add it to your library and use your rating for future picks.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                        <button
                          key={n}
                          type="button"
                          aria-label={`Rate ${n} out of 10`}
                          onClick={() => void mark(item.id, "seen", n)}
                          className="size-8 rounded-md border border-border bg-card text-sm font-semibold transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground"
                        >
                          {n}
                        </button>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={() => void mark(item.id, "seen", null)}
                      >
                        Skip rating
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
          {Array.from({ length: pendingSlots }).map((_, i) => (
            <li
              key={`pending-${i}`}
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
          ))}
        </ul>
      )}
      {items.length > 0 && libraryCount >= 3 && (
        <RefineBar
          busy={busy || generateMutation.isPending}
          active={refine}
          note={note}
          onNote={setNote}
          onRefine={(k) => {
            setRefine(k);
            void runGenerate({ count: 3, replaceNew: true, refine: k });
          }}
          onMore={() => void runGenerate({ count: 3, replaceNew: false, refine })}
        />
      )}
    </AppShell>
  );
}
