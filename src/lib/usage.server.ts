import { getRequest, getRequestHeader } from "@tanstack/react-start/server";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function sha(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function clientIpHash() {
  const req = getRequest();
  const ip =
    req?.headers.get("cf-connecting-ip") ??
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";
  return sha(`reeler:${ip}`);
}

/** Single kind for every AI generation (initial slate, refine chip or single-slot refill). */
const KIND = "generate";
/** Per-visitor generations allowed in a rolling 24h window. */
export const GUEST_DAILY_LIMIT = 15;
export const USER_DAILY_LIMIT = 30;
/** Minimum spacing between generations from the same visitor. */
const MIN_INTERVAL_MS = 2000;
/** Daily total that triggers an owner alert. */
const ALERT_THRESHOLD = 300;

export type LimitCode = "rate_limit" | "too_fast" | "bot";

export interface LimitResult {
  ok: boolean;
  code?: LimitCode;
  message?: string;
}

const MESSAGES: Record<LimitCode, string> = {
  rate_limit:
    "You’ve used today’s free picks. Create a free account to keep going — or come back tomorrow.",
  too_fast: "That was quick — give it a couple of seconds and try again.",
  bot: "We couldn’t verify your browser. Please reload the page and try again.",
};

export async function isAdminUser(userId: string | undefined | null) {
  if (!userId) return false;
  const db = await admin();
  const { data } = await db.rpc("has_role", { _user_id: userId, _role: "admin" });
  return data === true;
}

function looksLikeBrowser() {
  const ua = getRequestHeader("user-agent") ?? "";
  if (ua.trim().length < 15) return false;
  return /Mozilla|AppleWebKit|Chrome|Safari|Firefox|Edg|Opera/i.test(ua);
}

async function maybeAlert() {
  const db = await admin();
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { count } = await db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .gte("created_at", startOfDay.toISOString());
  const total = count ?? 0;
  if (total < ALERT_THRESHOLD) return;
  const today = startOfDay.toISOString().slice(0, 10);
  const { error } = await db.from("usage_alerts").insert({ alert_date: today, total });
  // Unique violation = already alerted today.
  if (!error) console.warn(`[reeler] daily generation alert: ${total} generations on ${today}`);
}

/**
 * Gate one AI generation. Admins are never limited.
 * Returns ok:false with a user-facing message instead of throwing.
 */
export async function enforceGeneration(who: {
  userId?: string | null;
  ipHash?: string | null;
}): Promise<LimitResult> {
  const db = await admin();
  const column = who.userId ? "user_id" : "ip_hash";
  const value = who.userId ?? who.ipHash ?? "none";
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  // One round trip for all three checks — this runs before every AI call.
  const [isAdmin, { data: last }, { count }] = await Promise.all([
    isAdminUser(who.userId),
    db.from("ai_usage").select("created_at").eq(column, value).order("created_at", { ascending: false }).limit(1),
    db.from("ai_usage").select("id", { count: "exact", head: true }).eq(column, value).gte("created_at", since),
  ]);
  if (isAdmin) return { ok: true };

  if (!looksLikeBrowser()) return { ok: false, code: "bot", message: MESSAGES.bot };

  // Spacing check.
  const lastAt = last?.[0]?.created_at ? Date.parse(last[0].created_at) : 0;
  if (lastAt && Date.now() - lastAt < MIN_INTERVAL_MS) {
    return { ok: false, code: "too_fast", message: MESSAGES.too_fast };
  }

  // Daily quota.
  const limit = who.userId ? USER_DAILY_LIMIT : GUEST_DAILY_LIMIT;
  if ((count ?? 0) >= limit) {
    return { ok: false, code: "rate_limit", message: MESSAGES.rate_limit };
  }

  await db
    .from("ai_usage")
    .insert({ user_id: who.userId ?? null, ip_hash: who.ipHash ?? null, kind: KIND });
  await maybeAlert();
  return { ok: true };
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const db = await admin();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const { data } = await db
    .from("demo_cache")
    .select("result")
    .eq("key", key)
    .gte("created_at", since)
    .maybeSingle();
  return (data?.result as T) ?? null;
}

export async function cacheSet(key: string, result: unknown) {
  const db = await admin();
  await db
    .from("demo_cache")
    .upsert({ key, result: result as never, created_at: new Date().toISOString() });
}

export { sha };
