// Drop this component into your _app.admin.settings.tsx page:
//
//   import { MpesaSettingsCard } from "@/components/MpesaSettingsCard";
//   ...
//   <MpesaSettingsCard />   ← add after the Academic Period card
//
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Smartphone, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { saveMpesaConfig, loadMpesaConfig } from "@/lib/mpesa.functions";

export function MpesaSettingsCard() {
  const save = useServerFn(saveMpesaConfig);
  const load = useServerFn(loadMpesaConfig);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const [form, setForm] = useState({
    shortcode:       "",
    consumer_key:    "",
    consumer_secret: "",
    passkey:         "",
    callback_token:  "",
    env:             "sandbox" as "sandbox" | "production",
    enabled:         false,
  });
  const [savedFlags, setSavedFlags] = useState({
    consumer_key_set: false,
    consumer_secret_set: false,
    passkey_set: false,
    callback_token_set: false,
  });

  useEffect(() => {
    load({}).then((cfg) => {
      if (cfg) {
        setForm(f => ({ ...f, shortcode: cfg.shortcode ?? "", env: cfg.env ?? "sandbox", enabled: cfg.enabled ?? false }));
        setSavedFlags({
          consumer_key_set: !!cfg.consumer_key_set,
          consumer_secret_set: !!cfg.consumer_secret_set,
          passkey_set: !!cfg.passkey_set,
          callback_token_set: !!cfg.callback_token_set,
        });
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const set = (k: keyof typeof form, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function handleSave() {
    setSaving(true);
    try {
      await save({ data: form });
      toast.success("M-Pesa configuration saved");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const callbackUrl = `${window.location.origin}/api/public/mpesa-callback?token=${form.callback_token}&school=YOUR_SCHOOL_ID`;

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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Smartphone className="w-4 h-4" /> M-Pesa / Daraja Integration
            </CardTitle>
            <CardDescription>
              Enter your Safaricom Daraja API credentials. Each school has its own Paybill/Till.
            </CardDescription>
          </div>
          <Badge variant={form.enabled ? "default" : "secondary"}>
            {form.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">

        {/* Enable toggle */}
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Enable M-Pesa payments</p>
            <p className="text-xs text-muted-foreground">Students and parents can pay fees via STK push</p>
          </div>
          <Switch checked={form.enabled} onCheckedChange={(v) => set("enabled", v)} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* Shortcode */}
          <div>
            <Label>Paybill / Till Number</Label>
            <Input
              value={form.shortcode}
              onChange={e => set("shortcode", e.target.value)}
              placeholder="e.g. 174379"
            />
          </div>

          {/* Environment */}
          <div>
            <Label>Environment</Label>
            <Select value={form.env} onValueChange={v => set("env", v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (testing)</SelectItem>
                <SelectItem value="production">Production (live)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Consumer Key */}
          <div>
            <Label>Consumer Key</Label>
            <div className="relative">
              <Input
                type={showSecrets ? "text" : "password"}
                value={form.consumer_key}
                onChange={e => set("consumer_key", e.target.value)}
                placeholder={savedFlags.consumer_key_set ? "•••••••• (saved — leave blank to keep)" : "From Daraja portal"}
                className="pr-10"
              />
            </div>
          </div>

          {/* Consumer Secret */}
          <div>
            <Label>Consumer Secret</Label>
            <Input
              type={showSecrets ? "text" : "password"}
              value={form.consumer_secret}
              onChange={e => set("consumer_secret", e.target.value)}
              placeholder={savedFlags.consumer_secret_set ? "•••••••• (saved — leave blank to keep)" : "From Daraja portal"}
            />
          </div>

          {/* Passkey */}
          <div className="md:col-span-2">
            <Label>Passkey (Lipa na M-Pesa Online)</Label>
            <Input
              type={showSecrets ? "text" : "password"}
              value={form.passkey}
              onChange={e => set("passkey", e.target.value)}
              placeholder={savedFlags.passkey_set ? "•••••••• (saved — leave blank to keep)" : "From Daraja portal → Lipa na M-Pesa"}
            />
          </div>

          {/* Callback token */}
          <div className="md:col-span-2">
            <Label>Callback Secret Token</Label>
            <div className="flex gap-2">
              <Input
                type={showSecrets ? "text" : "password"}
                value={form.callback_token}
                onChange={e => set("callback_token", e.target.value)}
                placeholder={savedFlags.callback_token_set ? "•••••••• (saved — leave blank to keep)" : "Click Generate, or leave blank"}
              />
              <Button type="button" variant="outline" onClick={() => set("callback_token", crypto.randomUUID().replace(/-/g, "").slice(0, 24))}>
                Generate
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A random secret that protects your callback URL from spoofing.
            </p>
          </div>
        </div>

        {/* Show/hide secrets */}
        <button
          type="button"
          onClick={() => setShowSecrets(v => !v)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showSecrets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {showSecrets ? "Hide" : "Show"} credentials
        </button>

        {/* Callback URL to register in Daraja */}
        <div className="rounded-lg bg-muted p-3 text-xs space-y-1">
          <p className="font-medium text-foreground">Register this Callback URL in your Daraja app:</p>
          <p className="font-mono break-all text-muted-foreground">{callbackUrl}</p>
          <p className="text-muted-foreground mt-1">
            Go to <strong>Daraja portal → Your App → Edit → CallBack URL</strong> and paste the URL above.
          </p>
        </div>

        {/* How to get credentials */}
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">How to get your Daraja credentials:</p>
          <ol className="list-decimal list-inside space-y-0.5">
            <li>Go to <strong>developer.safaricom.co.ke</strong> and log in</li>
            <li>Create an app → copy Consumer Key and Consumer Secret</li>
            <li>Go to <strong>Lipa na M-Pesa Online</strong> → copy the Passkey</li>
            <li>Set your Shortcode to your Paybill or Till number</li>
            <li>Paste the Callback URL above into your Daraja app</li>
            <li>Switch Environment to <strong>Production</strong> when ready</li>
          </ol>
        </div>

        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Save M-Pesa settings
        </Button>
      </CardContent>
    </Card>
  );
}
