import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Loader2, CheckSquare, Square } from "lucide-react";
import type { StaffCategory, Permission } from "./staff-utils";

type CategoryDialogProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    category: StaffCategory | null;
    permissions: Permission[];
    restaurantId: string;
};

export function CategoryDialog({
    open,
    onOpenChange,
    category,
    permissions,
    restaurantId,
}: CategoryDialogProps) {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [color, setColor] = useState("#6366f1");
    const [selectedPermissions, setSelectedPermissions] = useState<Set<string>>(new Set());

    // Load category data when editing
    useEffect(() => {
        if (category) {
            setName(category.name);
            setDescription(category.description || "");
            setColor(category.color);
            loadCategoryPermissions(category.id);
        } else {
            setName("");
            setDescription("");
            setColor("#6366f1");
            setSelectedPermissions(new Set());
        }
    }, [category]);

    const loadCategoryPermissions = async (categoryId: string) => {
        const { data } = await supabase
            .from("category_permissions")
            .select("permission_id")
            .eq("category_id", categoryId);

        if (data) {
            setSelectedPermissions(new Set(data.map((cp) => cp.permission_id)));
        }
    };

    const saveMutation = useMutation({
        mutationFn: async () => {
            if (!name.trim()) {
                throw new Error("Category name is required");
            }

            if (category) {
                // Update existing category
                const { error: updateError } = await supabase
                    .from("staff_categories")
                    .update({
                        name: name.trim(),
                        description: description.trim() || null,
                        color,
                    })
                    .eq("id", category.id);

                if (updateError) throw updateError;

                // Delete existing permissions
                await supabase
                    .from("category_permissions")
                    .delete()
                    .eq("category_id", category.id);

                // Insert new permissions
                if (selectedPermissions.size > 0) {
                    const permissionsToInsert = Array.from(selectedPermissions).map((permId) => ({
                        category_id: category.id,
                        permission_id: permId,
                    }));

                    const { error: permError } = await supabase
                        .from("category_permissions")
                        .insert(permissionsToInsert);

                    if (permError) throw permError;
                }
            } else {
                // Create new category
                const { data: newCategory, error: insertError } = await supabase
                    .from("staff_categories")
                    .insert({
                        restaurant_id: restaurantId,
                        name: name.trim(),
                        description: description.trim() || null,
                        color,
                        is_default: false,
                    })
                    .select()
                    .single();

                if (insertError) throw insertError;

                // Insert permissions
                if (selectedPermissions.size > 0) {
                    const permissionsToInsert = Array.from(selectedPermissions).map((permId) => ({
                        category_id: newCategory.id,
                        permission_id: permId,
                    }));

                    const { error: permError } = await supabase
                        .from("category_permissions")
                        .insert(permissionsToInsert);

                    if (permError) throw permError;
                }
            }
        },
        onSuccess: () => {
            toast({
                title: category ? "Category updated" : "Category created",
                description: `Staff category has been ${category ? "updated" : "created"} successfully.`,
            });
            queryClient.invalidateQueries({ queryKey: ["staff-categories"] });
            queryClient.invalidateQueries({ queryKey: ["category-permissions"] });
            onOpenChange(false);
        },
        onError: (error: any) => {
            toast({
                title: `Failed to ${category ? "update" : "create"} category`,
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const togglePermission = (permissionId: string) => {
        const newSelected = new Set(selectedPermissions);
        if (newSelected.has(permissionId)) {
            newSelected.delete(permissionId);
        } else {
            newSelected.add(permissionId);
        }
        setSelectedPermissions(newSelected);
    };

    const toggleCategoryPermissions = (categoryPerms: Permission[]) => {
        const categoryPermIds = categoryPerms.map((p) => p.id);
        const allSelected = categoryPermIds.every((id) => selectedPermissions.has(id));

        const newSelected = new Set(selectedPermissions);
        if (allSelected) {
            categoryPermIds.forEach((id) => newSelected.delete(id));
        } else {
            categoryPermIds.forEach((id) => newSelected.add(id));
        }
        setSelectedPermissions(newSelected);
    };

    // Group permissions by category
    const permissionsByCategory = permissions.reduce((acc, perm) => {
        if (!acc[perm.category]) {
            acc[perm.category] = [];
        }
        acc[perm.category].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    const categoryLabels: Record<string, string> = {
        orders: "Orders",
        menu: "Menu & Products",
        staff: "Staff Management",
        analytics: "Analytics & Reports",
        settings: "Settings & Billing",
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{category ? "Edit Category" : "Create Category"}</DialogTitle>
                    <DialogDescription>
                        {category
                            ? "Update the category details and permissions"
                            : "Create a new staff category with custom permissions"}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 py-4">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Category Name *</Label>
                            <Input
                                id="name"
                                placeholder="e.g., Manager, Chef, Waiter"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Brief description of this role"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={2}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="color">Color</Label>
                            <div className="flex gap-3 items-center">
                                <input
                                    id="color"
                                    type="color"
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    className="h-10 w-20 rounded border cursor-pointer"
                                />
                                <Input
                                    value={color}
                                    onChange={(e) => setColor(e.target.value)}
                                    placeholder="#6366f1"
                                    className="flex-1"
                                />
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Permissions */}
                    <div className="space-y-4">
                        <div>
                            <h4 className="font-medium mb-1">Permissions</h4>
                            <p className="text-sm text-muted-foreground">
                                Select which features this category can access
                            </p>
                        </div>

                        {Object.entries(permissionsByCategory).map(([cat, perms]) => {
                            const allSelected = perms.every((p) => selectedPermissions.has(p.id));
                            const someSelected = perms.some((p) => selectedPermissions.has(p.id));

                            return (
                                <div key={cat} className="space-y-3">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-auto p-0 hover:bg-transparent"
                                            onClick={() => toggleCategoryPermissions(perms)}
                                        >
                                            {allSelected ? (
                                                <CheckSquare className="h-4 w-4 text-primary" />
                                            ) : someSelected ? (
                                                <Square className="h-4 w-4 text-primary fill-primary/20" />
                                            ) : (
                                                <Square className="h-4 w-4" />
                                            )}
                                        </Button>
                                        <h5 className="font-medium text-sm">{categoryLabels[cat] || cat}</h5>
                                    </div>

                                    <div className="ml-6 space-y-2">
                                        {perms.map((perm) => (
                                            <div key={perm.id} className="flex items-start gap-3">
                                                <Checkbox
                                                    id={perm.id}
                                                    checked={selectedPermissions.has(perm.id)}
                                                    onCheckedChange={() => togglePermission(perm.id)}
                                                />
                                                <div className="flex-1">
                                                    <Label
                                                        htmlFor={perm.id}
                                                        className="text-sm font-normal cursor-pointer"
                                                    >
                                                        {perm.name}
                                                    </Label>
                                                    {perm.description && (
                                                        <p className="text-xs text-muted-foreground mt-0.5">
                                                            {perm.description}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                        {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {category ? "Update" : "Create"} Category
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
