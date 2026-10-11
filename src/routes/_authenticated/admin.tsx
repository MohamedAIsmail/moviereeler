import { useState, type ReactNode } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AppShell } from "@/components/AppShell";
import { SeoAdmin } from "@/components/SeoAdmin";
import { Input } from "@/components/ui/input";
import { checkAdmin, getDashboard } from "@/lib/dashboard.functions";
import { REFINES, type RefineKey } from "@/lib/refine";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Dashboard · Reeler" },
      { name: "description", content: "Owner dashboard for Reeler: funnel, retention, pick quality and traffic." },
      { property: "og:title", content: "Dashboard · Reeler" },
      { property: "og:description", content: "Owner dashboard for Reeler." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    const { isAdmin } = await checkAdmin().catch(() => ({ isAdmin: false }));
    if (!isAdmin) throw redirect({ to: "/" });
  },
  component: AdminPage,
});

const iso = (d: Date) => d.toISOString().slice(0, 10);

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-border/70 bg-card p-5 ${className}`}>
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Delta({ cur, prev }: { cur: number; prev: number }) {
  if (!prev) return <span className="text-xs text-muted-foreground">prev {prev}</span>;
  const d = Math.round(((cur - prev) / prev) * 100);
  return (
    <span className={`text-xs ${d >= 0 ? "text-primary" : "text-destructive"}`}>
      {d >= 0 ? "+" : ""}
      {d}% vs prev ({prev})
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-secondary/50 p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold">{value}</p>
      {sub && <div className="mt-1">{sub}</div>}
    </div>
  );
}

function Table({ head, rows, empty = "No data yet." }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => (
              <th key={h} className={`pb-2 font-medium ${i ? "text-right" : ""}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`py-2 ${j ? "text-right tabular-nums" : ""}`}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminPage() {
  const fetchDash = useServerFn(getDashboard);
  const today = new Date();
  const [to, setTo] = useState(iso(today));
  const [from, setFrom] = useState(iso(new Date(today.getTime() - 6 * 86_400_000)));

  const { data, isLoading, error } = useQuery({
    queryKey: ["dashboard", from, to],
    queryFn: () => fetchDash({ data: { from, to } }),
    enabled: from <= to,
  });

  const f = data?.funnel.cur;
  const p = data?.funnel.prev;

  return (
    <AppShell>
      <div className="w-full space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold">Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Compared with the previous period of the same length.</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className="w-auto" aria-label="From" />
            <span className="text-muted-foreground">to</span>
            <Input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className="w-auto" aria-label="To" />
          </div>
        </div>

        {isLoading && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
        {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

        {data && f && p && (
          <>
            <Card title="Funnel">
              <div className="grid gap-3 sm:grid-cols-4">
                {(
                  [
                    ["Unique visitors", f.visitors, p.visitors, null],
                    ["Searched", f.searched, p.searched, f.visitors],
                    ["Requested picks", f.requested, p.requested, f.searched],
                    ["Signed up", f.signedUp, p.signedUp, f.requested],
                  ] as const
                ).map(([label, c, pv, base]) => (
                  <Metric
                    key={label}
                    label={label}
                    value={c}
                    sub={
                      <div className="flex flex-col">
                        {base !== null && (
                          <span className="text-xs text-muted-foreground">
                            {base ? Math.round((c / base) * 1000) / 10 : 0}% of previous step
                          </span>
                        )}
                        <Delta cur={c} prev={pv} />
                      </div>
                    }
                  />
                ))}
              </div>
            </Card>

            <Card title="Daily visitors and picks requested">
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data.daily}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} stroke="var(--muted-foreground)" fontSize={12} />
                    <YAxis allowDecimals={false} stroke="var(--muted-foreground)" fontSize={12} />
                    <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }} />
                    <Legend />
                    <Line type="monotone" dataKey="visitors" name="Visitors" stroke="var(--primary)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="picks" name="Picks requested" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Returning visitors">
                <Metric
                  label="Requested picks on 2+ days"
                  value={`${data.returningPct}%`}
                  sub={<span className="text-xs text-muted-foreground">of {data.requesters} visitors who requested picks</span>}
                />
                <div className="mt-4">
                  <Table
                    head={["Week of first visit", "Visitors", "Wk 1", "Wk 2", "Wk 3", "Wk 4"]}
                    rows={data.cohorts.map((c) => [c.week, c.size, ...c.weeks.map((w) => (w === null ? "—" : `${w}%`))])}
                  />
                </div>
              </Card>

              <Card title="Pick quality">
                <div className="grid grid-cols-2 gap-3">
                  <Metric label="👍 vs 👎" value={`${data.quality.up} / ${data.quality.down}`} sub={<span className="text-xs text-muted-foreground">{data.quality.upShare}% positive</span>} />
                  <Metric label="Seen it rate" value={`${data.quality.seenRate}%`} />
                  <Metric label="Not for me rate" value={`${data.quality.notForMeRate}%`} />
                  <Metric label="Trailer click rate" value={`${data.quality.trailerRate}%`} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Rates are per pick shown ({data.quality.picksShown} picks).</p>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Traffic sources">
                <Table head={["Source", "Visitors", "Signups"]} rows={data.sources.map((s) => [s.source, s.visitors, s.signups])} />
              </Card>
              <Card title="Most used refine chips">
                <Table
                  head={["Chip", "Clicks"]}
                  rows={data.chips.map((c) => [REFINES[c.label as RefineKey]?.label ?? c.label, c.count])}
                />
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Top 10 favourites added">
                <Table head={["Title", "Times"]} rows={data.topFavourites.map((t) => [t.label, t.count])} />
              </Card>
              <Card title="Top 10 recommended by Reeler">
                <Table head={["Title", "Times"]} rows={data.topRecommended.map((t) => [t.label, t.count])} />
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card title="Daily AI generations">
                <p className="mb-3 text-sm text-muted-foreground">{data.totalGenerations} in this period.</p>
                <Table head={["Date", "Generations"]} rows={[...data.daily].reverse().map((d) => [d.date, d.generations])} />
              </Card>
              <Card title="Pro waitlist & feedback">
                <p className="text-sm text-muted-foreground">
                  This will fill in once the Pro waitlist and feedback form are added.
                </p>
              </Card>
            </div>
          </>
        )}

        <Card title="SEO pages">
          <SeoAdmin />
        </Card>
      </div>
    </AppShell>
  );
}
