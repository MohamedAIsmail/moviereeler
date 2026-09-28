import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bookmark, Loader2, Sparkles, X, ThumbsUp, ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { MediaToggle, type MediaType, copyFor } from "@/components/MediaToggle";
import { Poster } from "@/components/Poster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listLibrary } from "@/lib/movies.functions";
import {
  generateRecommendations,
  listRecommendations,
  setRecommendationStatus,
  setRecommendationFeedback,
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
  const sendFeedback = useServerFn(setRecommendationFeedback);

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
    mutationFn: () => generate({ data: { mood: mood.trim() || null, mediaType } }),
    onSuccess: (result) => {
      toast.success(`${result.count} new recommendations are ready`);
      void queryClient.invalidateQueries({ queryKey: ["recommendations", mediaType] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const items = recs.data ?? [];

  async function rate(id: string, value: 1 | -1 | null) {
    await sendFeedback({ data: { id, feedback: value } });
    void queryClient.invalidateQueries({ queryKey: ["recommendations"] });
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
          {items.filter((item) => item.poster_url || item.overview).map((item) => (
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

                {item.overview && (
                  <p className="mt-3 text-sm leading-relaxed text-foreground/90">
                    {item.overview}
                  </p>
                )}

                <div className="mt-4 flex gap-2">
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
                    variant={item.feedback === 1 ? "secondary" : "ghost"}
                    size="sm"
                    aria-label="Good pick"
                    onClick={() => void rate(item.id, item.feedback === 1 ? null : 1)}
                  >
                    <ThumbsUp className={item.feedback === 1 ? "size-4 text-primary" : "size-4"} />
                  </Button>
                  <Button
                    variant={item.feedback === -1 ? "secondary" : "ghost"}
                    size="sm"
                    aria-label="Not for me"
                    onClick={() => void rate(item.id, item.feedback === -1 ? null : -1)}
                  >
                    <ThumbsDown className={item.feedback === -1 ? "size-4 text-primary" : "size-4"} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => void updateStatus(item.id, "dismissed")}
                  >
                    <X className="size-4" />
                    Skip
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
