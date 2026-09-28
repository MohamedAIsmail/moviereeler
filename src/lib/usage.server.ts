import { getRequest } from "@tanstack/react-start/server";

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

/** Throws if the caller exceeded `limit` AI calls in the last 24h; otherwise records one. */
export async function enforceLimit(
  who: { userId?: string; ipHash?: string },
  kind: string,
  limit: number,
) {
  const db = await admin();
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  let q = db
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("kind", kind)
    .gte("created_at", since);
  q = who.userId ? q.eq("user_id", who.userId) : q.eq("ip_hash", who.ipHash ?? "none");
  const { count } = await q;
  if ((count ?? 0) >= limit) {
    throw new Error("You’ve reached today’s limit. Come back tomorrow for more picks.");
  }
  await db
    .from("ai_usage")
    .insert({ user_id: who.userId ?? null, ip_hash: who.ipHash ?? null, kind });
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
