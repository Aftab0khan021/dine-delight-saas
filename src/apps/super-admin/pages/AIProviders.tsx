import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Star, DollarSign, CheckCircle, XCircle } from 'lucide-react';

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
    const [providers, setProviders] = useState<AIProvider[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<string>('all');

    useEffect(() => {
        fetchProviders();
    }, []);

    const fetchProviders = async () => {
        try {
            const { data, error } = await supabase
                .from('ai_providers')
                .select('*')
                .order('provider_type, accuracy_rating', { ascending: false });

            if (error) throw error;
            setProviders(data || []);
        } catch (error) {
            console.error('Error fetching providers:', error);
        } finally {
            setLoading(false);
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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div>
                <h1 className="text-3xl font-bold">AI Providers</h1>
                <p className="text-muted-foreground mt-2">
                    Manage AI service providers for NLP, image recognition, and voice transcription
                </p>
            </div>

            <Tabs value={filter} onValueChange={setFilter}>
                <TabsList>
                    <TabsTrigger value="all">All Providers</TabsTrigger>
                    <TabsTrigger value="nlp">NLP</TabsTrigger>
                    <TabsTrigger value="image">Image</TabsTrigger>
                    <TabsTrigger value="voice">Voice</TabsTrigger>
                </TabsList>

                <TabsContent value={filter} className="space-y-4 mt-6">
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {filteredProviders.map((provider) => (
                            <Card key={provider.id} className="relative">
                                <CardHeader>
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <CardTitle className="text-lg">{provider.display_name}</CardTitle>
                                            <CardDescription className="mt-1">
                                                {provider.provider_type.toUpperCase()} Provider
                                            </CardDescription>
                                        </div>
                                        {provider.is_active ? (
                                            <CheckCircle className="w-5 h-5 text-green-500" />
                                        ) : (
                                            <XCircle className="w-5 h-5 text-gray-400" />
                                        )}
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
                                        <div className="flex items-center gap-2">
                                            <DollarSign className="w-4 h-4 text-muted-foreground" />
                                            <span className="text-sm font-medium">
                                                {provider.estimated_cost_per_1k}
                                            </span>
                                        </div>
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
                            <p className="text-muted-foreground">No providers found</p>
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            <Card>
                <CardHeader>
                    <CardTitle>Provider Comparison</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left p-2">Provider</th>
                                    <th className="text-left p-2">Type</th>
                                    <th className="text-left p-2">Cost</th>
                                    <th className="text-left p-2">Accuracy</th>
                                    <th className="text-left p-2">Free</th>
                                    <th className="text-left p-2">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {providers.map((provider) => (
                                    <tr key={provider.id} className="border-b hover:bg-muted/50">
                                        <td className="p-2 font-medium">{provider.display_name}</td>
                                        <td className="p-2">
                                            <Badge variant="outline">{provider.provider_type.toUpperCase()}</Badge>
                                        </td>
                                        <td className="p-2">{provider.estimated_cost_per_1k}</td>
                                        <td className="p-2">
                                            <div className="flex items-center gap-1">
                                                {renderStars(provider.accuracy_rating)}
                                            </div>
                                        </td>
                                        <td className="p-2">
                                            {provider.is_free ? (
                                                <CheckCircle className="w-4 h-4 text-green-500" />
                                            ) : (
                                                <XCircle className="w-4 h-4 text-gray-400" />
                                            )}
                                        </td>
                                        <td className="p-2">
                                            {provider.is_active ? (
                                                <Badge variant="default">Active</Badge>
                                            ) : (
                                                <Badge variant="secondary">Inactive</Badge>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
