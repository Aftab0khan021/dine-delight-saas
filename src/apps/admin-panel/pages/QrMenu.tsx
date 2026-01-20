import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { CopyButton } from "../components/qr/CopyButton";
import { buildDestinationPath, buildTableLabel, type QrType } from "../components/qr/qr-utils";

type QrRow = {
  id: string;
  table_label: string | null;
  destination_path: string;
  is_active: boolean;
  created_at: string;
};

const rangeSchema = z
  .object({
    from: z.number().int().min(1).max(9999),
    to: z.number().int().min(1).max(9999),
    prefix: z.string().trim().max(20).optional(),
  })
  .refine((v) => v.to >= v.from, { message: "To must be >= From", path: ["to"] });

export default function AdminQrMenu() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();

  const [qrType, setQrType] = useState<QrType>("general");
  const [fromTable, setFromTable] = useState<number>(1);
  const [toTable, setToTable] = useState<number>(10);
  const [prefix, setPrefix] = useState<string>("T-");

  const qrCodesQuery = useQuery({
    queryKey: ["admin", "qr", restaurant?.id, "list"],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qr_codes")
        .select("id, table_label, destination_path, is_active, created_at")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as QrRow[];
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("qr_codes")
        .update({ is_active })
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "qr", restaurant?.id, "list"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!restaurant?.id) throw new Error("Missing restaurant");
      const { error } = await supabase
        .from("qr_codes")
        .delete()
        .eq("id", id)
        .eq("restaurant_id", restaurant.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "qr", restaurant?.id, "list"] }),
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id) throw new Error("Missing restaurant");

      const {
        data: { session },
      } = await supabase.auth.getSession();

      const createdBy = session?.user?.id ?? null;

      if (qrType === "general") {
        const destination_path = buildDestinationPath("general");
        const code = crypto.randomUUID();

        // De-dupe by destination + null label to avoid spamming duplicates
        const { data: existing, error: existsErr } = await supabase
          .from("qr_codes")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .is("table_label", null)
          .eq("destination_path", destination_path)
          .limit(1)
          .maybeSingle();
        if (existsErr) throw existsErr;
        if (existing?.id) return { inserted: 0 };

        const { error } = await supabase.from("qr_codes").insert({
          restaurant_id: restaurant.id,
          code,
          destination_path,
          table_label: null,
          created_by: createdBy,
          is_active: true,
        });
        if (error) throw error;
        return { inserted: 1 };
      }

      const parsed = rangeSchema.safeParse({ from: fromTable, to: toTable, prefix });
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message ?? "Invalid range";
        throw new Error(msg);
      }

      const labels = Array.from({ length: parsed.data.to - parsed.data.from + 1 }, (_, idx) =>
        buildTableLabel(parsed.data.prefix, parsed.data.from + idx),
      );

      const { data: existing, error: existErr } = await supabase
        .from("qr_codes")
        .select("table_label")
        .eq("restaurant_id", restaurant.id)
        .in("table_label", labels);
      if (existErr) throw existErr;

      const existingSet = new Set((existing ?? []).map((r) => r.table_label).filter(Boolean) as string[]);

      const rows = labels
        .filter((l) => !existingSet.has(l))
        .map((label) => ({
          restaurant_id: restaurant.id,
          code: crypto.randomUUID(),
          destination_path: buildDestinationPath("table", label),
          table_label: label,
          created_by: createdBy,
          is_active: true,
        }));

      if (rows.length === 0) return { inserted: 0 };

      const { error } = await supabase.from("qr_codes").insert(rows);
      if (error) throw error;
      return { inserted: rows.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "qr", restaurant?.id, "list"] }),
  });

  const examplePath = useMemo(() => {
    if (qrType === "general") return buildDestinationPath("general");
    return buildDestinationPath("table", buildTableLabel(prefix, fromTable));
  }, [fromTable, prefix, qrType]);

  const exampleUrl = useMemo(() => {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const p = examplePath.startsWith("/") ? examplePath : `/${examplePath}`;
    return `${origin}${p}`;
  }, [examplePath]);

  const qrCodes = qrCodesQuery.data ?? [];

  return (
    <section className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">QR Menu</h1>
        <p className="text-sm text-muted-foreground">Generate and manage QR destinations for {restaurant?.name}.</p>
      </header>

      {/* QR TYPE SELECTOR + GENERATOR */}
      <Card>
        <CardHeader>
          <CardTitle>Generator</CardTitle>
          <CardDescription>Create general menu QR codes or table-wise codes.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={qrType} onValueChange={(v) => setQrType(v as QrType)}>
            <TabsList>
              <TabsTrigger value="general">General Menu</TabsTrigger>
              <TabsTrigger value="table">Table-wise Menu</TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-3">
              <p className="text-sm text-muted-foreground">Creates a QR destination that points to the public menu.</p>
            </TabsContent>

            <TabsContent value="table" className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="from">From table #</Label>
                  <Input
                    id="from"
                    inputMode="numeric"
                    value={fromTable}
                    onChange={(e) => setFromTable(Number(e.target.value || 0))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to">To table #</Label>
                  <Input
                    id="to"
                    inputMode="numeric"
                    value={toTable}
                    onChange={(e) => setToTable(Number(e.target.value || 0))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="prefix">Prefix (optional)</Label>
                  <Input id="prefix" value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="T-" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Example table label: {buildTableLabel(prefix, fromTable)}</p>
            </TabsContent>
          </Tabs>

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
              {generateMutation.isPending ? "Generating…" : "Generate QR codes"}
            </Button>
            {generateMutation.isSuccess ? (
              <Badge variant="secondary">Generated</Badge>
            ) : generateMutation.isError ? (
              <Badge variant="destructive">{(generateMutation.error as any)?.message ?? "Error"}</Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* TEST SECTION */}
      <Card>
        <CardHeader>
          <CardTitle>Test</CardTitle>
          <CardDescription>Use this to verify the destination path your QR points to.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <Input readOnly value={exampleUrl} />
            <CopyButton value={exampleUrl} />
          </div>
          <p className="text-xs text-muted-foreground">Destination path: {examplePath}</p>
        </CardContent>
      </Card>

      {/* QR LIST / PREVIEW */}
      <Card>
        <CardHeader>
          <CardTitle>QR Codes</CardTitle>
          <CardDescription>Saved destinations for this restaurant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {qrCodesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading QR codes…</p>
          ) : qrCodes.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">No QR codes generated yet</p>
              <p className="text-sm text-muted-foreground">Use the generator above to create your first QR destination.</p>
            </div>
          ) : (
            <>
              <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Table</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {qrCodes.map((qr) => (
                      <TableRow key={qr.id}>
                        <TableCell className="font-medium">{qr.table_label ?? "General"}</TableCell>
                        <TableCell className="text-muted-foreground">{qr.destination_path}</TableCell>
                        <TableCell>
                          <Switch
                            checked={qr.is_active}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: qr.id, is_active: v })}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="inline-flex items-center gap-2">
                            <CopyButton
                              value={`${window.location.origin}${qr.destination_path.startsWith("/") ? qr.destination_path : `/${qr.destination_path}`}`}
                              label="Copy URL"
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => deleteMutation.mutate(qr.id)}
                              disabled={deleteMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Mobile cards */}
              <div className="grid gap-3 md:hidden">
                {qrCodes.map((qr) => {
                  const url = `${window.location.origin}${qr.destination_path.startsWith("/") ? qr.destination_path : `/${qr.destination_path}`}`;
                  return (
                    <Card key={qr.id}>
                      <CardContent className="pt-6 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium">{qr.table_label ?? "General"}</p>
                            <p className="text-sm text-muted-foreground break-all">{qr.destination_path}</p>
                          </div>
                          <Switch
                            checked={qr.is_active}
                            onCheckedChange={(v) => toggleMutation.mutate({ id: qr.id, is_active: v })}
                          />
                        </div>

                        <Separator />

                        <div className="flex flex-wrap gap-2">
                          <CopyButton value={url} label="Copy URL" className="flex-1" />
                          <Button
                            variant="outline"
                            onClick={() => deleteMutation.mutate(qr.id)}
                            disabled={deleteMutation.isPending}
                            className="flex-1"
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
