import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Trash2, Save, Move, Grid3X3, Users, Circle, Square, RectangleHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

// --- Types ---
type RestaurantTable = {
  id: string;
  restaurant_id: string;
  label: string;
  capacity: number;
  is_active: boolean;
  x_pos: number;
  y_pos: number;
  shape: "square" | "round" | "rectangle";
  floor: string;
  width: number;
  height: number;
};

type Reservation = {
  id: string;
  table_id: string | null;
  customer_name: string;
  party_size: number;
  status: string;
  reservation_time: string;
};

// --- Table Status Colors ---
const TABLE_STATUS = {
  available: { color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "#16a34a", label: "Available" },
  reserved: { color: "#f59e0b", bg: "rgba(245,158,11,0.15)", border: "#d97706", label: "Reserved" },
  seated: { color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "#2563eb", label: "Seated" },
  inactive: { color: "#6b7280", bg: "rgba(107,114,128,0.1)", border: "#9ca3af", label: "Inactive" },
} as const;

// --- Floor Options ---
const FLOOR_OPTIONS = ["main", "patio", "rooftop", "terrace", "private", "bar"];

// --- Grid snap helper ---
const GRID_SIZE = 10; // percentage
function snapToGrid(val: number) {
  return Math.round(val / GRID_SIZE) * GRID_SIZE;
}

