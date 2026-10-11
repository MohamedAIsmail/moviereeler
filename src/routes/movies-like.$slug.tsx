import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SeoPageBody } from "@/components/SeoPageBody";
import { SiteFooter } from "@/components/LegalPage";
import { getPublishedSeoPage } from "@/lib/seo.functions";

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
      <SeoPageBody page={page} related={related} />
      <SiteFooter />
    </div>
  );
}
