import { useState } from "react";
import { Share2, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";

/** 👍 / 👎 / Share for a recommendation card. Logged as product events. */
export function PickReactions({ title, year, page }: { title: string; year: number | null; page: string }) {
  const [vote, setVote] = useState<1 | -1 | null>(null);

  const react = (v: 1 | -1) => {
    if (vote === v) return;
    setVote(v);
    track(v === 1 ? "thumbs_up" : "thumbs_down", { title, year, page });
  };

  const share = async () => {
    const url = `${window.location.origin}/try?utm_source=share`;
    const text = `Reeler picked ${title}${year ? ` (${year})` : ""} for me.`;
    track("share_clicked", { title, year, page });
    try {
      if (navigator.share) await navigator.share({ title: "Reeler", text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Link copied");
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <>
      <Button
        variant={vote === 1 ? "secondary" : "ghost"}
        size="sm"
        aria-label="I like this pick"
        aria-pressed={vote === 1}
        onClick={() => react(1)}
      >
        <ThumbsUp className="size-4" />
      </Button>
      <Button
        variant={vote === -1 ? "secondary" : "ghost"}
        size="sm"
        aria-label="I don't like this pick"
        aria-pressed={vote === -1}
        onClick={() => react(-1)}
      >
        <ThumbsDown className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" aria-label="Share this pick" onClick={() => void share()}>
        <Share2 className="size-4" />
      </Button>
    </>
  );
}
