import { Link } from "@tanstack/react-router";
import { Clapperboard } from "lucide-react";

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex h-16 w-full max-w-3xl items-center px-5">
        <Link to="/" className="flex items-center gap-2">
          <Clapperboard className="size-5 text-primary" />
          <span className="font-display text-lg font-bold">Reeler</span>
        </Link>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-4 px-5 pb-20 text-sm leading-relaxed text-muted-foreground [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-foreground">
        <h1 className="mt-6 font-display text-3xl font-bold text-foreground">{title}</h1>
        <p>Last updated: September 28, 2026</p>
        {children}
      </main>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
      <p>Made for movie nights.</p>
      <p className="mt-2 flex justify-center gap-4">
        <Link to="/privacy" className="hover:text-foreground">Privacy</Link>
        <Link to="/terms" className="hover:text-foreground">Terms</Link>
      </p>
      <p className="mt-2">Titles, posters and summaries come from public catalog data (IMDb via Cinemeta).</p>
    </footer>
  );
}
