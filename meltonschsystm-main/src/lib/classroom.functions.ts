import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Join a class via its 6-character join code.
 * - Students: assigns the student record linked to the user to this class.
 * - Teachers/admins: no-op (they already see all classes they manage).
 */
export const joinClassByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ code: z.string().trim().min(4).max(12) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const code = data.code.toUpperCase();
    const userId = context.userId;

    // Find the class by code (uses service role to bypass tenant isolation
    // for the code lookup, but we only return safe fields).
    const { data: klass, error: classErr } = await supabaseAdmin
      .from("classes")
      .select("id, name, school_id, join_code")
      .eq("join_code", code)
      .maybeSingle();

    if (classErr) throw new Error(classErr.message);
    if (!klass) throw new Error("Invalid join code");

    // Find the student record(s) linked to this user
    const { data: links } = await supabaseAdmin
      .from("student_user_links")
      .select("student_id")
      .eq("user_id", userId);

    if (!links || links.length === 0) {
      throw new Error(
        "Only students can join a class. Ask your class teacher to add you.",
      );
    }

    const studentIds = links.map((l) => l.student_id);

    // Only update students that belong to the same school as the class
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("students")
      .update({ class_id: klass.id })
      .in("id", studentIds)
      .eq("school_id", klass.school_id)
      .select("id, first_name, last_name");

    if (updErr) throw new Error(updErr.message);

    if (!updated || updated.length === 0) {
      throw new Error(
        "This class is in a different school. Contact your administrator.",
      );
    }

    return {
      ok: true,
      class_id: klass.id,
      class_name: klass.name,
      students_joined: updated.length,
    };
  });
