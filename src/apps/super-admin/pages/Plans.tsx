import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit, GripVertical, Check, X, Code } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SubscriptionPlan, PlanFeatures } from "../types/super-admin";
import { FEATURE_DEFINITIONS, FEATURE_CATEGORIES, getDefaultFeatures } from "../lib/features";

export default function Plans() {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: "",
        slug: "",
        description: "",
        price_cents: 0,
        billing_period: "monthly" as "monthly" | "yearly",
        trial_days: 14,
        features: getDefaultFeatures(),
        is_active: true,
    });
    const [showJsonEditor, setShowJsonEditor] = useState(false);

    // Fetch plans
    const { data: plans, isLoading } = useQuery({
        queryKey: ['subscription-plans'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('subscription_plans')
                .select('*')
                .order('sort_order');

            if (error) throw error;
            return data as SubscriptionPlan[];
        },
    });

    // Create/Update mutation
    const savePlanMutation = useMutation({
        mutationFn: async (plan: Partial<SubscriptionPlan>) => {
            const planData = {
                name: formData.name,
                slug: formData.slug,
                description: formData.description,
                price_cents: formData.price_cents,
                billing_period: formData.billing_period,
                trial_days: formData.trial_days,
                features: formData.features, // Already an object
                is_active: formData.is_active,
            };

            if (editingPlan) {
                const { error } = await (supabase as any)
                    .from('subscription_plans')
                    .update(planData)
                    .eq('id', editingPlan.id);
                if (error) throw error;
            } else {
                const { error } = await (supabase as any)
                    .from('subscription_plans')
                    .insert(planData);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['subscription-plans'] });
            toast({
                title: "Success",
                description: `Plan ${editingPlan ? 'updated' : 'created'} successfully`,
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

    const handleOpenDialog = (plan?: SubscriptionPlan) => {
        if (plan) {
            setEditingPlan(plan);
            setFormData({
                name: plan.name,
                slug: plan.slug,
                description: plan.description || "",
                price_cents: plan.price_cents,
                billing_period: plan.billing_period,
                trial_days: plan.trial_days,
                features: plan.features,
                is_active: plan.is_active,
            });
        } else {
            setEditingPlan(null);
            setFormData({
                name: "",
                slug: "",
                description: "",
                price_cents: 0,
                billing_period: "monthly",
                trial_days: 14,
                features: getDefaultFeatures(),
                is_active: true,
            });
        }
        setIsDialogOpen(true);
        setShowJsonEditor(false);
    };

    const updateFeature = (key: string, value: boolean | number) => {
        setFormData({
            ...formData,
            features: {
                ...formData.features,
                [key]: value,
            },
        });
    };

    const handleCloseDialog = () => {
        setIsDialogOpen(false);
        setEditingPlan(null);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        savePlanMutation.mutate({});
    };

    const formatCurrency = (cents: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 0,
        }).format(cents / 100);
    };

    return (
        <section className="space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-semibold tracking-tight">Subscription Plans</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage pricing plans and features for your platform
                    </p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => handleOpenDialog()}>
                            <Plus className="h-4 w-4 mr-2" />
                            Create Plan
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>
                                {editingPlan ? 'Edit Plan' : 'Create New Plan'}
                            </DialogTitle>
                            <DialogDescription>
                                Configure pricing, features, and trial period for this plan
                            </DialogDescription>
                        </DialogHeader>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                    <Label htmlFor="name">Plan Name</Label>
                                    <Input
                                        id="name"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="e.g., Professional"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="slug">Slug</Label>
                                    <Input
                                        id="slug"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                                        placeholder="e.g., professional"
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
                                    placeholder="Brief description of this plan"
                                    rows={2}
                                />
                            </div>

                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="space-y-2">
                                    <Label htmlFor="price">Price (USD)</Label>
                                    <Input
                                        id="price"
                                        type="number"
                                        value={formData.price_cents / 100}
                                        onChange={(e) => setFormData({ ...formData, price_cents: Math.round(parseFloat(e.target.value) * 100) })}
                                        placeholder="29.00"
                                        step="0.01"
                                        required
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="billing_period">Billing Period</Label>
                                    <Select
                                        value={formData.billing_period}
                                        onValueChange={(value: "monthly" | "yearly") => setFormData({ ...formData, billing_period: value })}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="monthly">Monthly</SelectItem>
                                            <SelectItem value="yearly">Yearly</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="trial_days">Trial Days</Label>
                                    <Input
                                        id="trial_days"
                                        type="number"
                                        value={formData.trial_days}
                                        onChange={(e) => setFormData({ ...formData, trial_days: parseInt(e.target.value) })}
                                        placeholder="14"
                                        min="0"
                                        required
                                    />
                                </div>
                            </div>

                            <Separator className="my-4" />

                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <Label className="text-base">Plan Features</Label>
                                        <p className="text-sm text-muted-foreground">
                                            Configure features included in this plan
                                        </p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setShowJsonEditor(!showJsonEditor)}
                                    >
                                        <Code className="h-4 w-4 mr-2" />
                                        {showJsonEditor ? 'Visual Editor' : 'JSON Editor'}
                                    </Button>
                                </div>

                                {showJsonEditor ? (
                                    <div className="space-y-2">
                                        <Textarea
                                            value={JSON.stringify(formData.features, null, 2)}
                                            onChange={(e) => {
                                                try {
                                                    const parsed = JSON.parse(e.target.value);
                                                    setFormData({ ...formData, features: parsed });
                                                } catch (err) {
                                                    // Invalid JSON, don't update
                                                }
                                            }}
                                            rows={12}
                                            className="font-mono text-sm"
                                        />
                                        <p className="text-xs text-muted-foreground">
                                            Advanced: Edit features as JSON. Use -1 for unlimited limits.
                                        </p>
                                    </div>
                                ) : (
                                    <Tabs defaultValue="core" className="w-full">
                                        <TabsList className="grid w-full grid-cols-4">
                                            {FEATURE_CATEGORIES.map((cat) => (
                                                <TabsTrigger key={cat.key} value={cat.key}>
                                                    {cat.label}
                                                </TabsTrigger>
                                            ))}
                                        </TabsList>

                                        {FEATURE_CATEGORIES.map((category) => (
                                            <TabsContent key={category.key} value={category.key} className="space-y-3 mt-4">
                                                <p className="text-sm text-muted-foreground mb-3">
                                                    {category.description}
                                                </p>
                                                {FEATURE_DEFINITIONS.filter(f => f.category === category.key).map((feature) => (
                                                    <div key={feature.key} className="border rounded-lg p-4 space-y-3">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="flex-1">
                                                                <Label className="text-base font-medium">
                                                                    {feature.name}
                                                                </Label>
                                                                <p className="text-sm text-muted-foreground mt-1">
                                                                    {feature.description}
                                                                </p>
                                                                <code className="text-xs bg-muted px-2 py-0.5 rounded mt-2 inline-block">
                                                                    {feature.key}
                                                                </code>
                                                            </div>
                                                            {feature.type === 'boolean' ? (
                                                                <Switch
                                                                    checked={formData.features[feature.key] === true}
                                                                    onCheckedChange={(checked) => updateFeature(feature.key, checked)}
                                                                />
                                                            ) : (
                                                                <div className="w-32">
                                                                    <Input
                                                                        type="number"
                                                                        value={typeof formData.features[feature.key] === 'number' ? formData.features[feature.key] as number : 0}
                                                                        onChange={(e) => updateFeature(feature.key, parseInt(e.target.value))}
                                                                        placeholder="0"
                                                                        min="-1"
                                                                    />
                                                                    {feature.unit && (
                                                                        <p className="text-xs text-muted-foreground mt-1">
                                                                            {feature.unit}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </TabsContent>
                                        ))}
                                    </Tabs>
                                )}
                            </div>

                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="is_active"
                                    checked={formData.is_active}
                                    onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                                />
                                <Label htmlFor="is_active">Plan is active</Label>
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" onClick={handleCloseDialog}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={savePlanMutation.isPending}>
                                    {savePlanMutation.isPending ? 'Saving...' : editingPlan ? 'Update Plan' : 'Create Plan'}
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </header>

            {/* Plans Table */}
            <Card>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[50px]"></TableHead>
                                <TableHead>Plan Name</TableHead>
                                <TableHead>Price</TableHead>
                                <TableHead>Billing</TableHead>
                                <TableHead>Trial</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Features</TableHead>
                                <TableHead className="w-[100px]">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8">
                                        Loading plans...
                                    </TableCell>
                                </TableRow>
                            ) : plans?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                        No plans created yet
                                    </TableCell>
                                </TableRow>
                            ) : (
                                plans?.map((plan) => (
                                    <TableRow key={plan.id}>
                                        <TableCell>
                                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{plan.name}</div>
                                                <div className="text-sm text-muted-foreground">{plan.slug}</div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {formatCurrency(plan.price_cents)}
                                        </TableCell>
                                        <TableCell className="capitalize">{plan.billing_period}</TableCell>
                                        <TableCell>{plan.trial_days} days</TableCell>
                                        <TableCell>
                                            <Badge variant={plan.is_active ? "default" : "secondary"}>
                                                {plan.is_active ? "Active" : "Inactive"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                                {plan.features && Object.entries(plan.features).slice(0, 3).map(([key, value]) => (
                                                    <Badge key={key} variant="outline" className="text-xs">
                                                        {value ? <Check className="h-3 w-3 mr-1" /> : <X className="h-3 w-3 mr-1" />}
                                                        {key}
                                                    </Badge>
                                                ))}
                                                {plan.features && Object.keys(plan.features).length > 3 && (
                                                    <Badge variant="outline" className="text-xs">
                                                        +{Object.keys(plan.features).length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleOpenDialog(plan)}
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

            {/* Feature Reference */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Feature Reference</CardTitle>
                    <CardDescription>
                        Common features you can configure in plans
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2 md:grid-cols-2 text-sm">
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">online_ordering</code>
                            <span className="text-muted-foreground ml-2">- Enable online orders</span>
                        </div>
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">qr_menu</code>
                            <span className="text-muted-foreground ml-2">- QR code menu access</span>
                        </div>
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">staff_limit</code>
                            <span className="text-muted-foreground ml-2">- Max staff (use -1 for unlimited)</span>
                        </div>
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">custom_domain</code>
                            <span className="text-muted-foreground ml-2">- Custom domain support</span>
                        </div>
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">analytics</code>
                            <span className="text-muted-foreground ml-2">- Analytics dashboard</span>
                        </div>
                        <div>
                            <code className="bg-muted px-2 py-1 rounded">api_access</code>
                            <span className="text-muted-foreground ml-2">- REST API access</span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
