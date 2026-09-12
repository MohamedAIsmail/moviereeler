import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clapperboard, FileUp, Sparkles, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reeler — Find your next movie" },
      {
        name: "description",
        content:
          "Bring your watch history to Reeler and get movie and series recommendations based on your ratings.",
      },
      { property: "og:title", content: "Reeler — Find your next movie" },
      {
        property: "og:description",
        content:
          "Bring your watch history to Reeler and find movies and series you’ll enjoy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: FileUp,
    title: "Bring your watch history",
    body: "Upload your IMDb or Letterboxd CSV once. We’ll bring over your titles, ratings, and dates.",
  },
  {
    icon: Target,
    title: "Your ratings matter",
    body: "What you didn’t enjoy matters too. It helps Reeler avoid recommending more of the same.",
  },
  {
    icon: Sparkles,
    title: "Know what you’re choosing",
    body: "Every recommendation comes with a clear summary and a match score, so you can decide quickly.",
  },
];

function Landing() {
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-5">
        <span className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-lg font-bold">Reeler</span>
        </span>
        <Button asChild variant="ghost" size="sm">
          <Link to={signedIn ? "/discover" : "/auth"}>{signedIn ? "Open app" : "Sign in"}</Link>
        </Button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-5">
        <section className="py-20 sm:py-32">
          <p className="text-xs font-semibold uppercase tracking-[0.25em] text-primary">
            Less scrolling. More watching.
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            Find your next movie without the endless search.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Add the movies and series you’ve watched, rate them, and Reeler will find something you’re
            likely to enjoy next.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/discover" : "/auth"}>
                {signedIn ? "See my picks" : "Get started"}
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link to={signedIn ? "/library" : "/auth"}>Import your library</Link>
            </Button>
          </div>
        </section>

        <section className="grid gap-4 pb-24 sm:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <article
                key={feature.title}
                className="rounded-2xl border border-border/70 bg-card p-6 shadow-lift"
              >
                <Icon className="size-5 text-primary" />
                <h2 className="mt-4 font-display text-lg font-semibold">{feature.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </article>
            );
          })}
        </section>
      </main>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
         Made for movie nights.
      </footer>
    </div>
  );
}
