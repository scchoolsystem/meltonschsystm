import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";
import { render } from "@react-email/components";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { template as schoolAdminCredentialsTemplate } from "@/lib/email-templates/school-admin-credentials";

const SITE_NAME = "Smartdev ERP";
const SENDER_DOMAIN = "notify.erp.smartdev.co.ke";
const FROM_DOMAIN = "erp.smartdev.co.ke";

function generatePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  let out = "";
  const bytes = new Uint8Array(14);
  crypto.getRandomValues(bytes);
  for (const b of bytes) out += chars[b % chars.length];
  return out + "!9";
}

export const provisionSchoolAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        school_id: z.string().uuid(),
        email: z.string().email(),
        full_name: z.string().min(1).max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    // 1. Get school
    const { data: school, error: schErr } = await supabaseAdmin
      .from("schools")
      .select("id, name, slug")
      .eq("id", data.school_id)
      .single();

    if (schErr || !school) {
      throw new Error("School not found");
    }

    // 2. Find existing user
    let userId: string | null = null;

    const { data: existing } =
      await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });

    const match = existing?.users?.find(
      (u: any) => (u.email ?? "").toLowerCase() === data.email.toLowerCase(),
    );

    const password = generatePassword();
    let created = false;

    if (match) {
      userId = match.id;

      await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
      });
    } else {
      const { data: createdUser, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email: data.email,
          password,
          email_confirm: true,
          user_metadata: {
            full_name: data.full_name ?? `${school.name} Admin`,
          },
        });

      if (createErr || !createdUser?.user) {
        throw new Error(createErr?.message ?? "Failed to create user");
      }

      userId = createdUser.user.id;
      created = true;
    }

    if (!userId) throw new Error("User ID missing");

    // 3. Ensure profile
    await supabaseAdmin.from("profiles").upsert(
      {
        id: userId,
        full_name: data.full_name ?? `${school.name} Admin`,
      },
      { onConflict: "id" },
    );

    // 4. Assign role (FIXED, SINGLE CLEAN BLOCK)
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .upsert(
        {
          user_id: userId,
          role: "super_admin",
          school_id: school.id,
        },
        { onConflict: "user_id,role,school_id" },
      );

    if (roleError) {
      throw new Error(
        `Failed to assign super_admin role: ${roleError.message}`,
      );
    }

    // 5. Ensure school membership (FIXED)
    const { data: existingMember } = await supabaseAdmin
      .from("school_members")
      .select("id")
      .eq("user_id", userId)
      .eq("school_id", school.id)
      .maybeSingle();

    if (!existingMember) {
      await supabaseAdmin.from("school_members").insert({
        user_id: userId,
        school_id: school.id,
        is_default: true,
      });
    }

    const portal_url = `https://${school.slug}.smartdev.co.ke`;
    const full_name = data.full_name ?? `${school.name} Admin`;

    // 6. Email (unchanged but safe)
    let email_sent = false;
    let email_error: string | null = null;

    try {
      const messageId = crypto.randomUUID();
      const recipient = data.email.toLowerCase();

      const templateData = {
        schoolName: school.name,
        portalUrl: portal_url,
        loginEmail: data.email,
        password,
        fullName: full_name,
      };

      const element = React.createElement(
        schoolAdminCredentialsTemplate.component,
        templateData,
      );

      const html = await render(element);
      const text = await render(element, { plainText: true });

      const subject =
        typeof schoolAdminCredentialsTemplate.subject === "function"
          ? schoolAdminCredentialsTemplate.subject(templateData)
          : schoolAdminCredentialsTemplate.subject;

      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "school-admin-credentials",
        recipient_email: recipient,
        status: "pending",
      });

      const { error: enqueueError } = await supabaseAdmin.rpc(
        "enqueue_email",
        {
          queue_name: "transactional_emails",
          payload: {
            message_id: messageId,
            to: recipient,
            from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: "transactional",
            label: "school-admin-credentials",
            idempotency_key: `school-admin-${school.id}-${messageId}`,
            queued_at: new Date().toISOString(),
          },
        },
      );

      if (enqueueError) throw enqueueError;

      email_sent = true;
    } catch (e: any) {
      email_error = e?.message ?? "unknown error";
      console.error("Failed to send school admin credentials email", e);
    }

    return {
      ok: true,
      created,
      email: data.email,
      password,
      portal_url,
      email_sent,
      email_error,
    };
  });