import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FeatureFlag } from "../types/super-admin";

export default function FeatureFlags() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);

    const [formData, setFormData] = useState({
        key: "",
        name: "",
        description: "",
        is_enabled: true,
        config: "{}",
    });

    // Fetch feature flags
    const { data: flags, isLoading } = useQuery({
        queryKey: ['feature-flags'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('feature_flags')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data as FeatureFlag[];
        },
    });

    // Fetch restaurant overrides
    const { data: overrides } = useQuery({
        queryKey: ['restaurant-features'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('restaurant_features')
                .select(`
          *,
          restaurant:restaurants (
            id,
            name,
            slug
          )
        `)
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data;
        },
    });

    // Toggle global feature flag
    const toggleFlagMutation = useMutation({
        mutationFn: async ({ id, is_enabled }: { id: string; is_enabled: boolean }) => {
            const { error } = await (supabase as any)
                .from('feature_flags')
                .update({ is_enabled })
                .eq('id', id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
            toast({
                title: "Success",
                description: "Feature flag updated",
            });
        },
        onError: () => {
            toast({
                title: "Error",
                description: "Failed to update feature flag",
                variant: "destructive",
            });
        },
    });

    // Create/Update feature flag
    const saveFlagMutation = useMutation({
        mutationFn: async () => {
            let parsedConfig;
            try {
                parsedConfig = JSON.parse(formData.config);
            } catch (e) {
                throw new Error("Invalid JSON in config field");
            }

            const flagData = {
                key: formData.key,
                name: formData.name,
                description: formData.description,
                is_enabled: formData.is_enabled,
                config: parsedConfig,
            };

            if (editingFlag) {
                const { error } = await (supabase as any)
                    .from('feature_flags')
                    .update(flagData)
                    .eq('id', editingFlag.id);
                if (error) throw error;
            } else {
                const { error } = await (supabase as any)
                    .from('feature_flags')
                    .insert(flagData);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['feature-flags'] });
            toast({
                title: "Success",
                description: `Feature flag ${editingFlag ? 'updated' : 'created'}`,
            });
            handleCloseDialog();
        },
        onError: (error: Error) => {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleOpenDialog = (flag?: FeatureFlag) => {
        if (flag) {
            setEditingFlag(flag);
            setFormData({
                key: flag.key,
                name: flag.name,
                description: flag.description || "",
                is_enabled: flag.is_enabled,
                config: JSON.stringify(flag.config, null, 2),
            });
        } else {
            setEditingFlag(null);
            setFormData({
                key: "",
                name: "",
                description: "",
                is_enabled: true,
                config: "{}",
            });
        }
        setIsDialogOpen(true);
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingFlag(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        saveFlagMutation.mutate();
    };

    return (
        <section className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Feature Flags</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage global features and per-restaurant overrides
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Feature Flag
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                        <DialogHeader>
                            <DialogTitle>
                                {editingFlag ? 'Edit Feature Flag' : 'Create Feature Flag'}
                            </DialogTitle>
                            <DialogDescription>
                                Configure a new feature flag for the platform
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="key">Key</Label>
                                    <Input
                                        id="key"
                                        value={formData.key}
                                        onChange={(e) => setFormData({ ...formData, key: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                                        placeholder="e.g., new_feature"
                                        required
                                        disabled={!!editingFlag}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="name">Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., New Feature"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description">Description</Label>
                                <Textarea
                                    id="description"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="What does this feature do?"
                                    rows={2}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="config">Configuration (JSON)</Label>
                                <Textarea
                                    id="config"
                                    value={formData.config}
                                    onChange={(e) => setFormData({ ...formData, config: e.target.value })}
                                    placeholder='{"rollout_percentage": 100}'
                                    rows={4}
                                    className="font-mono text-sm"
                                />
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="is_enabled"
                                    checked={formData.is_enabled}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_enabled: checked })}
                                />
                                <Label htmlFor="is_enabled">Enabled by default</Label>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={saveFlagMutation.isPending}>
                                    {saveFlagMutation.isPending ? 'Saving...' : editingFlag ? 'Update' : 'Create'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </header>

            <Tabs defaultValue="global" className="space-y-4">
                <TabsList>
                    <TabsTrigger value="global">Global Flags</TabsTrigger>
                    <TabsTrigger value="overrides">Restaurant Overrides</TabsTrigger>
                </TabsList>

                <TabsContent value="global" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Global Feature Flags</CardTitle>
                            <CardDescription>
                                Control features across the entire platform
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Feature</TableHead>
                                        <TableHead>Description</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead className="w-[100px]">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8">
                                                Loading...
                                            </TableCell>
                                        </TableRow>
                                    ) : flags?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                No feature flags created yet
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        flags?.map((flag) => (
                                            <TableRow key={flag.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{flag.name}</div>
                                                        <div className="text-sm text-muted-foreground font-mono">
                                                            {flag.key}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="max-w-md">
                                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                                        {flag.description || 'No description'}
                                                    </p>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Switch
                                                            checked={flag.is_enabled}
                                                            onCheckedChange={(checked) =>
                                                                toggleFlagMutation.mutate({ id: flag.id, is_enabled: checked })
                                                            }
                                                            disabled={toggleFlagMutation.isPending}
                                                        />
                                                        <Badge variant={flag.is_enabled ? "default" : "secondary"}>
                                                            {flag.is_enabled ? "Enabled" : "Disabled"}
                                                        </Badge>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleOpenDialog(flag)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Emergency Kill Switch */}
                    <Card className="border-destructive">
                        <CardHeader>
                            <CardTitle className="text-destructive flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5" />
                                Emergency Kill Switches
                            </CardTitle>
                            <CardDescription>
                                Quickly disable critical features platform-wide
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {flags?.filter(f => ['online_ordering', 'qr_menu', 'api_access'].includes(f.key)).map((flag) => (
                                    <div key={flag.id} className="flex items-center justify-between">
                                        <div>
                                            <Label className="font-medium">{flag.name}</Label>
                                            <p className="text-sm text-muted-foreground">
                                                Emergency disable for {flag.key}
                                            </p>
                                        </div>
                                        <Switch
                                            checked={flag.is_enabled}
                                            onCheckedChange={(checked) =>
                                                toggleFlagMutation.mutate({ id: flag.id, is_enabled: checked })
                                            }
                                        />
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="overrides" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Restaurant-Specific Overrides</CardTitle>
                            <CardDescription>
                                Features enabled/disabled for specific restaurants
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Restaurant</TableHead>
                                        <TableHead>Feature</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Config</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {overrides?.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                No restaurant overrides configured
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        overrides?.map((override: any) => (
                                            <TableRow key={override.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{override.restaurant?.name}</div>
                                                        <div className="text-sm text-muted-foreground">
                                                            /{override.restaurant?.slug}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {override.feature_key}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant={override.is_enabled ? "default" : "secondary"}>
                                                        {override.is_enabled ? "Enabled" : "Disabled"}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {Object.keys(override.config || {}).length > 0
                                                        ? JSON.stringify(override.config).substring(0, 50) + '...'
                                                        : 'No config'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </section>
    );
}