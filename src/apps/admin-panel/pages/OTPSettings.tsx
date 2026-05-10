import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FeatureGate } from "../components/FeatureGate";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Shield, MessageCircle, Phone, Send } from "lucide-react";

function normalizeSettings(s: any) {
  return s && typeof s === "object" && !Array.isArray(s) ? s : {};
}

export default function OTPSettings() {
  return (
    <FeatureGate featureKey="otp_verification" featureName="OTP Verification" description="Phone number verification via SMS or WhatsApp OTP before checkout.">
      <OTPSettingsContent />
    </FeatureGate>
  );
}

function OTPSettingsContent() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [channel, setChannel] = useState<"sms" | "whatsapp" | "both">("sms");
  const [smsProvider, setSmsProvider] = useState<"msg91" | "twilio">("msg91");
  const [smsApiKey, setSmsApiKey] = useState("");
  const [smsSenderId, setSmsSenderId] = useState("");
  const [smsFlowId, setSmsFlowId] = useState("");
  const [smsAccountSid, setSmsAccountSid] = useState("");
  const [smsAuthToken, setSmsAuthToken] = useState("");
  const [smsFromNumber, setSmsFromNumber] = useState("");
  const [waProvider, setWaProvider] = useState<"meta" | "twilio">("meta");
  const [waApiKey, setWaApiKey] = useState("");
  const [waPhoneId, setWaPhoneId] = useState("");
  const [saving, setSaving] = useState(false);
  const [testPhone, setTestPhone] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  const { data: restaurantData } = useQuery({
    queryKey: ["admin", "restaurant-otp", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("settings")
        .eq("id", restaurant!.id)
        .single();
      return data;
    },
  });

  useEffect(() => {
    if (!restaurantData) return;
    const s = normalizeSettings(restaurantData.settings);
    const c = s.otp_config || {};
    setEnabled(!!c.enabled);
    setChannel(c.channel || "sms");
    setSmsProvider(c.sms_provider || "msg91");
    setSmsApiKey(c.sms_api_key || "");
    setSmsSenderId(c.sms_sender_id || "");
    setSmsFlowId(c.sms_flow_id || "");
    setSmsAccountSid(c.sms_account_sid || "");
    setSmsAuthToken(c.sms_auth_token || "");
    setSmsFromNumber(c.sms_from_number || "");
    setWaProvider(c.whatsapp_provider || "meta");
    setWaApiKey(c.whatsapp_api_key || "");
    setWaPhoneId(c.whatsapp_phone_number_id || "");
  }, [restaurantData]);

  const handleSave = async () => {
    if (!restaurant?.id) return;
    setSaving(true);
    try {
      const s = normalizeSettings(restaurantData?.settings);
      const nextSettings = {
        ...s,
        otp_config: {
          enabled,
          channel,
          sms_provider: smsProvider,
          sms_api_key: smsApiKey,
          sms_sender_id: smsSenderId,
          sms_flow_id: smsFlowId,
          sms_account_sid: smsAccountSid,
          sms_auth_token: smsAuthToken,
          sms_from_number: smsFromNumber,
          whatsapp_provider: waProvider,
          whatsapp_api_key: waApiKey,
          whatsapp_phone_number_id: waPhoneId,
        },
      };
      const { error } = await supabase
        .from("restaurants")
        .update({ settings: nextSettings } as any)
        .eq("id", restaurant.id);
      if (error) throw error;
      qc.invalidateQueries({ queryKey: ["admin", "restaurant-otp"] });
      toast({ title: "OTP settings saved" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleTestOtp = async () => {
    if (!testPhone || !restaurant?.id) return;
    setTestResult("Sending...");
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-otp`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ phone: testPhone, restaurant_id: restaurant.id }),
        }
      );
      const data = await resp.json();
      setTestResult(data.success ? "✅ OTP sent successfully!" : `❌ ${data.error}`);
    } catch (e: any) {
      setTestResult(`❌ ${e.message}`);
    }
  };

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Shield className="h-6 w-6" /> OTP Verification
        </h1>
        <p className="text-muted-foreground mt-1">
          Verify customer phone numbers before checkout via SMS or WhatsApp
        </p>
      </div>

      {/* Enable Toggle */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Enable OTP</CardTitle>
          <CardDescription>Require phone verification before placing orders</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <Label>OTP Verification</Label>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </CardContent>
      </Card>

      {enabled && (
        <>
          {/* Channel */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Delivery Channel</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-2">
                {(["sms", "whatsapp", "both"] as const).map((ch) => (
                  <button
                    key={ch}
                    onClick={() => setChannel(ch)}
                    className={`flex items-center justify-center gap-2 rounded-lg border-2 p-3 text-sm font-medium capitalize transition-colors ${
                      channel === ch
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-muted text-muted-foreground"
                    }`}
                  >
                    {ch === "sms" ? <Phone className="h-4 w-4" /> : ch === "whatsapp" ? <MessageCircle className="h-4 w-4" /> : <Send className="h-4 w-4" />}
                    {ch}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SMS Config */}
          {(channel === "sms" || channel === "both") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Phone className="h-4 w-4" /> SMS Provider
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  {(["msg91", "twilio"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setSmsProvider(p)}
                      className={`rounded-lg border-2 p-2.5 text-sm font-medium uppercase transition-colors ${
                        smsProvider === p ? "border-primary bg-primary/5 text-primary" : "border-muted text-muted-foreground"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
                {smsProvider === "msg91" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">API Key (authkey)</Label>
                      <Input value={smsApiKey} onChange={(e) => setSmsApiKey(e.target.value)} type="password" placeholder="Enter MSG91 authkey" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Sender ID</Label>
                        <Input value={smsSenderId} onChange={(e) => setSmsSenderId(e.target.value)} placeholder="DINEDL" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Flow ID</Label>
                        <Input value={smsFlowId} onChange={(e) => setSmsFlowId(e.target.value)} placeholder="Flow template ID" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Account SID</Label>
                      <Input value={smsAccountSid} onChange={(e) => setSmsAccountSid(e.target.value)} placeholder="ACxxxxxxx" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Auth Token</Label>
                        <Input value={smsAuthToken} onChange={(e) => setSmsAuthToken(e.target.value)} type="password" placeholder="Token" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">From Number</Label>
                        <Input value={smsFromNumber} onChange={(e) => setSmsFromNumber(e.target.value)} placeholder="+1234567890" />
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* WhatsApp Config */}
          {(channel === "whatsapp" || channel === "both") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> WhatsApp Provider
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">API Access Token</Label>
                  <Input value={waApiKey} onChange={(e) => setWaApiKey(e.target.value)} type="password" placeholder="Meta WhatsApp Business API token" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone Number ID</Label>
                  <Input value={waPhoneId} onChange={(e) => setWaPhoneId(e.target.value)} placeholder="e.g. 123456789012345" />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Test OTP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Test OTP</CardTitle>
              <CardDescription>Send a test OTP to verify your configuration</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  type="tel"
                />
                <Button onClick={handleTestOtp} disabled={!testPhone} variant="outline">
                  Send Test
                </Button>
              </div>
              {testResult && (
                <p className="text-sm">{testResult}</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* Save */}
      <Button onClick={handleSave} disabled={saving} className="w-full">
        {saving ? "Saving..." : "Save OTP Settings"}
      </Button>
    </div>
  );
}
