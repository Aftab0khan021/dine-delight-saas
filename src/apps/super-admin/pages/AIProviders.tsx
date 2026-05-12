import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Star, DollarSign, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AIProvider {
    id: string;
    provider_type: string;
    provider_name: string;
    display_name: string;
    description: string;
    is_free: boolean;
    requires_api_key: boolean;
    estimated_cost_per_1k: string;
    accuracy_rating: number;
    is_active: boolean;
}

export default function AIProvidersPage() {
    const { toast } = useToast();
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');
    const [toggling, setToggling] = useState<string | null>(null);

    useEffect(() => {
        fetchProviders();
    }, []);

    const fetchProviders = async () => {
        try {
            // Bug Fix #1: Chain two .order() calls instead of comma-separated
            const { data, error } = await supabase
                .from('ai_providers')
                .select('*')
                .order('provider_type')
                .order('accuracy_rating', { ascending: false });

            if (error) throw error;
            // Deduplicate by provider_type + provider_name (migration may have run twice)
            const seen = new Set<string>();
            const unique = (data || []).filter(p => {
                const key = `${p.provider_type}:${p.provider_name}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
            setProviders(unique);
        } catch (error) {
            console.error('Error fetching providers:', error);
        } finally {
            setLoading(false);
        }
    };

    // Bug Fix #6: Add activate/deactivate toggle
    const handleToggleActive = async (provider: AIProvider) => {
        setToggling(provider.id);
        try {
            const { error } = await supabase
                .from('ai_providers')
                .update({ is_active: !provider.is_active })
                .eq('id', provider.id);

            if (error) throw error;

            setProviders(prev =>
                prev.map(p => p.id === provider.id ? { ...p, is_active: !p.is_active } : p)
            );

            toast({
                title: provider.is_active ? 'Provider Deactivated' : 'Provider Activated',
                description: `${provider.display_name} has been ${provider.is_active ? 'deactivated' : 'activated'}.`,
            });
        } catch (error) {
            console.error('Error toggling provider:', error);
            toast({
                title: 'Error',
                description: 'Failed to update provider status',
                variant: 'destructive',
            });
        } finally {
            setToggling(null);
        }
    };

    const filteredProviders = providers.filter(p =>
        filter === 'all' || p.provider_type === filter
    );

    const renderStars = (rating: number) => {
        return Array.from({ length: 5 }, (_, i) => (
            <Star
                key={i}
                className={`w-4 h-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'}`}
            />
        ));
    };

    // Bug Fix #9: Format cost display — remove $ from DB value if icon is used
    const formatCost = (cost: string) => {
        if (!cost) return 'N/A';
        if (cost.toLowerCase() === 'free') return 'Free';
        return cost; // DB already includes $ sign
    };

    // Stats
    const activeCount = providers.filter(p => p.is_active).length;
    const freeCount = providers.filter(p => p.is_free).length;
    const typeCount = new Set(providers.map(p => p.provider_type)).size;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="w-full space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold">AI Providers</h1>
                    <p className="text-muted-foreground mt-1">
                        Manage AI service providers for NLP, image recognition, and voice transcription
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => { setLoading(true); fetchProviders(); }}>
                    <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {/* Stats row */}
            <div className="grid gap-4 grid-cols-3">
                <Card>
                    <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">Total Providers</p>
                        <p className="text-2xl font-bold">{providers.length}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">Active</p>
                        <p className="text-2xl font-bold text-green-600">{activeCount}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4">
                        <p className="text-xs text-muted-foreground">Free Tier</p>
                        <p className="text-2xl font-bold text-blue-600">{freeCount}</p>
                    </CardContent>
                </Card>
            </div>

            <Tabs value={filter} onValueChange={setFilter}>
                <TabsList>
                    <TabsTrigger value="all">All ({providers.length})</TabsTrigger>
                    <TabsTrigger value="nlp">NLP ({providers.filter(p => p.provider_type === 'nlp').length})</TabsTrigger>
                    <TabsTrigger value="image">Image ({providers.filter(p => p.provider_type === 'image').length})</TabsTrigger>
                    <TabsTrigger value="voice">Voice ({providers.filter(p => p.provider_type === 'voice').length})</TabsTrigger>
                </TabsList>

                <TabsContent value={filter} className="space-y-4 mt-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProviders.map((provider) => (
                            <Card key={provider.id} className={`relative transition-opacity ${!provider.is_active ? 'opacity-60' : ''}`}>
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg">{provider.display_name}</CardTitle>
                                            <CardDescription className="mt-1">
                                                {provider.provider_type.toUpperCase()} Provider
                                            </CardDescription>
                                        </div>
                                        {/* Bug Fix #6: Activate/Deactivate toggle */}
                                        <Switch
                                            checked={provider.is_active}
                                            onCheckedChange={() => handleToggleActive(provider)}
                                            disabled={toggling === provider.id}
                                        />
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        {provider.description}
                                    </p>

                                    <div className="flex items-center gap-1">
                                        {renderStars(provider.accuracy_rating)}
                                        <span className="text-sm text-muted-foreground ml-2">
                                            ({provider.accuracy_rating}/5)
                                        </span>
                                    </div>

                                    <div className="flex items-center justify-between">
                                        {/* Bug Fix #9: Show cost without double dollar */}
                                        <span className="text-sm font-medium">
                                            {formatCost(provider.estimated_cost_per_1k)}
                                            {!provider.is_free && <span className="text-muted-foreground text-xs ml-1">/ 1K requests</span>}
                                        </span>
                                        <div className="flex gap-2">
                                            {provider.is_free && (
                                                <Badge variant="secondary">Free</Badge>
                                            )}
                                            {provider.requires_api_key && (
                                                <Badge variant="outline">API Key Required</Badge>
                                            )}
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {filteredProviders.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-muted-foreground">No providers found for this category</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Comparison Table */}
            <Card>
                <CardHeader>
                    <CardTitle>Provider Comparison</CardTitle>
                    <CardDescription>Side-by-side comparison of all providers</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Provider</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Cost / 1K</TableHead>
                                <TableHead>Accuracy</TableHead>
                                <TableHead>Free</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {providers.map((provider) => (
                                <TableRow key={provider.id} className={!provider.is_active ? 'opacity-50' : ''}>
                                    <TableCell className="font-medium">{provider.display_name}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{provider.provider_type.toUpperCase()}</Badge>
                                    </TableCell>
                                    <TableCell>{formatCost(provider.estimated_cost_per_1k)}</TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            {renderStars(provider.accuracy_rating)}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {provider.is_free ? (
                                            <CheckCircle className="w-4 h-4 text-green-500" />
                                        ) : (
                                            <XCircle className="w-4 h-4 text-gray-400" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant={provider.is_active ? "default" : "secondary"}>
                                            {provider.is_active ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Switch
                                            checked={provider.is_active}
                                            onCheckedChange={() => handleToggleActive(provider)}
                                            disabled={toggling === provider.id}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
