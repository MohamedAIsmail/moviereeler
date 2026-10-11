import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Clapperboard, Play, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Poster } from "@/components/Poster";
import { SiteFooter } from "@/components/LegalPage";
import { getPublishedSeoPage } from "@/lib/seo.functions";
import { trailerUrl } from "@/lib/refine";

const BASE = "https://moviereeler.com";

export const Route = createFileRoute("/movies-like/$slug")({
  loader: async ({ params }) => {
    const res = await getPublishedSeoPage({ data: { slug: params.slug } });
    if (!res) throw notFound();
    return res;
  },
  head: ({ params, loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Page not found | Reeler" }, { name: "robots", content: "noindex" }] };
    }
    const { page } = loaderData;
    const name = `${page.source_title}${page.source_year ? ` (${page.source_year})` : ""}`;
    const title = page.meta_title || `${page.recommendations.length} Movies Like ${page.source_title} | Reeler`;
    const desc = page.meta_description || page.intro.slice(0, 155);
    const url = `${BASE}/movies-like/${params.slug}`;
    const img = page.source_poster ?? page.recommendations[0]?.poster ?? null;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
        ...(img?.startsWith("https://")
          ? [
              { property: "og:image", content: img },
              { name: "twitter:image", content: img },
            ]
          : []),
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "ItemList",
            name: `Movies like ${name}`,
            description: desc,
            url,
            numberOfItems: page.recommendations.length,
            itemListElement: page.recommendations.map((r, i) => ({
              "@type": "ListItem",
              position: i + 1,
              item: {
                "@type": "Movie",
                name: r.title,
                ...(r.year ? { dateCreated: String(r.year) } : {}),
                ...(r.poster ? { image: r.poster } : {}),
                ...(r.imdb_id ? { sameAs: `https://www.imdb.com/title/${r.imdb_id}/` } : {}),
                description: r.hook,
              },
            })),
          }),
        },
      ],
    };
  },
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl px-5 py-24 text-center">
      <h1 className="font-display text-2xl font-bold">We don’t have that list yet</h1>
      <Button asChild className="mt-6">
        <Link to="/movies-like">Browse all lists</Link>
      </Button>
    </div>
  ),
  component: SeoPageView,
});

function SeoPageView() {
  const { page, related } = Route.useLoaderData();
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
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-4xl items-center justify-between px-5">
        <Link to="/" className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-lg font-bold">Reeler</span>
        </Link>
        <Link to="/movies-like" className="text-sm text-muted-foreground hover:text-foreground">
          All lists
        </Link>
      </header>

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
      <SiteFooter />
    </div>
  );
}
