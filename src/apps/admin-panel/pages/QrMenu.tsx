import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Download, MoreHorizontal, Printer, QrCode, Trash2, Power, FileSpreadsheet } from "lucide-react";
import { z } from "zod";

import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { buildTableLabel, type QrType } from "../components/qr/qr-utils";

// UI Components
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export default function AdminQrMenu() {
  const { restaurant } = useRestaurantContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  // --- State ---
  const [qrType, setQrType] = useState<QrType>("table");
  const [fromTable, setFromTable] = useState(1);
  const [toTable, setToTable] = useState(10);
  const [prefix, setPrefix] = useState("T-");
  const [layout, setLayout] = useState("cards");

  // --- Queries ---
  const qrCodesQuery = useQuery({
    queryKey: ["admin", "qr", restaurant?.id],
    enabled: !!restaurant?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("qr_codes")
        .select("*")
        .eq("restaurant_id", restaurant!.id)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  const qrCodes = qrCodesQuery.data ?? [];

  // --- Mutations ---
  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!restaurant?.id) return;
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (qrType === "general") {
        const { error } = await supabase.from("qr_codes").insert({
          restaurant_id: restaurant.id,
          code: crypto.randomUUID(),
          destination_path: "/menu",
          created_by: userId,
          is_active: true,
        });
        if (error) throw error;
      } else {
        const rows = Array.from({ length: toTable - fromTable + 1 }, (_, i) => {
          const label = buildTableLabel(prefix, fromTable + i);
          return {
            restaurant_id: restaurant.id,
            code: crypto.randomUUID(),
            destination_path: `/menu?table=${label}`,
            table_label: label,
            created_by: userId,
            is_active: true,
          };
        });
        const { error } = await supabase.from("qr_codes").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Generated", description: "New QR codes added to the list." });
      qc.invalidateQueries({ queryKey: ["admin", "qr"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("qr_codes").delete().eq("id", id).eq("restaurant_id", restaurant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "qr"] });
      toast({ title: "Deleted", description: "QR code removed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, state }: { id: string; state: boolean }) => {
      const { error } = await supabase.from("qr_codes").update({ is_active: state }).eq("id", id).eq("restaurant_id", restaurant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "qr"] });
      toast({ title: "Updated", description: "QR code status changed." });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  // --- FIXED: Action Handlers ---

  const handlePrint = () => {
    // Triggers the browser's native print dialog
    window.print();
  };

  const handleDownloadCsv = () => {
    if (qrCodes.length === 0) {
      toast({ title: "No data", description: "Generate some QR codes first.", variant: "destructive" });
      return;
    }

    // Generate CSV content
    const headers = ["Table Label", "Relative Path", "Full URL", "Status"];
    const rows = qrCodes.map((qr: any) => [
      qr.table_label || "General Menu",
      qr.destination_path,
      `${window.location.origin}${qr.destination_path}`,
      qr.is_active ? "Active" : "Disabled"
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row: any[]) => row.join(","))
    ].join("\n");

    // Trigger Download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `qr_codes_${restaurant?.name || "export"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const copyUrl = async (path: string) => {
    const fullUrl = `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast({ title: "Copied", description: "URL copied to clipboard." });
    } catch {
      toast({ title: "Failed", description: "Could not copy.", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6 print:space-y-0">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">QR Menu Generator</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate, print, and manage your QR codes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* FIXED: Connected handlers */}
          <Button variant="outline" onClick={handleDownloadCsv}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Download CSV
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" /> Print Cards
          </Button>
        </div>
      </header>

      <section className="grid gap-3 lg:grid-cols-3 print:block">
        {/* LEFT COLUMN: Generator (Hidden on Print) */}
        <Card className="shadow-sm lg:col-span-1 h-fit print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Generator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>QR type</Label>
              <Select value={qrType} onValueChange={(v) => setQrType(v as QrType)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="general">General Menu</SelectItem>
                  <SelectItem value="table">Table-wise Menu</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className={cn("space-y-3", qrType !== "table" && "opacity-50 pointer-events-none")}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>From table</Label>
                  <Input
                    type="number"
                    value={fromTable}
                    onChange={(e) => setFromTable(Number(e.target.value))}
                    disabled={qrType !== "table"}
                  />
                </div>
                <div className="space-y-2">
                  <Label>To table</Label>
                  <Input
                    type="number"
                    value={toTable}
                    onChange={(e) => setToTable(Number(e.target.value))}
                    disabled={qrType !== "table"}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Optional prefix</Label>
                <Input
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  disabled={qrType !== "table"}
                  placeholder="T-"
                />
                <div className="text-xs text-muted-foreground">
                  Example: <span className="font-medium">T-</span> → T-1, T-2
                </div>
              </div>
            </div>

            <Separator />

            {/* Visual Layout Toggle */}
            <div className="space-y-2">
              <Label>Print layout</Label>
              <Select value={layout} onValueChange={setLayout}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cards">Cards</SelectItem>
                  <SelectItem value="stickers">Stickers (Compact)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" /> Print
              </Button>
              <Button
                className="flex-1"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
              >
                {generateMutation.isPending ? "Generating..." : "Generate"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* RIGHT COLUMN: Existing Codes (Visual Grid) */}
        <Card className="shadow-sm lg:col-span-2 print:shadow-none print:border-none">
          <CardHeader className="print:hidden">
            <CardTitle className="flex items-center justify-between text-base">
              <span>QR Codes</span>
              <Badge variant="secondary">
                {qrCodes.length} code{qrCodes.length === 1 ? "" : "s"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {qrCodes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground border-dashed border rounded-xl print:hidden">
                <QrCode className="h-10 w-10 mb-3 opacity-20" />
                <p>No codes generated yet.</p>
                <p className="text-xs">Use the generator to create your first batch.</p>
              </div>
            ) : (
              <div className={cn(
                "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[600px] overflow-y-auto pr-2",
                "print:max-h-none print:overflow-visible print:grid-cols-3 print:gap-4",
                layout === "stickers" && "sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-4"
              )}>
                {qrCodes.map((qr: any) => (
                  <div
                    key={qr.id}
                    className={cn(
                      "relative group rounded-xl border border-border bg-background p-4 shadow-sm transition-all hover:shadow-md",
                      "print:border-2 print:shadow-none print:break-inside-avoid",
                      layout === "stickers" && "p-3"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{qr.table_label || "General"}</div>
                        <div className="mt-1 truncate text-[10px] text-muted-foreground font-mono print:text-black">
                          {qr.destination_path}
                        </div>
                      </div>

                      {/* 3-Dot Menu (Hidden on Print) */}
                      <div className="print:hidden">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6 -mr-2">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => copyUrl(qr.destination_path)}>
                              <Copy className="mr-2 h-4 w-4" /> Copy URL
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => toggleMutation.mutate({ id: qr.id, state: !qr.is_active })}>
                              <Power className="mr-2 h-4 w-4" /> {qr.is_active ? "Disable" : "Enable"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => deleteMutation.mutate(qr.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>

                    <div className={cn("mt-4 grid place-items-center", layout === "stickers" && "mt-2")}>
                      <div className={cn(
                        "grid place-items-center rounded-2xl bg-accent text-accent-foreground print:bg-white print:text-black",
                        layout === "cards" ? "h-28 w-28" : "h-16 w-16 rounded-lg"
                      )}>
                        {/* Icon acts as placeholder for real QR */}
                        <QrCode className={cn("h-10 w-10", layout === "stickers" && "h-8 w-8")} />
                      </div>

                      {!qr.is_active && (
                        <Badge variant="destructive" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 print:hidden">
                          Disabled
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* BOTTOM: Test Card (Hidden on Print) */}
        <Card className="shadow-sm lg:col-span-3 print:hidden">
          <CardHeader>
            <CardTitle className="text-base">Test on your phone</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-border bg-background p-3">
              <div className="text-sm font-medium">Test URL</div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  readOnly
                  value={`${window.location.origin}/menu${qrType === 'table' ? `?table=${prefix}1` : ''}`}
                  className="bg-muted/50 font-mono text-xs"
                />
                <Button variant="secondary" className="sm:w-auto" onClick={() => copyUrl(`/menu${qrType === 'table' ? `?table=${prefix}1` : ''}`)}>
                  <Copy className="mr-2 h-4 w-4" /> Copy
                </Button>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Tip: Copy this link and open it on your phone to simulate a customer scan.
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}