// --- Component ---
export default function FloorPlanEditor({ restaurantId, todayReservations }: {
  restaurantId: string;
  todayReservations: Reservation[];
}) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [selectedFloor, setSelectedFloor] = useState("main");
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Form state for table dialog
  const [formLabel, setFormLabel] = useState("");
  const [formCapacity, setFormCapacity] = useState(4);
  const [formShape, setFormShape] = useState<"square" | "round" | "rectangle">("square");
  const [formFloor, setFormFloor] = useState("main");
  const [formActive, setFormActive] = useState(true);

  // --- Fetch tables ---
  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["admin", "floor-plan", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurant_tables")
        .select("id, label, capacity, is_active, restaurant_id, created_at")
        .eq("restaurant_id", restaurantId)
        .order("label");
      if (error) throw error;
      return (data ?? []) as RestaurantTable[];
    },
  });

  // --- Table status based on today's reservations ---
  const tableStatusMap = useMemo(() => {
    const map: Record<string, { status: keyof typeof TABLE_STATUS; reservation?: Reservation }> = {};
    tables.forEach(t => {
      if (!t.is_active) {
        map[t.id] = { status: "inactive" };
        return;
      }
      const res = todayReservations.find(r => r.table_id === t.id);
      if (res) {
        map[t.id] = {
          status: res.status === "seated" ? "seated" : "reserved",
          reservation: res,
        };
      } else {
        map[t.id] = { status: "available" };
      }
    });
    return map;
  }, [tables, todayReservations]);

  // --- Floors used ---
  const floorsUsed = useMemo(() => {
    const set = new Set(tables.map(t => t.floor || "main"));
    set.add("main");
    return Array.from(set).sort();
  }, [tables]);

  const floorTables = useMemo(() => tables.filter(t => (t.floor || "main") === selectedFloor), [tables, selectedFloor]);

  // --- Save table mutation ---
  const saveMutation = useMutation({
    mutationFn: async (table: Partial<RestaurantTable> & { id?: string }) => {
      if (table.id) {
        const { error } = await supabase.from("restaurant_tables").update({
          label: table.label,
          capacity: table.capacity,
          shape: table.shape,
          floor: table.floor,
          is_active: table.is_active,
          x_pos: table.x_pos,
          y_pos: table.y_pos,
          width: table.width,
          height: table.height,
        } as any).eq("id", table.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurant_tables").insert({
          restaurant_id: restaurantId,
          label: table.label,
          capacity: table.capacity,
          shape: table.shape || "square",
          floor: table.floor || "main",
          is_active: table.is_active ?? true,
          x_pos: table.x_pos ?? 50,
          y_pos: table.y_pos ?? 50,
          width: table.width ?? 80,
          height: table.height ?? 80,
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "floor-plan"] });
      toast({ title: "Saved", description: "Table updated." });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // --- Position update mutation (for drag) ---
  const updatePosMutation = useMutation({
    mutationFn: async ({ id, x_pos, y_pos }: { id: string; x_pos: number; y_pos: number }) => {
      const { error } = await supabase.from("restaurant_tables").update({ x_pos, y_pos } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "floor-plan"] }),
  });

  // --- Delete mutation ---
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("restaurant_tables").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "floor-plan"] });
      toast({ title: "Deleted" });
      setDialogOpen(false);
    },
  });

  // --- Drag handlers ---
  const handleMouseDown = useCallback((tableId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(tableId);
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const snappedX = Math.max(5, Math.min(95, snapToGrid(xPct)));
    const snappedY = Math.max(5, Math.min(95, snapToGrid(yPct)));

    // Optimistic update — move the table visually
    const el = document.getElementById(`table-${dragging}`);
    if (el) {
      el.style.left = `${snappedX}%`;
      el.style.top = `${snappedY}%`;
    }
  }, [dragging]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    const snappedX = Math.max(5, Math.min(95, snapToGrid(xPct)));
    const snappedY = Math.max(5, Math.min(95, snapToGrid(yPct)));
    updatePosMutation.mutate({ id: dragging, x_pos: snappedX, y_pos: snappedY });
    setDragging(null);
  }, [dragging, updatePosMutation]);

  // --- Open dialog for new or edit ---
  const openAddDialog = () => {
    setEditingTable(null);
    setFormLabel(`Table ${tables.length + 1}`);
    setFormCapacity(4);
    setFormShape("square");
    setFormFloor(selectedFloor);
    setFormActive(true);
    setDialogOpen(true);
  };

  const openEditDialog = (table: RestaurantTable) => {
    setEditingTable(table);
    setFormLabel(table.label);
    setFormCapacity(table.capacity);
    setFormShape(table.shape || "square");
    setFormFloor(table.floor || "main");
    setFormActive(table.is_active);
    setDialogOpen(true);
  };

  const handleSaveDialog = () => {
    saveMutation.mutate({
      id: editingTable?.id,
      label: formLabel,
      capacity: formCapacity,
      shape: formShape,
      floor: formFloor,
      is_active: formActive,
      x_pos: editingTable?.x_pos ?? 50,
      y_pos: editingTable?.y_pos ?? 50,
      width: formShape === "rectangle" ? 120 : 80,
      height: 80,
    });
    setDialogOpen(false);
  };

  // --- Shape icon helper ---
  const ShapeIcon = ({ shape }: { shape: string }) => {
    if (shape === "round") return <Circle className="h-3.5 w-3.5" />;
    if (shape === "rectangle") return <RectangleHorizontal className="h-3.5 w-3.5" />;
    return <Square className="h-3.5 w-3.5" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Floor Plan</h3>
          {/* Floor tabs */}
          <div className="flex gap-1 ml-2">
            {floorsUsed.map(f => (
              <Button
                key={f}
                variant={selectedFloor === f ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => setSelectedFloor(f)}
              >
                {f}
              </Button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={openAddDialog}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Table
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {Object.entries(TABLE_STATUS).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm border" style={{ backgroundColor: val.bg, borderColor: val.border }} />
            <span className="text-muted-foreground">{val.label}</span>
          </div>
        ))}
      </div>

      {/* Canvas */}
      <div
        ref={canvasRef}
        className="relative w-full border-2 border-dashed border-muted-foreground/20 rounded-xl bg-muted/30 overflow-hidden select-none"
        style={{ aspectRatio: "16/10", minHeight: 300 }}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => setDragging(null)}
      >
        {/* Grid lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.08]">
          {Array.from({ length: 9 }, (_, i) => {
            const pct = (i + 1) * 10;
            return (
              <g key={i}>
                <line x1={`${pct}%`} y1="0" x2={`${pct}%`} y2="100%" stroke="currentColor" strokeWidth="1" />
                <line x1="0" y1={`${pct}%`} x2="100%" y2={`${pct}%`} stroke="currentColor" strokeWidth="1" />
              </g>
            );
          })}
        </svg>

        {floorTables.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
            <Grid3X3 className="h-10 w-10 mb-2 opacity-30" />
            <p className="text-sm">No tables on this floor</p>
            <Button variant="ghost" size="sm" className="mt-2" onClick={openAddDialog}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add your first table
            </Button>
          </div>
        )}

        {/* Render tables */}
        {floorTables.map(table => {
          const info = tableStatusMap[table.id] || { status: "available" as const };
          const statusStyle = TABLE_STATUS[info.status];
          const isRound = table.shape === "round";
          const isRect = table.shape === "rectangle";
          const w = isRect ? 100 : 70;
          const h = 70;

          return (
            <div
              key={table.id}
              id={`table-${table.id}`}
              className={cn(
                "absolute flex flex-col items-center justify-center text-center cursor-grab active:cursor-grabbing transition-shadow",
                dragging === table.id && "z-50 shadow-xl scale-105",
                selectedTable?.id === table.id && "ring-2 ring-primary ring-offset-2"
              )}
              style={{
                left: `${table.x_pos ?? 50}%`,
                top: `${table.y_pos ?? 50}%`,
                width: w,
                height: h,
                transform: "translate(-50%, -50%)",
                backgroundColor: statusStyle.bg,
                border: `2px solid ${statusStyle.border}`,
                borderRadius: isRound ? "50%" : "8px",
                color: statusStyle.color,
              }}
              onMouseDown={(e) => handleMouseDown(table.id, e)}
              onClick={(e) => {
                if (!dragging) {
                  e.stopPropagation();
                  setSelectedTable(table);
                }
              }}
              onDoubleClick={() => openEditDialog(table)}
            >
              <span className="text-[11px] font-bold leading-tight truncate max-w-full px-1">{table.label}</span>
              <span className="text-[9px] flex items-center gap-0.5 mt-0.5 opacity-80">
                <Users className="h-2.5 w-2.5" />{table.capacity}
              </span>
              {info.reservation && (
                <span className="text-[8px] mt-0.5 opacity-70 truncate max-w-full px-1">
                  {info.reservation.customer_name}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Selected table info */}
      {selectedTable && (
        <Card className="shadow-sm">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <ShapeIcon shape={selectedTable.shape} />
                {selectedTable.label}
                <Badge variant="outline" className="text-[10px]">
                  {tableStatusMap[selectedTable.id]?.status || "available"}
                </Badge>
              </span>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEditDialog(selectedTable)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelectedTable(null)}>
                  ✕
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-3 text-sm text-muted-foreground">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span className="text-xs font-medium text-foreground">Capacity</span>
                <p>{selectedTable.capacity} seats</p>
              </div>
              <div>
                <span className="text-xs font-medium text-foreground">Shape</span>
                <p className="capitalize">{selectedTable.shape}</p>
              </div>
              <div>
                <span className="text-xs font-medium text-foreground">Status</span>
                <p className="capitalize">{selectedTable.is_active ? "Active" : "Inactive"}</p>
              </div>
            </div>
            {tableStatusMap[selectedTable.id]?.reservation && (
              <div className="mt-2 pt-2 border-t">
                <span className="text-xs font-medium text-foreground">Current Reservation</span>
                <p>{tableStatusMap[selectedTable.id]?.reservation?.customer_name} — {tableStatusMap[selectedTable.id]?.reservation?.party_size} guests at {tableStatusMap[selectedTable.id]?.reservation?.reservation_time?.slice(0, 5)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTable ? "Edit Table" : "Add Table"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder="e.g. Table 1, Patio A" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Capacity</Label>
                <Input type="number" min={1} max={20} value={formCapacity} onChange={e => setFormCapacity(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>Shape</Label>
                <Select value={formShape} onValueChange={(v: any) => setFormShape(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="square"><span className="flex items-center gap-2"><Square className="h-3 w-3" /> Square</span></SelectItem>
                    <SelectItem value="round"><span className="flex items-center gap-2"><Circle className="h-3 w-3" /> Round</span></SelectItem>
                    <SelectItem value="rectangle"><span className="flex items-center gap-2"><RectangleHorizontal className="h-3 w-3" /> Rectangle</span></SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Floor / Zone</Label>
              <Select value={formFloor} onValueChange={setFormFloor}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FLOOR_OPTIONS.map(f => (
                    <SelectItem key={f} value={f}><span className="capitalize">{f}</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <Label>Active</Label>
              <Switch checked={formActive} onCheckedChange={setFormActive} />
            </div>
          </div>
          <DialogFooter className="gap-2">
            {editingTable && (
              <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(editingTable.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            )}
            <Button onClick={handleSaveDialog} disabled={!formLabel.trim()}>
              <Save className="h-3.5 w-3.5 mr-1" /> {editingTable ? "Update" : "Add Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
