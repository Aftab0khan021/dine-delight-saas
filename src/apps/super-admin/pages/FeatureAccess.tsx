import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Search, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface FeatureAccess {
    restaurant_id: string;
    restaurant_name: string;
    restaurant_slug: string;
    feature_key: string;
    feature_name: string;
    plan_name: string | null;
    is_enabled: boolean;
    source: 'override' | 'plan' | 'global' | 'default';
}

export default function FeatureAccess() {
    const [searchQuery, setSearchQuery] = useState("");
    const [sourceFilter, setSourceFilter] = useState<string>("all");
    const [statusFilter, setStatusFilter] = useState<string>("all");

    // Fetch feature access matrix
    const { data: accessData, isLoading } = useQuery({
        queryKey: ['restaurant-feature-access'],
        queryFn: async () => {
            const { data, error } = await (supabase as any)
                .from('restaurant_feature_access')
                .select('*')
                .order('restaurant_name')
                .order('feature_name');

            if (error) throw error;
            return data as FeatureAccess[];
        },
    });

    // Filter data
    const filteredData = accessData?.filter((row) => {
        const matchesSearch =
            row.restaurant_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            row.feature_name.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesSource = sourceFilter === 'all' || row.source === sourceFilter;
        const matchesStatus =
            statusFilter === 'all' ||
            (statusFilter === 'enabled' && row.is_enabled) ||
            (statusFilter === 'disabled' && !row.is_enabled);

        return matchesSearch && matchesSource && matchesStatus;
    });

    const getSourceBadge = (source: string) => {
        const variants = {
            override: 'destructive',
            plan: 'default',
            global: 'secondary',
            default: 'outline',
        } as const;

        return (
            <Badge variant={variants[source as keyof typeof variants] || 'outline'}>
                {source}
            </Badge>
        );
    };

    return (
        <section className="space-y-6">
            <header>
                <h1 className="text-2xl font-semibold tracking-tight">Feature Access Matrix</h1>
                <p className="text-sm text-muted-foreground">
                    View feature access for all restaurants with source attribution
                </p>
            </header>

            {/* Filters */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                        <Filter className="h-4 w-4" />
                        Filters
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 md:grid-cols-4">
                        {/* Search */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search restaurant or feature..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9"
                            />
                            {searchQuery && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                                    onClick={() => setSearchQuery("")}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            )}
                        </div>

                        {/* Source Filter */}
                        <Select value={sourceFilter} onValueChange={setSourceFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Sources" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Sources</SelectItem>
                                <SelectItem value="override">Override</SelectItem>
                                <SelectItem value="plan">Plan</SelectItem>
                                <SelectItem value="global">Global</SelectItem>
                                <SelectItem value="default">Default</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Status Filter */}
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger>
                                <SelectValue placeholder="All Statuses" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                <SelectItem value="enabled">Enabled</SelectItem>
                                <SelectItem value="disabled">Disabled</SelectItem>
                            </SelectContent>
                        </Select>

                        {/* Clear Filters */}
                        {(searchQuery || sourceFilter !== 'all' || statusFilter !== 'all') && (
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearchQuery("");
                                    setSourceFilter("all");
                                    setStatusFilter("all");
                                }}
                            >
                                Clear Filters
                            </Button>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Access Matrix */}
            <Card>
                <CardHeader>
                    <CardTitle>Access Matrix</CardTitle>
                    <CardDescription>
                        {filteredData?.length || 0} feature access records
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Restaurant</TableHead>
                                <TableHead>Plan</TableHead>
                                <TableHead>Feature</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Source</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {isLoading ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8">
                                        Loading...
                                    </TableCell>
                                </TableRow>
                            ) : filteredData?.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                        No feature access records found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredData?.map((row, idx) => (
                                    <TableRow key={`${row.restaurant_id}-${row.feature_key}-${idx}`}>
                                        <TableCell>
                                            <div>
                                                <div className="font-medium">{row.restaurant_name}</div>
                                                <div className="text-sm text-muted-foreground">
                                                    /{row.restaurant_slug}
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            {row.plan_name ? (
                                                <Badge variant="outline">{row.plan_name}</Badge>
                                            ) : (
                                                <span className="text-muted-foreground text-sm">No plan</span>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <div className="font-mono text-sm">{row.feature_name}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={row.is_enabled ? "default" : "secondary"}>
                                                {row.is_enabled ? "Enabled" : "Disabled"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {getSourceBadge(row.source)}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Legend */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Source Legend</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid gap-2 md:grid-cols-2">
                        <div className="flex items-center gap-2">
                            <Badge variant="destructive">override</Badge>
                            <span className="text-sm text-muted-foreground">
                                Restaurant-specific override (highest priority)
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="default">plan</Badge>
                            <span className="text-sm text-muted-foreground">
                                Feature included in subscription plan
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary">global</Badge>
                            <span className="text-sm text-muted-foreground">
                                Global feature flag setting
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline">default</Badge>
                            <span className="text-sm text-muted-foreground">
                                Default disabled (no configuration)
                            </span>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </section>
    );
}
