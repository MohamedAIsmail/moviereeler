import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { REFINES, REFINE_KEYS, type RefineKey } from "@/lib/refine";
import { track } from "@/lib/analytics";

export function RefineBar({
  busy,
  active,
  note,
  onNote,
  onRefine,
  onMore,
}: {
  busy: boolean;
  active: RefineKey | null;
  note: string;
  onNote: (v: string) => void;
  onRefine: (k: RefineKey) => void;
  onMore: () => void;
}) {
  return (
    <div className="mt-6 rounded-2xl border border-border/70 bg-card p-4 sm:p-5">
      <p className="text-sm font-medium">Not quite right? Try:</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {REFINE_KEYS.map((k) => (
          <button
            key={k}
            disabled={busy}
            onClick={() => {
              track("refine_clicked", { chip: k, note: note.trim() || null });
              onRefine(k);
            }}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              active === k
                ? "border-primary bg-secondary text-primary"
                : "border-border/70 hover:border-primary/60"
            }`}
          >
            {REFINES[k].label}
          </button>
        ))}
      </div>
      <Input
        className="mt-3"
        value={note}
        maxLength={200}
        onChange={(e) => onNote(e.target.value)}
        placeholder="Anything else? (e.g. no subtitles, something to watch with my parents)"
      />
      <Button className="mt-3" variant="secondary" disabled={busy} onClick={() => {
          track("show_more");
          onMore();
        }}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
        Show 3 more
      </Button>
    </div>
  );
}
