// Drop this component into your _app.admin.settings.tsx page:
//
//   import { SmsSettingsCard } from "@/components/SmsSettingsCard";
//   ...
//   <SmsSettingsCard />   ← add after the M-Pesa card
//
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, MessageSquare, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { saveSmsConfig, loadSmsConfig } from "@/lib/sms.functions";

export function SmsSettingsCard() {
  const save = useServerFn(saveSmsConfig);
  const load = useServerFn(loadSmsConfig);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const [form, setForm] = useState({
    sender_id: "",
    api_key: "",
    service_id: "0",
    enabled: false,
  });
  const [savedFlags, setSavedFlags] = useState({ api_key_set: false });

  useEffect(() => {
    load({})
      .then((cfg) => {
        if (cfg) {
          setForm((f) => ({
            ...f,
            sender_id: cfg.sender_id ?? "",
            service_id: cfg.service_id ?? "0",
            enabled: cfg.enabled ?? false,
          }));
          setSavedFlags({ api_key_set: !!cfg.api_key_set });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await save({ data: form });
      toast.success("SMS configuration saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <Card>
      <CardContent className="py-10 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </CardContent>
    </Card>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4" /> Bulk SMS (Crowdcomm)
        </CardTitle>
        <CardDescription>
          Register your own Crowdcomm account so bulk SMS goes out under your school's
          name instead of SmartDev's shared sender ID. Leave this off and messages will
          still send — just "from" SmartDev.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Use our own Crowdcomm account</p>
            <p className="text-xs text-muted-foreground">
              {form.enabled ? "Sending as your school's own sender ID" : "Currently sending via SmartDev's shared account"}
            </p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className="grid gap-2">
          <Label>Sender ID / Shortcode</Label>
          <Input
            value={form.sender_id}
            onChange={(e) => set("sender_id", e.target.value)}
            placeholder="e.g. GREENFIELD"
          />
          <p className="text-xs text-muted-foreground">Must be a Sender ID already approved on your Crowdcomm partner account.</p>
        </div>

        <div className="grid gap-2">
          <Label>Service ID</Label>
          <Input value={form.service_id} onChange={(e) => set("service_id", e.target.value)} placeholder="0" />
        </div>

        <div className="grid gap-2">
          <Label className="flex items-center gap-2">
            Bulk SMS API Key {savedFlags.api_key_set && <Badge variant="secondary" className="text-[10px]">Saved</Badge>}
          </Label>
          <div className="relative">
            <Input
              type={showKey ? "text" : "password"}
              value={form.api_key}
              onChange={(e) => set("api_key", e.target.value)}
              placeholder={savedFlags.api_key_set ? "•••••••• (saved — leave blank to keep)" : "From your Crowdcomm partner dashboard"}
            />
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save
        </Button>
      </CardContent>
    </Card>
  );
}
