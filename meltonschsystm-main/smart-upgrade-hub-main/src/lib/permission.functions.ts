import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const checkEdit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    resource: z.string().min(1).max(60),
    field: z.string().min(1).max(60),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.rpc("can_edit", {
      _user: context.userId, _resource: data.resource, _field: data.field,
    });
    if (error) throw new Error(error.message);
    const r = Array.isArray(row) ? row[0] : row;
    return {
      allowed: !!r?.allowed,
      requiresOverride: !!r?.requires_override,
      classification: r?.classification ?? "editable",
      requiredLevel: r?.required_level ?? 50,
    };
  });

export const editWithOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({
    resource: z.enum(["students", "staff"]),
    resource_id: z.string().uuid(),
    field: z.string().min(1).max(60),
    new_value: z.union([z.string(), z.number(), z.null()]),
    reason: z.string().trim().min(5).max(500),
  }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: lvl } = await context.supabase.rpc("role_level", { _user: context.userId });
    if ((lvl ?? 0) < 90) throw new Error("Only super admin or principal can override locked fields");

    const { data: callerSchool } = await context.supabase.rpc("my_school_id");
    if (!callerSchool) throw new Error("No school context for current user");

    const { data: before } = await supabaseAdmin
      .from(data.resource)
      .select(`${data.field}, school_id`)
      .eq("id", data.resource_id)
      .eq("school_id", callerSchool)
      .maybeSingle();
    if (!before) throw new Error("Record not found in your school");
    const oldVal = (before as any)?.[data.field] ?? null;

    const update: any = {}; update[data.field] = data.new_value;
    const { error } = await supabaseAdmin
      .from(data.resource).update(update)
      .eq("id", data.resource_id).eq("school_id", callerSchool);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("override_log").insert({
      actor_id: context.userId, resource: data.resource, resource_id: data.resource_id,
      field: data.field, old_value: String(oldVal ?? ""), new_value: String(data.new_value ?? ""),
      reason: data.reason,
    });
    return { ok: true };
  });
