import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RecommendationStatusSchema } from "./movies.schema";

export const listRecommendations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("recommendations")
      .select("*")
      .eq("user_id", context.userId)
      .neq("status", "dismissed")
      .order("match_score", { ascending: false, nullsFirst: false })
      .limit(60);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const generateRecommendations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ mood: z.string().max(200).nullable().optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { refreshRecommendations } = await import("./recommend.server");
    return refreshRecommendations(context.supabase, context.userId, data.mood?.trim() || null);
  });

export const setRecommendationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => RecommendationStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recommendations")
      .update({ status: data.status })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
