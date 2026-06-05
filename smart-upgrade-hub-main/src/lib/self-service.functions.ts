import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Self-service password change. The caller proves the current password
 * by signing in with it via the publishable client (verifyCurrentPassword
 * is enforced server-side using admin auth APIs).
 */
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        current_password: z.string().min(1).max(200),
        new_password: z
          .string()
          .min(10, "Password must be at least 10 characters")
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Need the user's email/synthetic_email to re-verify the current password.
    const { data: userRow, error: getErr } =
      await supabaseAdmin.auth.admin.getUserById(userId);
    if (getErr || !userRow?.user?.email) {
      throw new Error("Could not load account");
    }
    const email = userRow.user.email;

    // Verify current password by attempting a sign-in via a one-off client.
    // We can use the admin client's REST helper: signInWithPassword requires
    // the publishable key. Cheapest path: use admin update + reject if the
    // verification fails by re-attempting a sign-in.
    const verify = await fetch(
      `${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
        },
        body: JSON.stringify({ email, password: data.current_password }),
      },
    );
    if (!verify.ok) {
      throw new Error("Current password is incorrect");
    }

    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      { password: data.new_password },
    );
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin
      .from("user_credentials")
      .update({ last_reset_at: new Date().toISOString() })
      .eq("user_id", userId);

    return { ok: true };
  });
