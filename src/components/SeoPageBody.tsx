import { Link } from "@tanstack/react-router";
import { Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/Poster";
import { trailerUrl } from "@/lib/refine";
import type { SeoLink, SeoPage } from "@/lib/seo.functions";

/** Body of a "movies like" page — shared by the public route and the admin draft preview. */
export function SeoPageBody({ page, related }: { page: SeoPage; related: SeoLink[] }) {
  const updated = new Date(page.updated_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const cta = (
    <section className="rounded-2xl border border-primary/40 bg-card p-6 shadow-lift sm:p-8">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        <Sparkles className="size-4" /> Personal picks
      </p>
      <h2 className="mt-3 font-display text-2xl font-bold">Want picks based on YOUR taste?</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        Start with {page.source_title}, add a couple more favourites, and get three picks made just for you.
      </p>
      <Button asChild size="lg" className="mt-5">
        <Link to="/try" search={page.imdb_id ? { add: page.imdb_id } : {}}>
          Try Reeler free
        </Link>
      </Button>
    </section>
  );

  return (
    <main className="mx-auto w-full max-w-4xl space-y-10 px-5 pb-20">
      <section className="flex flex-col gap-6 pt-6 sm:flex-row sm:items-start">
        {page.source_poster && (
          <Poster title={page.source_title} year={page.source_year} posterUrl={page.source_poster} className="w-32 shrink-0 sm:w-40" />
        )}
        <div>
          <h1 className="font-display text-3xl font-bold leading-tight sm:text-5xl">
            Movies like {page.source_title}
            {page.source_year ? ` (${page.source_year})` : ""}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">{page.intro}</p>
          <p className="mt-3 text-xs text-muted-foreground">Last updated {updated}</p>
        </div>
      </section>

      {cta}

      <ol className="space-y-5">
        {page.recommendations.map((r, i) => (
          <li key={`${r.title}-${i}`} className="flex gap-4 rounded-2xl border border-border/70 bg-card p-4 sm:gap-5 sm:p-5">
            <Poster title={r.title} year={r.year} posterUrl={r.poster} className="w-24 shrink-0 sm:w-32" />
            <div className="min-w-0">
              <h2 className="font-display text-xl font-semibold">
                <span className="text-muted-foreground">{i + 1}.</span> {r.title}
                {r.year ? <span className="ml-2 text-base font-normal text-muted-foreground">{r.year}</span> : null}
              </h2>
              <p className="mt-2 text-sm leading-relaxed">{r.because}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.hook}</p>
              <a
                href={trailerUrl(r.title, r.year)}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Play className="size-3" /> Trailer
              </a>
            </div>
          </li>
        ))}
      </ol>

      {cta}

      {related.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold">More like this</h2>
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {related.map((r) => (
              <li key={r.slug}>
                <Link
                  to="/movies-like/$slug"
                  params={{ slug: r.slug }}
                  className="block rounded-xl border border-border/70 bg-card p-4 text-sm hover:border-primary/60"
                >
                  Movies like {r.source_title}
                  {r.source_year ? ` (${r.source_year})` : ""}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
