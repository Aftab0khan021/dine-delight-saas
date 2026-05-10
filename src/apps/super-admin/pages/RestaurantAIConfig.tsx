import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Save, AlertCircle, Sparkles, BarChart3, MessageSquare, TrendingUp, Brain, Eye, Mic, Image } from 'lucide-react';
import APIKeyManagement from '../components/APIKeyManagement';

// Bug Fix #7: Define features with descriptions and status
const AI_FEATURES = [
    {
        key: 'smart_ranking',
        label: 'Smart Menu Ranking',
        description: 'Auto-sort menu items by popularity so best-sellers appear first',
        icon: TrendingUp,
        tier: 'free' as const,
    },
    {
        key: 'ai_descriptions',
        label: 'AI Menu Descriptions',
        description: 'Generate appetizing menu item descriptions using AI templates or GPT',
        icon: Sparkles,
        tier: 'free' as const,
    },
    {
        key: 'sentiment_analysis',
        label: 'Review Sentiment',
        description: 'Auto-classify customer reviews as positive, neutral, or negative',
        icon: MessageSquare,
        tier: 'free' as const,
    },
    {
        key: 'order_heatmap',
        label: 'Order Heatmap',
        description: 'Visual heatmap showing busiest ordering hours and days',
        icon: BarChart3,
        tier: 'free' as const,
    },
    {
        key: 'recommendations',
        label: 'Smart Upsell Suggestions',
        description: 'Suggest add-ons at checkout based on co-order patterns',
        icon: Brain,
        tier: 'paid' as const,
    },
    {
        key: 'personalized_greetings',
        label: 'Personalized Greetings',
        description: 'Custom WhatsApp messages based on customer order history',
        icon: MessageSquare,
        tier: 'paid' as const,
    },
    {
        key: 'natural_language_ordering',
        label: 'Natural Language Ordering',
        description: 'Allow customers to order using natural language text',
        icon: Brain,
        tier: 'paid' as const,
    },
    {
        key: 'image_recognition',
        label: 'Image Recognition',
        description: 'Identify food items from photos for menu creation',
        icon: Image,
        tier: 'paid' as const,
    },
    {
        key: 'voice_messages',
        label: 'Voice Ordering',
        description: 'Transcribe voice messages to text orders',
        icon: Mic,
        tier: 'paid' as const,
    },
    {
        key: 'birthday_offers',
        label: 'Birthday Auto-Offers',
        description: 'Automatically send birthday coupons to customers',
        icon: Sparkles,
        tier: 'paid' as const,
    },
    {
        key: 'real_time_notifications',
        label: 'Real-time Notifications',
        description: 'Push notifications for order status and promotions',
        icon: Eye,
        tier: 'paid' as const,
    },
];

interface AIConfig {
    enabled: boolean;
    nlp_provider: string;
    image_provider: string;
    voice_provider: string;
    features: Record<string, boolean>;
}

interface Provider {
    provider_name: string;
    display_name: string;
}

