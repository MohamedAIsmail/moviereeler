import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { isAdminUser } = await import("./usage.server");
    return { isAdmin: await isAdminUser(context.userId) };
  });

type Ev = {
  visitor_id: string;
  user_id: string | null;
  event_name: string;
  created_at: string;
  properties: Record<string, unknown> | null;
};

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const day = (iso: string) => iso.slice(0, 10);
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);

function weekStart(t: number) {
  const d = new Date(t);
  d.setUTCHours(0, 0, 0, 0);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return d.getTime() - dow * DAY;
}

function funnel(evs: Ev[]) {
  const sets = { visitors: new Set<string>(), searched: new Set<string>(), requested: new Set<string>(), signedUp: new Set<string>() };
  for (const e of evs) {
    sets.visitors.add(e.visitor_id);
    if (e.event_name === "search") sets.searched.add(e.visitor_id);
    if (e.event_name === "picks_requested") sets.requested.add(e.visitor_id);
    if (e.event_name === "signup_completed") sets.signedUp.add(e.visitor_id);
  }
  return {
    visitors: sets.visitors.size,
    searched: sets.searched.size,
    requested: sets.requested.size,
    signedUp: sets.signedUp.size,
  };
}

function top(map: Map<string, number>, n = 10) {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([label, count]) => ({ label, count }));
}

