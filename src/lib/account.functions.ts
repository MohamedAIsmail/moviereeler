import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const id = context.userId;
    await supabaseAdmin.from("recommendations").delete().eq("user_id", id);
    await supabaseAdmin.from("watched_movies").delete().eq("user_id", id);
    await supabaseAdmin.from("ai_usage").delete().eq("user_id", id);
    await supabaseAdmin.from("profiles").delete().eq("id", id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
    if (error) throw new Error("We couldn’t delete your account. Please try again.");
    return { ok: true };
  });
