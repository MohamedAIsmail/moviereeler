import { useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface PosterProps {
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  className?: string;
}

export function Poster({ title, year, posterUrl, className }: PosterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (visible) return;
    const node = containerRef.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative aspect-2/3 w-full overflow-hidden rounded-xl bg-secondary shadow-lift",
        className,
      )}
    >
      {posterUrl ? (
        visible ? (
          <img
            src={posterUrl}
            alt={`${title} poster`}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(true)}
            className={cn(
              "size-full object-cover transition-opacity duration-300",
              loaded ? "opacity-100" : "opacity-0",
            )}
          />
        ) : (
          <div className="size-full animate-pulse bg-secondary" aria-hidden />
        )
      ) : (
        <div className="grain-surface flex size-full flex-col items-center justify-center gap-2 p-3 text-center">
          <Film className="size-6 text-muted-foreground" />
          <span className="font-display text-xs leading-tight text-muted-foreground">
            {title}
            {year ? ` · ${year}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