export default function RestaurantAIConfig() {
    const { id } = useParams<{ id: string }>();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [restaurant, setRestaurant] = useState<any>(null);
    const [config, setConfig] = useState<AIConfig>({
        enabled: false,
        nlp_provider: 'regex',
        image_provider: 'tensorflow',
        voice_provider: 'whisper-local',
        features: Object.fromEntries(AI_FEATURES.map(f => [f.key, false])),
    });

    const [nlpProviders, setNlpProviders] = useState<Provider[]>([]);
    const [imageProviders, setImageProviders] = useState<Provider[]>([]);
    const [voiceProviders, setVoiceProviders] = useState<Provider[]>([]);

    useEffect(() => {
        fetchData();
    }, [id]);

    const fetchData = async () => {
        try {
            // Fetch restaurant
            const { data: restaurantData, error: restaurantError } = await supabase
                .from('restaurants')
                .select('id, name, ai_config')
                .eq('id', id)
                .single();

            if (restaurantError) throw restaurantError;
            setRestaurant(restaurantData);

            if (restaurantData.ai_config) {
                // Merge saved config with defaults for any new features
                const saved = restaurantData.ai_config;
                const mergedFeatures = { ...config.features };
                if (saved.features) {
                    Object.keys(saved.features).forEach(key => {
                        mergedFeatures[key] = saved.features[key];
                    });
                }
                setConfig({
                    ...config,
                    ...saved,
                    features: mergedFeatures,
                });
            }

            // Fetch providers
            const { data: providersData, error: providersError } = await supabase
                .from('ai_providers')
                .select('provider_type, provider_name, display_name')
                .eq('is_active', true);

            if (providersError) throw providersError;

            // Deduplicate by provider_name (migration may have run twice)
            const dedup = (arr: typeof providersData) => {
                const seen = new Set<string>();
                return arr.filter(p => {
                    const key = `${p.provider_type}:${p.provider_name}`;
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            };
            const unique = dedup(providersData);

            setNlpProviders(unique.filter(p => p.provider_type === 'nlp'));
            setImageProviders(unique.filter(p => p.provider_type === 'image'));
            setVoiceProviders(unique.filter(p => p.provider_type === 'voice'));

        } catch (error) {
            console.error('Error fetching data:', error);
            toast({
                title: 'Error',
                description: 'Failed to load restaurant configuration',
                variant: 'destructive',
            });
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            const { error } = await supabase
                .from('restaurants')
                .update({ ai_config: config })
                .eq('id', id);

            if (error) throw error;

            toast({
                title: 'Success',
                description: 'AI configuration saved successfully',
            });
        } catch (error) {
            console.error('Error saving config:', error);
            toast({
                title: 'Error',
                description: 'Failed to save configuration',
                variant: 'destructive',
            });
        } finally {
            setSaving(false);
        }
    };

    // Count active features by tier
    const freeFeatures = AI_FEATURES.filter(f => f.tier === 'free');
    const paidFeatures = AI_FEATURES.filter(f => f.tier === 'paid');
    const enabledCount = AI_FEATURES.filter(f => config.features[f.key]).length;

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
                    <h1 className="text-2xl sm:text-3xl font-bold">AI Configuration</h1>
                    <p className="text-muted-foreground mt-1">{restaurant?.name}</p>
                </div>
                <Button onClick={handleSave} disabled={saving}>
                    <Save className="w-4 h-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Enable AI Features</CardTitle>
                    <CardDescription>
                        Master toggle for all AI-powered features ({enabledCount} / {AI_FEATURES.length} active)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center space-x-2">
                        <Switch
                            id="ai-enabled"
                            checked={config.enabled}
                            onCheckedChange={(checked) => setConfig({ ...config, enabled: checked })}
                        />
                        <Label htmlFor="ai-enabled" className="font-medium">
                            {config.enabled ? 'AI Features Enabled' : 'AI Features Disabled'}
                        </Label>
                    </div>
                </CardContent>
            </Card>

            {config.enabled && (
                <>
                    <Card>
                        <CardHeader>
                            <CardTitle>Provider Selection</CardTitle>
                            <CardDescription>
                                Choose AI providers for different capabilities
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>NLP Provider (Natural Language Processing)</Label>
                                <Select
                                    value={config.nlp_provider}
                                    onValueChange={(value) => setConfig({ ...config, nlp_provider: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {nlpProviders.length > 0 ? (
                                            nlpProviders.map((provider) => (
                                                <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                    {provider.display_name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            /* Bug Fix #11: Show message when no active providers */
                                            <div className="p-2 text-xs text-muted-foreground text-center">
                                                <AlertCircle className="w-3 h-3 inline mr-1" />
                                                No active NLP providers
                                            </div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Image Provider (Image Recognition)</Label>
                                <Select
                                    value={config.image_provider}
                                    onValueChange={(value) => setConfig({ ...config, image_provider: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {imageProviders.length > 0 ? (
                                            imageProviders.map((provider) => (
                                                <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                    {provider.display_name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <div className="p-2 text-xs text-muted-foreground text-center">
                                                <AlertCircle className="w-3 h-3 inline mr-1" />
                                                No active Image providers
                                            </div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Voice Provider (Voice Transcription)</Label>
                                <Select
                                    value={config.voice_provider}
                                    onValueChange={(value) => setConfig({ ...config, voice_provider: value })}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {voiceProviders.length > 0 ? (
                                            voiceProviders.map((provider) => (
                                                <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                    {provider.display_name}
                                                </SelectItem>
                                            ))
                                        ) : (
                                            <div className="p-2 text-xs text-muted-foreground text-center">
                                                <AlertCircle className="w-3 h-3 inline mr-1" />
                                                No active Voice providers
                                            </div>
                                        )}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Bug Fix #7: Replaced dead features with organized free/paid sections */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Free Features</CardTitle>
                            <CardDescription>
                                Built-in AI features — no API key required
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {freeFeatures.map((feature) => {
                                const Icon = feature.icon;
                                return (
                                    <div key={feature.key} className="flex items-start justify-between gap-4 py-2">
                                        <div className="flex items-start gap-3 flex-1">
                                            <Icon className="w-4 h-4 mt-0.5 text-green-600 shrink-0" />
                                            <div>
                                                <Label htmlFor={feature.key} className="cursor-pointer font-medium flex items-center gap-2">
                                                    {feature.label}
                                                    <Badge variant="secondary" className="text-[10px] h-4 px-1.5">Free</Badge>
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                                            </div>
                                        </div>
                                        <Switch
                                            id={feature.key}
                                            checked={config.features[feature.key] ?? false}
                                            onCheckedChange={(checked) =>
                                                setConfig({
                                                    ...config,
                                                    features: { ...config.features, [feature.key]: checked },
                                                })
                                            }
                                        />
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Paid Features</CardTitle>
                            <CardDescription>
                                Advanced AI features — requires API key from restaurant owner
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {paidFeatures.map((feature) => {
                                const Icon = feature.icon;
                                return (
                                    <div key={feature.key} className="flex items-start justify-between gap-4 py-2">
                                        <div className="flex items-start gap-3 flex-1">
                                            <Icon className="w-4 h-4 mt-0.5 text-amber-500 shrink-0" />
                                            <div>
                                                <Label htmlFor={feature.key} className="cursor-pointer font-medium flex items-center gap-2">
                                                    {feature.label}
                                                    <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-amber-400 text-amber-600">Paid</Badge>
                                                </Label>
                                                <p className="text-xs text-muted-foreground mt-0.5">{feature.description}</p>
                                            </div>
                                        </div>
                                        <Switch
                                            id={feature.key}
                                            checked={config.features[feature.key] ?? false}
                                            onCheckedChange={(checked) =>
                                                setConfig({
                                                    ...config,
                                                    features: { ...config.features, [feature.key]: checked },
                                                })
                                            }
                                        />
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>

                    <APIKeyManagement restaurantId={id!} />
                </>
            )}
        </div>
    );
}
