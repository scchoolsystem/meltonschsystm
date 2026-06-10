import { PushNotifications } from "@capacitor/push-notifications";
import { isNativeApp } from "@/hooks/use-tenant";
import { supabase } from "@/integrations/supabase/client";

/**
 * Register device for push notifications.
 * Call once after the user is authenticated and school is selected.
 */
export async function registerPushNotifications(): Promise<void> {
  if (!isNativeApp()) return;

  try {
    const permission = await PushNotifications.requestPermissions();
    if (permission.receive !== "granted") {
      console.warn("[Push] Permission not granted");
      return;
    }

    await PushNotifications.register();

    // Save FCM token to Supabase when received
    await PushNotifications.addListener("registration", async (token) => {
      console.log("[Push] FCM token registered"); // token value intentionally omitted from logs
      await savePushToken(token.value);
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[Push] Registration error:", err);
    });

    // Handle foreground notifications
    await PushNotifications.addListener("pushNotificationReceived", (notification) => {
      console.log("[Push] Received:", notification);
      // Notification received while app is open — show in-app toast if needed
    });

    // Handle notification tap
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      console.log("[Push] Action performed:", action);
      const url = action.notification?.data?.url;
      if (url && typeof window !== "undefined") {
        window.location.hash = url;
      }
    });
  } catch (err) {
    console.error("[Push] Setup failed:", err);
  }
}

/**
 * Save FCM token to Supabase push_tokens table.
 * Upserts on (user_id, token) so duplicate registrations are safe.
 */
async function savePushToken(token: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("push_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform: "android",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,token" }
    );
  } catch (err) {
    console.error("[Push] Failed to save token:", err);
  }
}

/**
 * Remove push token on sign-out.
 */
export async function unregisterPushToken(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await PushNotifications.removeAllListeners();
    await supabase.from("push_tokens").delete().eq("user_id", user.id);
  } catch (err) {
    console.error("[Push] Unregister failed:", err);
  }
}
