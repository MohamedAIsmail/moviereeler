import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface UsageStats {
  isAdmin: boolean;
  today: number;
  todaySignedIn: number;
  todayGuests: number;
  last7: { date: string; total: number }[];
  alerts: { alert_date: string; total: number }[];
}

export const getUsageStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<UsageStats> => {
    const { isAdminUser } = await import("./usage.server");
    const empty: UsageStats = {
      isAdmin: false,
      today: 0,
      todaySignedIn: 0,
      todayGuests: 0,
      last7: [],
      alerts: [],
    };
    if (!(await isAdminUser(context.userId))) return empty;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 6);

    const { data: rows } = await supabaseAdmin
      .from("ai_usage")
      .select("user_id, created_at")
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    const byDay = new Map<string, number>();
    const todayKey = new Date().toISOString().slice(0, 10);
    let today = 0;
    let todaySignedIn = 0;
    for (const row of rows ?? []) {
      const day = row.created_at.slice(0, 10);
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (day === todayKey) {
        today += 1;
        if (row.user_id) todaySignedIn += 1;
      }
    }

    const { data: alerts } = await supabaseAdmin
      .from("usage_alerts")
      .select("alert_date, total")
      .order("alert_date", { ascending: false })
      .limit(10);

    return {
      isAdmin: true,
      today,
      todaySignedIn,
      todayGuests: today - todaySignedIn,
      last7: [...byDay.entries()]
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => b.date.localeCompare(a.date)),
      alerts: alerts ?? [],
    };
  });
