import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Shield, Lock } from "lucide-react";
import type { StaffCategory, Permission } from "./staff-utils";

type CategoryCardProps = {
    category: StaffCategory;
    permissions: Permission[];
    onEdit: (category: StaffCategory) => void;
    onDelete: (categoryId: string) => void;
};

export function CategoryCard({ category, permissions, onEdit, onDelete }: CategoryCardProps) {
    const permissionsByCategory = permissions.reduce((acc, perm) => {
        if (!acc[perm.category]) {
            acc[perm.category] = [];
        }
        acc[perm.category].push(perm);
        return acc;
    }, {} as Record<string, Permission[]>);

    return (
        <Card className="relative overflow-hidden">
            {/* Color accent bar */}
            <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ backgroundColor: category.color }}
            />

            <CardHeader className="pt-6">
                <div className="flex items-start justify-between">
                    <div className="flex-1">
                        <CardTitle className="flex items-center gap-2">
                            <span>{category.name}</span>
                            {category.is_default && (
                                <Badge variant="secondary" className="text-xs">
                                    <Lock className="h-3 w-3 mr-1" />
                                    Default
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className="mt-1.5">
                            {category.description || "No description"}
                        </CardDescription>
                    </div>
                    <Badge
                        style={{
                            backgroundColor: category.color + "20",
                            color: category.color,
                            borderColor: category.color + "40",
                        }}
                        className="shrink-0"
                    >
                        <Shield className="h-3 w-3 mr-1" />
                        {permissions.length} {permissions.length === 1 ? "permission" : "permissions"}
                    </Badge>
                </div>
            </CardHeader>

            <CardContent>
                {permissions.length > 0 ? (
                    <div className="space-y-3">
                        {Object.entries(permissionsByCategory).map(([cat, perms]) => (
                            <div key={cat}>
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">
                                    {cat}
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {perms.map((perm) => (
                                        <Badge key={perm.id} variant="outline" className="text-xs">
                                            {perm.name}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground italic">No permissions assigned</p>
                )}
            </CardContent>

            <CardFooter className="flex gap-2 border-t pt-4">
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onEdit(category)}
                >
                    <Edit className="h-3.5 w-3.5 mr-1.5" />
                    Edit
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => onDelete(category.id)}
                    disabled={category.is_default}
                >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete
                </Button>
            </CardFooter>
        </Card>
    );
}
