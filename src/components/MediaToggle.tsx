import { Clapperboard, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

export type MediaType = "movie" | "series";

export function copyFor(mediaType: MediaType) {
  return mediaType === "series"
    ? { label: "Series", singular: "series", plural: "series" }
    : { label: "Movies", singular: "movie", plural: "movies" };
}

const OPTIONS = [
  { value: "movie" as const, label: "Movies", icon: Clapperboard },
  { value: "series" as const, label: "Series", icon: Tv },
];

/** Segmented control switching the whole page between the movie and series catalogue. */
export function MediaToggle({
  value,
  onChange,
  className,
}: {
  value: MediaType;
  onChange: (value: MediaType) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label="Media type"
      className={cn(
        "inline-flex rounded-full border border-border/70 bg-secondary/40 p-1",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
