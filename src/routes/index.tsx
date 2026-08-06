import { useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Clapperboard, FileUp, Sparkles, Target } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Reeler — Movie recommendations that know your taste" },
      {
        name: "description",
        content:
          "Import your Letterboxd history and get film picks reasoned from your own ratings, with an explanation for every recommendation.",
      },
      { property: "og:title", content: "Reeler — Movie recommendations that know your taste" },
      {
        property: "og:description",
        content:
          "Import your Letterboxd history and get film picks reasoned from your own ratings.",
      },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: FileUp,
    title: "Import in one drop",
    body: "Bring your Letterboxd export or any CSV. Thousands of films, ratings and dates land in seconds.",
  },
  {
    icon: Target,
    title: "Reads your dislikes too",
    body: "Low ratings are the sharpest signal there is. Reeler uses them to rule things out, not just in.",
  },
  {
    icon: Sparkles,
    title: "Every pick is argued",
    body: "Each recommendation names a film you already rated and explains the exact thread connecting them.",
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
            For people with taste
          </p>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-[1.05] sm:text-6xl">
            Recommendations built from{" "}
            <span className="text-gradient-ember">the films you already love</span>.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Import your watch history once. Reeler infers the tone, pacing and directorial
            sensibilities behind your ratings, then hands you a slate worth your evening — each pick
            with a reason.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to={signedIn ? "/discover" : "/auth"}>
                {signedIn ? "Open Reeler" : "Start free"}
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
        Reeler — your taste, taken seriously.
      </footer>
    </div>
  );
}
