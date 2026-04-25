import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Save, Key, TrendingUp } from 'lucide-react';
import APIKeyManagement from '../components/APIKeyManagement';

interface AIConfig {
    enabled: boolean;
    nlp_provider: string;
    image_provider: string;
    voice_provider: string;
    features: {
        natural_language_ordering: boolean;
        voice_messages: boolean;
        image_recognition: boolean;
        personalized_greetings: boolean;
        recommendations: boolean;
        birthday_offers: boolean;
        real_time_notifications: boolean;
    };
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
        features: {
            natural_language_ordering: false,
            voice_messages: false,
            image_recognition: false,
            personalized_greetings: false,
            recommendations: false,
            birthday_offers: false,
            real_time_notifications: false,
        },
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
                setConfig(restaurantData.ai_config);
            }

            // Fetch providers
            const { data: providersData, error: providersError } = await supabase
                .from('ai_providers')
                .select('provider_type, provider_name, display_name')
                .eq('is_active', true);

            if (providersError) throw providersError;

            setNlpProviders(providersData.filter(p => p.provider_type === 'nlp'));
            setImageProviders(providersData.filter(p => p.provider_type === 'image'));
            setVoiceProviders(providersData.filter(p => p.provider_type === 'voice'));

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

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">AI Configuration</h1>
                    <p className="text-muted-foreground mt-2">{restaurant?.name}</p>
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
                        Turn on AI-powered features for this restaurant
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
                                Choose AI providers for different features
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
                                        {nlpProviders.map((provider) => (
                                            <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                {provider.display_name}
                                            </SelectItem>
                                        ))}
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
                                        {imageProviders.map((provider) => (
                                            <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                {provider.display_name}
                                            </SelectItem>
                                        ))}
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
                                        {voiceProviders.map((provider) => (
                                            <SelectItem key={provider.provider_name} value={provider.provider_name}>
                                                {provider.display_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <CardTitle>Features</CardTitle>
                            <CardDescription>
                                Enable or disable specific AI features
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {Object.entries(config.features).map(([key, value]) => (
                                <div key={key} className="flex items-center justify-between">
                                    <Label htmlFor={key} className="flex-1 cursor-pointer">
                                        {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                                    </Label>
                                    <Switch
                                        id={key}
                                        checked={value}
                                        onCheckedChange={(checked) =>
                                            setConfig({
                                                ...config,
                                                features: { ...config.features, [key]: checked },
                                            })
                                        }
                                    />
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    <APIKeyManagement restaurantId={id!} />
                </>
            )}
        </div>
    );
}
