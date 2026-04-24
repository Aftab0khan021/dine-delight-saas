import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Copy, Trash2, Key, Globe, Webhook, CheckCircle, XCircle, ExternalLink } from "lucide-react";
import { formatDistanceToNow, format } from "date-fns";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function generateApiKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
  return `dd_live_${hex}`;
}

async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export default function DeveloperAPI() {
  const { restaurant } = useRestaurantContext();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [webhookOpen, setWebhookOpen] = useState(false);
  const [webhookName, setWebhookName] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");

  const keysQuery = useQuery({
    queryKey: ["api-keys", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("api_keys")
        .select("id, name, key_prefix, scopes, last_used_at, is_active, created_at, expires_at")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  const webhooksQuery = useQuery({
    queryKey: ["webhook-endpoints", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("webhook_endpoints")
        .select("*, webhook_deliveries(id, status, created_at)")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    }
  });

  const deliveriesQuery = useQuery({
    queryKey: ["webhook-deliveries", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      // Get deliveries via endpoint_id (RLS on webhook_endpoints scopes to restaurant)
      const { data: eps } = await supabase
        .from("webhook_endpoints")
        .select("id")
        .eq("restaurant_id", restaurant!.id);
      const endpointIds = (eps ?? []).map((e: any) => e.id);
      if (endpointIds.length === 0) return [];
      const { data, error } = await supabase
        .from("webhook_deliveries")
        .select("*")
        .in("endpoint_id", endpointIds)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data ?? [];
    }
  });

  const createKeyMutation = useMutation({
    mutationFn: async () => {
      const rawKey = generateApiKey();
      const keyHash = await hashKey(rawKey);
      const { error } = await supabase.from("api_keys").insert({
        restaurant_id: restaurant!.id,
        name: newKeyName,
        key_prefix: rawKey.slice(0, 12),
        key_hash: keyHash,
        scopes: ["menu:read", "orders:write", "orders:read"],
      });
      if (error) throw error;
      return rawKey;
    },
    onSuccess: (rawKey) => {
      setGeneratedKey(rawKey);
      qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const revokeKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("api_keys").update({ is_active: false }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      toast({ title: "API key revoked" });
    },
  });

  const addWebhookMutation = useMutation({
    mutationFn: async () => {
      const secret = generateApiKey().replace("dd_live_", "whsec_");
      const secretHash = await hashKey(secret);
      const { error } = await supabase.from("webhook_endpoints").insert({
        restaurant_id: restaurant!.id,
        name: webhookName,
        url: webhookUrl,
        events: ["order.placed", "order.status_changed"],
        secret_hash: secretHash,
        secret_prefix: secret.slice(0, 12),
      });
      if (error) throw error;
      return secret;
    },
    onSuccess: () => {
      setWebhookOpen(false);
      setWebhookName(""); setWebhookUrl("");
      qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
      toast({ title: "Webhook endpoint added" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied!` });
  };

  const menuApiUrl = `${SUPABASE_URL}/functions/v1/api-menu`;
  const orderApiUrl = `${SUPABASE_URL}/functions/v1/api-order`;

  return (
    <div className="flex flex-col gap-6 w-full">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Key className="h-6 w-6 text-violet-500" /> Developer API
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Headless POS integration — manage API keys, webhooks, and view documentation
        </p>
      </section>

      {/* API Keys */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">API Keys</CardTitle>
            <CardDescription>Use these keys to authenticate API requests</CardDescription>
          </div>
          <Dialog open={newKeyOpen} onOpenChange={setNewKeyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" onClick={() => { setGeneratedKey(null); setNewKeyName(""); }}>
                <Plus className="h-4 w-4 mr-1" /> New Key
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create API Key</DialogTitle></DialogHeader>
              {!generatedKey ? (
                <>
                  <div className="space-y-2">
                    <Label>Key Name</Label>
                    <Input
                      placeholder="e.g., Mobile App, Kiosk Production"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>
                  <DialogFooter>
                    <Button onClick={() => createKeyMutation.mutate()} disabled={!newKeyName || createKeyMutation.isPending}>
                      Generate Key
                    </Button>
                  </DialogFooter>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
                    ⚠️ Copy this key now — it won't be shown again.
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-muted p-2 rounded text-xs break-all">{generatedKey}</code>
                    <Button size="sm" variant="outline" onClick={() => copyToClipboard(generatedKey, "API Key")}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button className="w-full" onClick={() => setNewKeyOpen(false)}>Done</Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[560px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keysQuery.data?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No API keys yet. Create your first key above.
                    </TableCell>
                  </TableRow>
                )}
                {keysQuery.data?.map((k: any) => (
                  <TableRow key={k.id}>
                    <TableCell className="font-medium">{k.name}</TableCell>
                    <TableCell><code className="bg-muted px-1.5 py-0.5 rounded text-xs">{k.key_prefix}…</code></TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {k.scopes?.map((s: string) => (
                          <Badge key={s} variant="outline" className="text-xs">{s}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {k.last_used_at ? formatDistanceToNow(new Date(k.last_used_at), { addSuffix: true }) : "Never"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={k.is_active ? "default" : "secondary"}>
                        {k.is_active ? "Active" : "Revoked"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {k.is_active && (
                        <Button size="sm" variant="ghost" className="text-destructive"
                          onClick={() => revokeKeyMutation.mutate(k.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Webhooks */}
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Webhook className="h-4 w-4" /> Webhook Endpoints</CardTitle>
            <CardDescription>Receive real-time order events via HTTP POST</CardDescription>
          </div>
          <Dialog open={webhookOpen} onOpenChange={setWebhookOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" /> Add Endpoint</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Webhook Endpoint</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input placeholder="e.g., Production Server" value={webhookName} onChange={e => setWebhookName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>HTTPS URL</Label>
                  <Input placeholder="https://yourserver.com/webhook" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
                </div>
                <p className="text-xs text-muted-foreground">Events: <code>order.placed</code>, <code>order.status_changed</code></p>
              </div>
              <DialogFooter>
                <Button onClick={() => addWebhookMutation.mutate()} disabled={!webhookName || !webhookUrl.startsWith("https://") || addWebhookMutation.isPending}>
                  Add Endpoint
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {webhooksQuery.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No webhook endpoints configured.</p>
          ) : (
            <div className="space-y-3">
              {webhooksQuery.data?.map((ep: any) => (
                <div key={ep.id} className="border rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{ep.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{ep.url}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {ep.webhook_deliveries?.slice(0, 3).map((d: any) => (
                      d.status === "success"
                        ? <CheckCircle key={d.id} className="h-4 w-4 text-green-500" />
                        : <XCircle key={d.id} className="h-4 w-4 text-destructive" />
                    ))}
                    <Badge variant={ep.is_active ? "default" : "secondary"}>
                      {ep.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delivery Log */}
      {(deliveriesQuery.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Deliveries</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[560px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>HTTP</TableHead>
                    <TableHead>Time</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveriesQuery.data?.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell><code className="text-xs">{d.event}</code></TableCell>
                      <TableCell>
                        <Badge variant={d.status === "success" ? "default" : d.status === "failed" ? "destructive" : "secondary"}>
                          {d.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{d.http_status ?? "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Quick Reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API Quick Reference</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {[
            { label: "Get Menu", method: "GET", url: menuApiUrl, note: "Returns full menu with categories, items, variants, addons" },
            { label: "Place Order", method: "POST", url: orderApiUrl, note: "Body: { items, table_label, customer_phone }" },
            { label: "Get Order Status", method: "GET", url: `${orderApiUrl}?id=ORDER_ID`, note: "Returns order with status and items" },
          ].map(api => (
            <div key={api.label} className="border rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono text-xs">{api.method}</Badge>
                <span className="font-medium">{api.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs bg-muted px-2 py-1 rounded flex-1 truncate">{api.url}</code>
                <Button size="sm" variant="ghost" onClick={() => copyToClipboard(api.url, "URL")}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{api.note}</p>
              <p className="text-xs text-muted-foreground">Header: <code>X-Api-Key: your_key</code></p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
