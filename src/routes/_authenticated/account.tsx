import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deleteMyAccount } from "@/lib/account.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Your account — Reeler" },
      { name: "description", content: "Manage your Reeler account." },
      { property: "og:title", content: "Your account — Reeler" },
      { property: "og:description", content: "Manage your Reeler account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user } = Route.useRouteContext();
  const remove = useServerFn(deleteMyAccount);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setBusy(true);
    try {
      await remove();
      queryClient.clear();
      await supabase.auth.signOut();
      toast.success("Your account and data have been deleted.");
      navigate({ to: "/", replace: true });
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <h1 className="font-display text-3xl font-bold">Your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Signed in as {user.email}</p>

      <p className="mt-4 text-sm">
        <Link to="/admin" className="text-primary hover:underline">
          Usage dashboard
        </Link>
      </p>

      <section className="mt-8 rounded-2xl border border-destructive/40 bg-card p-6">
        <h2 className="font-display text-lg font-semibold">Delete account</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          This permanently removes your account, library, ratings and recommendations. It can’t be
          undone. See our <Link to="/privacy" className="text-primary hover:underline">privacy policy</Link>.
        </p>
        <p className="mt-4 text-sm">Type <strong>DELETE</strong> to confirm.</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="sm:max-w-xs" />
          <Button variant="destructive" disabled={confirm !== "DELETE" || busy} onClick={onDelete}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete everything
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