export const getDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ from: z.string().date(), to: z.string().date() }).parse(d))
  .handler(async ({ data, context }) => {
    const { isAdminUser } = await import("./usage.server");
    if (!(await isAdminUser(context.userId))) throw new Error("Forbidden");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const from = Date.parse(`${data.from}T00:00:00Z`);
    const to = Date.parse(`${data.to}T00:00:00Z`) + DAY; // exclusive
    const span = to - from;
    const prevFrom = from - span;
    const cohortFrom = weekStart(from) - 4 * WEEK;
    const fetchFrom = Math.min(prevFrom, cohortFrom);

    // Page through events.
    const all: Ev[] = [];
    for (let page = 0; page < 50; page++) {
      const { data: rows, error } = await db
        .from("events")
        .select("visitor_id, user_id, event_name, created_at, properties")
        .gte("created_at", new Date(fetchFrom).toISOString())
        .lt("created_at", new Date(to).toISOString())
        .order("created_at", { ascending: true })
        .range(page * 1000, page * 1000 + 999);
      if (error) throw new Error(error.message);
      all.push(...((rows ?? []) as Ev[]));
      if (!rows || rows.length < 1000) break;
    }

    const inRange = all.filter((e) => {
      const t = Date.parse(e.created_at);
      return t >= from && t < to;
    });
    const inPrev = all.filter((e) => {
      const t = Date.parse(e.created_at);
      return t >= prevFrom && t < from;
    });

    // 1. Funnel
    const cur = funnel(inRange);
    const prev = funnel(inPrev);

    // 2. Returning
    const reqDays = new Map<string, Set<string>>();
    for (const e of inRange)
      if (e.event_name === "picks_requested") {
        if (!reqDays.has(e.visitor_id)) reqDays.set(e.visitor_id, new Set());
        reqDays.get(e.visitor_id)!.add(day(e.created_at));
      }
    const returningPct = pct([...reqDays.values()].filter((s) => s.size >= 2).length, reqDays.size);

    const firstSeen = new Map<string, number>();
    const activeWeeks = new Map<string, Set<number>>();
    for (const e of all) {
      const t = Date.parse(e.created_at);
      if (!firstSeen.has(e.visitor_id)) firstSeen.set(e.visitor_id, t);
      if (!activeWeeks.has(e.visitor_id)) activeWeeks.set(e.visitor_id, new Set());
      activeWeeks.get(e.visitor_id)!.add(weekStart(t));
    }
    const cohorts = new Map<number, string[]>();
    for (const [vid, t] of firstSeen) {
      const w = weekStart(t);
      if (w < cohortFrom || t >= to) continue;
      if (!cohorts.has(w)) cohorts.set(w, []);
      cohorts.get(w)!.push(vid);
    }
    const cohortRows = [...cohorts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([w, vids]) => ({
        week: new Date(w).toISOString().slice(0, 10),
        size: vids.length,
        weeks: [1, 2, 3, 4].map((n) => {
          const target = w + n * WEEK;
          if (target >= to) return null;
          return pct(vids.filter((v) => activeWeeks.get(v)!.has(target)).length, vids.length);
        }),
      }));

    // 3. Pick quality
    const count = (name: string) => inRange.filter((e) => e.event_name === name).length;
    let picksShown = 0;
    const recommended = new Map<string, number>();
    const favourites = new Map<string, number>();
    const chips = new Map<string, number>();
    for (const e of inRange) {
      const p = e.properties ?? {};
      if (e.event_name === "picks_shown" && Array.isArray(p.titles)) {
        picksShown += p.titles.length;
        for (const t of p.titles as string[]) recommended.set(t, (recommended.get(t) ?? 0) + 1);
      }
      if (e.event_name === "film_added" && typeof p.title === "string") {
        const k = p.year ? `${p.title} (${p.year})` : p.title;
        favourites.set(k, (favourites.get(k) ?? 0) + 1);
      }
      if (e.event_name === "refine_clicked" && typeof p.chip === "string")
        chips.set(p.chip, (chips.get(p.chip) ?? 0) + 1);
    }
    const up = count("thumbs_up");
    const down = count("thumbs_down");
    const quality = {
      up,
      down,
      upShare: pct(up, up + down),
      picksShown,
      seenRate: pct(count("seen_it"), picksShown),
      notForMeRate: pct(count("not_for_me"), picksShown),
      trailerRate: pct(count("trailer_clicked"), picksShown),
    };

    // 4. Sources
    const srcOf = new Map<string, string>();
    for (const e of inRange) {
      if (srcOf.has(e.visitor_id)) continue;
      const s = (e.properties?.first_source as string | null) ?? null;
      srcOf.set(e.visitor_id, s || "Direct / unknown");
    }
    const signupVids = new Set(inRange.filter((e) => e.event_name === "signup_completed").map((e) => e.visitor_id));
    const srcAgg = new Map<string, { visitors: number; signups: number }>();
    for (const [vid, s] of srcOf) {
      const a = srcAgg.get(s) ?? { visitors: 0, signups: 0 };
      a.visitors += 1;
      if (signupVids.has(vid)) a.signups += 1;
      srcAgg.set(s, a);
    }
    const sources = [...srcAgg.entries()]
      .map(([source, v]) => ({ source, ...v }))
      .sort((a, b) => b.visitors - a.visitors);

    // Daily chart
    const daily: { date: string; visitors: number; picks: number; generations: number }[] = [];
    const visitorsByDay = new Map<string, Set<string>>();
    const picksByDay = new Map<string, number>();
    for (const e of inRange) {
      const d = day(e.created_at);
      if (!visitorsByDay.has(d)) visitorsByDay.set(d, new Set());
      visitorsByDay.get(d)!.add(e.visitor_id);
      if (e.event_name === "picks_requested") picksByDay.set(d, (picksByDay.get(d) ?? 0) + 1);
    }

    // 8. AI generations
    const gens = new Map<string, number>();
    for (let page = 0; page < 50; page++) {
      const { data: rows } = await db
        .from("ai_usage")
        .select("created_at")
        .gte("created_at", new Date(from).toISOString())
        .lt("created_at", new Date(to).toISOString())
        .range(page * 1000, page * 1000 + 999);
      for (const r of rows ?? []) gens.set(day(r.created_at), (gens.get(day(r.created_at)) ?? 0) + 1);
      if (!rows || rows.length < 1000) break;
    }
    for (let t = from; t < to; t += DAY) {
      const d = new Date(t).toISOString().slice(0, 10);
      daily.push({ date: d, visitors: visitorsByDay.get(d)?.size ?? 0, picks: picksByDay.get(d) ?? 0, generations: gens.get(d) ?? 0 });
    }

    return {
      funnel: { cur, prev },
      returningPct,
      requesters: reqDays.size,
      cohorts: cohortRows,
      quality,
      sources,
      topFavourites: top(favourites),
      topRecommended: top(recommended),
      chips: top(chips, 20),
      daily,
      totalGenerations: [...gens.values()].reduce((a, b) => a + b, 0),
    };
  });
