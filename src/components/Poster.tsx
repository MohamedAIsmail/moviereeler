import { useState } from "react";
import { Film } from "lucide-react";
import { cn } from "@/lib/utils";

interface PosterProps {
  title: string;
  year?: number | null;
  posterUrl?: string | null;
  className?: string;
}

export function Poster({ title, year, posterUrl, className }: PosterProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = !!posterUrl && failedUrl !== posterUrl;
  return (
    <div
      className={cn(
        "relative aspect-2/3 w-full overflow-hidden rounded-xl bg-secondary shadow-lift",
        className,
      )}
    >
      {showImage ? (
        <img
          src={posterUrl}
          alt={`${title} poster`}
          loading="lazy"
          decoding="async"
          onError={() => setFailedUrl(posterUrl)}
          className="size-full object-cover"
        />
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
