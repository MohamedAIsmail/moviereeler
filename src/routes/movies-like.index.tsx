import { createFileRoute, Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";
import { Poster } from "@/components/Poster";
import { SiteFooter } from "@/components/LegalPage";
import { listPublishedSeoPages } from "@/lib/seo.functions";

const URL = "https://moviereeler.com/movies-like";
const TITLE = "Movies Like Your Favourites — Hand-Picked Lists | Reeler";
const DESC = "Loved a film and want more of that feeling? Browse Reeler’s lists of movies like your favourites, each pick with a specific reason why.";

export const Route = createFileRoute("/movies-like/")({
  loader: () => listPublishedSeoPages(),
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: URL },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: URL }],
  }),
  component: Index,
});

function Index() {
  const pages = Route.useLoaderData();
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-5xl items-center px-5">
        <Link to="/" className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-lg font-bold">Reeler</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-5xl px-5 pb-20">
        <h1 className="mt-6 font-display text-3xl font-bold sm:text-5xl">Movies like your favourites</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">{DESC}</p>
        {pages.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">The first lists are on their way.</p>
        ) : (
          <ul className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-4 lg:grid-cols-5">
            {pages.map((p) => (
              <li key={p.slug}>
                <Link to="/movies-like/$slug" params={{ slug: p.slug }} className="group block">
                  <Poster title={p.source_title} year={p.source_year} posterUrl={p.source_poster} />
                  <p className="mt-2 text-sm font-medium group-hover:text-primary">
                    Movies like {p.source_title}
                    {p.source_year ? ` (${p.source_year})` : ""}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
