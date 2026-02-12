import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRestaurantContext } from "../state/restaurant-context";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Settings, Users, Loader2 } from "lucide-react";
import { CategoryDialog } from "../components/staff/CategoryDialog";
import { CategoryCard } from "../components/staff/CategoryCard";

type StaffCategory = {
    id: string;
    restaurant_id: string;
    name: string;
    description: string | null;
    color: string;
    is_default: boolean;
    created_at: string;
    updated_at: string;
};

type Permission = {
    id: string;
    code: string;
    name: string;
    description: string | null;
    category: string;
};

type CategoryPermission = {
    category_id: string;
    permission_id: string;
};

export default function StaffCategories() {
    const { restaurant } = useRestaurantContext();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCategory, setEditingCategory] = useState<StaffCategory | null>(null);

    // Fetch staff categories
    const categoriesQuery = useQuery({
        queryKey: ["staff-categories", restaurant?.id],
        queryFn: async () => {
            if (!restaurant?.id) return [];
            const { data, error } = await supabase
                .from("staff_categories")
                .select("*")
                .eq("restaurant_id", restaurant.id)
                .order("created_at", { ascending: true });

            if (error) throw error;
            return data as StaffCategory[];
        },
        enabled: !!restaurant?.id,
    });

    // Fetch all permissions
    const permissionsQuery = useQuery({
        queryKey: ["permissions"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("permissions")
                .select("*")
                .order("category", { ascending: true });

            if (error) throw error;
            return data as Permission[];
        },
    });

    // Fetch category permissions
    const categoryPermissionsQuery = useQuery({
        queryKey: ["category-permissions", restaurant?.id],
        queryFn: async () => {
            if (!restaurant?.id) return [];
            const { data, error } = await supabase
                .from("category_permissions")
                .select("*");

            if (error) throw error;
            return data as CategoryPermission[];
        },
        enabled: !!restaurant?.id,
    });

    // Delete category mutation
    const deleteMutation = useMutation({
        mutationFn: async (categoryId: string) => {
            const { error } = await supabase
                .from("staff_categories")
                .delete()
                .eq("id", categoryId);

            if (error) throw error;
        },
        onSuccess: () => {
            toast({
                title: "Category deleted",
                description: "Staff category has been removed successfully.",
            });
            queryClient.invalidateQueries({ queryKey: ["staff-categories"] });
            queryClient.invalidateQueries({ queryKey: ["category-permissions"] });
        },
        onError: (error: any) => {
            toast({
                title: "Failed to delete category",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleEdit = (category: StaffCategory) => {
        setEditingCategory(category);
        setDialogOpen(true);
    };

    const handleDelete = async (categoryId: string) => {
        if (confirm("Are you sure you want to delete this category? This action cannot be undone.")) {
            deleteMutation.mutate(categoryId);
        }
    };

    const handleCreateNew = () => {
        setEditingCategory(null);
        setDialogOpen(true);
    };

    const handleDialogClose = () => {
        setDialogOpen(false);
        setEditingCategory(null);
    };

    const getCategoryPermissions = (categoryId: string): string[] => {
        return (
            categoryPermissionsQuery.data
                ?.filter((cp) => cp.category_id === categoryId)
                .map((cp) => cp.permission_id) || []
        );
    };

    const getPermissionDetails = (permissionIds: string[]): Permission[] => {
        return (
            permissionsQuery.data?.filter((p) => permissionIds.includes(p.id)) || []
        );
    };

    if (!restaurant) {
        return (
            <div className="flex items-center justify-center h-96">
                <p className="text-muted-foreground">No restaurant selected</p>
            </div>
        );
    }

    const isLoading = categoriesQuery.isLoading || permissionsQuery.isLoading || categoryPermissionsQuery.isLoading;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Staff Categories</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Create custom staff roles and assign granular permissions
                    </p>
                </div>
                <Button onClick={handleCreateNew}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Category
                </Button>
            </div>

            {/* Info Card */}
            <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Role-Based Access Control
                    </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-2">
                    <p>
                        Staff categories allow you to create custom roles (Manager, Chef, Waiter, etc.) with specific permissions.
                    </p>
                    <p>
                        Assign these categories to staff members to control what they can view and manage in the admin panel.
                    </p>
                </CardContent>
            </Card>

            {/* Categories List */}
            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {categoriesQuery.data.map((category) => {
                        const permissionIds = getCategoryPermissions(category.id);
                        const permissions = getPermissionDetails(permissionIds);
                        return (
                            <CategoryCard
                                key={category.id}
                                category={category}
                                permissions={permissions}
                                onEdit={handleEdit}
                                onDelete={handleDelete}
                            />
                        );
                    })}
                </div>
            ) : (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center h-64 text-center">
                        <Users className="h-12 w-12 text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No staff categories yet</h3>
                        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
                            Create your first staff category to start managing permissions for your team members.
                        </p>
                        <Button onClick={handleCreateNew}>
                            <Plus className="mr-2 h-4 w-4" />
                            Create First Category
                        </Button>
                    </CardContent>
                </Card>
            )}

            {/* Dialog */}
            <CategoryDialog
                open={dialogOpen}
                onOpenChange={handleDialogClose}
                category={editingCategory}
                permissions={permissionsQuery.data || []}
                restaurantId={restaurant.id}
            />
        </div>
    );
}
