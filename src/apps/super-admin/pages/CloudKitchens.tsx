import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ChefHat, Link2, Plus, Building2, Layers } from "lucide-react";

export default function CloudKitchens() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [linkOpen, setLinkOpen] = useState(false);
  const [selectedParent, setSelectedParent] = useState<string>("");
  const [selectedChild, setSelectedChild] = useState<string>("");

  // All restaurants
  const restQuery = useQuery({
    queryKey: ["superadmin", "all-restaurants-ck"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, name, slug, is_cloud_kitchen, parent_kitchen_id, brand_color")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const restaurants = restQuery.data ?? [];
  const cloudKitchens = restaurants.filter((r: any) => r.is_cloud_kitchen);
  const standalone = restaurants.filter((r: any) => !r.parent_kitchen_id && !r.is_cloud_kitchen);
  const childBrands = restaurants.filter((r: any) => !!r.parent_kitchen_id);

  // Mark as cloud kitchen
  const markCloudMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("restaurants")
        .update({ is_cloud_kitchen: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadmin", "all-restaurants-ck"] });
      toast({ title: "Restaurant marked as Cloud Kitchen" });
    },
  });

  // Link child to parent
  const linkMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("restaurants")
        .update({ parent_kitchen_id: selectedParent })
        .eq("id", selectedChild);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadmin", "all-restaurants-ck"] });
      qc.invalidateQueries({ queryKey: ["superadmin", "all-restaurants"] });
      setLinkOpen(false);
      setSelectedParent("");
      setSelectedChild("");
      toast({ title: "Brand linked to Cloud Kitchen" });
    },
    onError: (err: Error) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  // Unlink brand from parent
  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("restaurants")
        .update({ parent_kitchen_id: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["superadmin", "all-restaurants-ck"] });
      toast({ title: "Brand unlinked" });
    },
  });

  return (
    <section className="flex flex-col gap-6 w-full">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Layers className="h-6 w-6 text-orange-500" /> Cloud Kitchens
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage parent kitchen and child brand relationships
          </p>
        </div>
        <Button onClick={() => setLinkOpen(true)}>
          <Link2 className="h-4 w-4 mr-2" /> Link Brand to Kitchen
        </Button>
      </header>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Cloud Kitchens</p>
          <p className="text-2xl font-bold">{cloudKitchens.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Child Brands</p>
          <p className="text-2xl font-bold">{childBrands.length}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Standalone</p>
          <p className="text-2xl font-bold">{standalone.length}</p>
        </CardContent></Card>
      </div>

      {/* Cloud Kitchen hierarchy */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kitchen Hierarchy</CardTitle>
          <CardDescription>Parent kitchens and their child brands</CardDescription>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <div className="min-w-[480px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Restaurant / Brand</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Color</TableHead>
                  <TableHead className="w-[120px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {restQuery.isLoading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8">Loading...</TableCell></TableRow>
                )}
                {restaurants.map((r: any) => {
                  const isParent = r.is_cloud_kitchen;
                  const isChild = !!r.parent_kitchen_id;
                  const parentName = isChild
                    ? restaurants.find((p: any) => p.id === r.parent_kitchen_id)?.name
                    : null;
                  return (
                    <TableRow key={r.id} className={isChild ? "pl-6" : ""}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isChild && <span className="ml-4 text-muted-foreground">└</span>}
                          <span className="font-medium">{r.name}</span>
                          {isParent && <Badge className="text-xs bg-orange-100 text-orange-700 border-orange-200">Kitchen</Badge>}
                          {isChild && <span className="text-xs text-muted-foreground">↳ {parentName}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {isParent ? <Badge variant="default">Cloud Kitchen</Badge>
                          : isChild ? <Badge variant="secondary">Child Brand</Badge>
                          : <Badge variant="outline">Standalone</Badge>}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{r.slug}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 rounded-full border" style={{ backgroundColor: r.brand_color || "#6366f1" }} />
                          <span className="text-xs text-muted-foreground">{r.brand_color || "#6366f1"}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!isParent && !isChild && (
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => markCloudMutation.mutate(r.id)}>
                              <ChefHat className="h-3 w-3 mr-1" /> Make Kitchen
                            </Button>
                          )}
                          {isChild && (
                            <Button size="sm" variant="ghost" className="text-destructive text-xs h-7"
                              onClick={() => unlinkMutation.mutate(r.id)}>
                              Unlink
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {!restQuery.isLoading && restaurants.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No restaurants found</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Link Dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link Brand to Cloud Kitchen</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Parent Cloud Kitchen</label>
              <Select value={selectedParent} onValueChange={setSelectedParent}>
                <SelectTrigger><SelectValue placeholder="Select parent kitchen" /></SelectTrigger>
                <SelectContent>
                  {restaurants.filter((r: any) => r.is_cloud_kitchen).map((r: any) => (
                    <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {cloudKitchens.length === 0 && (
                <p className="text-xs text-muted-foreground">No cloud kitchens yet. Mark a restaurant as a kitchen first.</p>
              )}
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Child Brand</label>
              <Select value={selectedChild} onValueChange={setSelectedChild}>
                <SelectTrigger><SelectValue placeholder="Select brand to link" /></SelectTrigger>
                <SelectContent>
                  {restaurants
                    .filter((r: any) => !r.is_cloud_kitchen && !r.parent_kitchen_id && r.id !== selectedParent)
                    .map((r: any) => (
                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => linkMutation.mutate()}
              disabled={!selectedParent || !selectedChild || linkMutation.isPending}>
              Link Brand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
