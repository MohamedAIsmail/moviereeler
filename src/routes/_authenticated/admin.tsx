import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShieldAlert } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { getUsageStats } from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Usage · Reeler" },
      { name: "description", content: "Daily recommendation usage for Reeler." },
      { property: "og:title", content: "Usage · Reeler" },
      { property: "og:description", content: "Daily recommendation usage for Reeler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}

function AdminPage() {
  const fetchStats = useServerFn(getUsageStats);
  const { data, isLoading } = useQuery({
    queryKey: ["usage-stats"],
    queryFn: () => fetchStats(),
    refetchInterval: 60_000,
  });

  return (
    <AppShell>
      <div className="w-full max-w-3xl">
        <h1 className="font-display text-3xl font-bold">Usage</h1>

        {isLoading && <Loader2 className="mt-8 size-5 animate-spin text-muted-foreground" />}

        {data && !data.isAdmin && (
          <div className="mt-6 flex items-center gap-3 rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
            <ShieldAlert className="size-4" />
            This page is only for the site owner.
          </div>
        )}

        {data?.isAdmin && (
          <>
            <p className="mt-2 text-muted-foreground">
              Every set of picks, refine and replacement counts as one generation.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Stat label="Today" value={data.today} />
              <Stat label="Signed in" value={data.todaySignedIn} />
              <Stat label="Visitors" value={data.todayGuests} />
            </div>

            <h2 className="mt-10 font-display text-xl font-semibold">Last 7 days</h2>
            <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {data.last7.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">Nothing yet.</li>
              )}
              {data.last7.map((d) => (
                <li key={d.date} className="flex items-center justify-between p-4 text-sm">
                  <span className="text-muted-foreground">{d.date}</span>
                  <span className="font-semibold">{d.total}</span>
                </li>
              ))}
            </ul>

            <h2 className="mt-10 font-display text-xl font-semibold">Busy-day alerts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Logged whenever a day passes 300 generations.
            </p>
            <ul className="mt-3 divide-y divide-border/70 overflow-hidden rounded-2xl border border-border/70 bg-card">
              {data.alerts.length === 0 && (
                <li className="p-4 text-sm text-muted-foreground">No busy days so far.</li>
              )}
              {data.alerts.map((a) => (
                <li key={a.alert_date} className="flex items-center justify-between p-4 text-sm">
                  <span className="text-muted-foreground">{a.alert_date}</span>
                  <span className="font-semibold">{a.total}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </AppShell>
  );
}
