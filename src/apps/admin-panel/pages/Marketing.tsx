import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MessageCircle, CheckCircle, XCircle, Clock, TrendingUp, Users } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  sent: "default",
  delivered: "default",
  queued: "secondary",
  failed: "destructive",
};

const TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  reengagement: "Re-engagement",
  custom: "Custom",
};

export default function Marketing() {
  const { restaurant } = useRestaurantContext();

  const campaignsQuery = useQuery({
    queryKey: ["marketing", "campaigns", restaurant?.id],
    enabled: !!restaurant?.id,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("whatsapp_campaigns")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return []; // table may not exist yet (migration pending)
      return data ?? [];
    },
  });

  const campaigns = campaignsQuery.data ?? [];
  const stats = {
    total: campaigns.length,
    sent: campaigns.filter(c => c.status === "sent" || c.status === "delivered").length,
    failed: campaigns.filter(c => c.status === "failed").length,
    reengagements: campaigns.filter(c => c.type === "reengagement").length,
    uniquePhones: new Set(campaigns.map(c => c.phone)).size,
  };

  return (
    <div className="flex flex-col gap-4 w-full">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-green-500" /> WhatsApp Marketing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Automated receipts and re-engagement campaigns sent to your customers
          </p>
        </div>
        <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 self-start sm:self-auto">
          WhatsApp CRM Active
        </Badge>
      </section>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Messages", value: stats.total, icon: MessageCircle, color: "text-blue-500" },
          { label: "Successfully Sent", value: stats.sent, icon: CheckCircle, color: "text-green-500" },
          { label: "Re-engagements", value: stats.reengagements, icon: TrendingUp, color: "text-purple-500" },
          { label: "Unique Contacts", value: stats.uniquePhones, icon: Users, color: "text-orange-500" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <stat.icon className={`h-8 w-8 ${stat.color}`} />
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Setup notice if no campaigns */}
      {!campaignsQuery.isLoading && campaigns.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="p-8 text-center">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No campaigns sent yet</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              WhatsApp messages will appear here once customers place orders with their phone number.
              Ask your super-admin to configure the <code className="bg-muted px-1 rounded">WHATSAPP_TOKEN</code> for live sending.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Campaign log */}
      {campaigns.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Campaign Log</CardTitle>
            <CardDescription>All WhatsApp messages sent from your restaurant</CardDescription>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <div className="min-w-[640px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phone</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Coupon</TableHead>
                    <TableHead>Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-sm">{c.phone}</TableCell>
                      <TableCell>{c.customer_name ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{TYPE_LABELS[c.type] ?? c.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[c.status] as any ?? "outline"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {c.coupon_code
                          ? <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{c.coupon_code}</code>
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {c.sent_at
                          ? formatDistanceToNow(new Date(c.sent_at), { addSuffix: true })
                          : c.status === "failed"
                          ? <span className="text-destructive flex items-center gap-1"><XCircle className="h-3 w-3" /> Failed</span>
                          : <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Queued</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Setup guide */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Setup Guide</CardTitle>
          <CardDescription>Connect your WhatsApp Business account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {[
            { step: 1, label: "Create a Meta Business Account at business.facebook.com" },
            { step: 2, label: "Add a WhatsApp Business phone number in Meta Developer Console" },
            { step: 3, label: "Set WHATSAPP_TOKEN and WHATSAPP_PHONE_NUMBER_ID on your Supabase edge function secrets" },
            { step: 4, label: "Create message templates: order_receipt and reengagement_coupon in Meta" },
            { step: 5, label: "Enable 'WhatsApp CRM' in Super Admin → Feature Flags" },
          ].map(s => (
            <div key={s.step} className="flex items-start gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center font-bold">{s.step}</span>
              <p className="text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
