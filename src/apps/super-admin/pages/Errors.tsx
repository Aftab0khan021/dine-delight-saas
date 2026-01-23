import { useState, useMemo } from "react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, Download, ChevronDown, AlertTriangle, Shield, CreditCard, Server } from "lucide-react";

import {
    ErrorLog,
    ErrorType,
    ErrorSeverity,
    ErrorStatus,
    getErrorSeverityColor,
    getErrorTypeIcon,
    getErrorTypeLabel,
    exportErrorsToCSV,
} from "../utils/supportHelpers";

export default function SuperAdminErrors() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Filters
    const [errorTypeFilter, setErrorTypeFilter] = useState<ErrorType | "all">("all");
    const [severityFilter, setSeverityFilter] = useState<ErrorSeverity | "all">("all");
    const [statusFilter, setStatusFilter] = useState<ErrorStatus | "all">("all");

    // Fetch errors
    const { data: errors, isLoading, refetch } = useQuery({
        queryKey: ["superadmin", "error-logs", errorTypeFilter, severityFilter, statusFilter],
        queryFn: async () => {
            let query = supabase
                .from("error_logs")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(500);

            if (errorTypeFilter !== "all") {
                query = query.eq("error_type", errorTypeFilter);
            }
            if (severityFilter !== "all") {
                query = query.eq("severity", severityFilter);
            }
            if (statusFilter !== "all") {
                query = query.eq("status", statusFilter);
            }

            const { data, error } = await query;
            if (error) throw error;
            return (data || []) as ErrorLog[];
        },
    });

    // Calculate statistics
    const stats = useMemo(() => {
        if (!errors) return { total24h: 0, api: 0, auth: 0, critical: 0 };

        const now = new Date();
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        const total24h = errors.filter((e) => new Date(e.created_at) >= yesterday).length;
        const api = errors.filter((e) => e.error_type === "api").length;
        const auth = errors.filter((e) => e.error_type === "auth").length;
        const critical = errors.filter((e) => e.severity === "critical" && e.status === "new").length;

        return { total24h, api, auth, critical };
    }, [errors]);

    // Mark error as resolved mutation
    const resolveErrorMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase
                .from("error_logs")
                .update({ status: "resolved", resolved_at: new Date().toISOString() })
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["superadmin", "error-logs"] });
            toast({ title: "Success", description: "Error marked as resolved" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to update error",
                variant: "destructive",
            });
        },
    });

    const handleExport = () => {
        if (errors) {
            exportErrorsToCSV(errors);
            toast({ title: "Success", description: "Errors exported to CSV" });
        }
    };

    return (
        <section className="space-y-6">
            <header className="flex items-center justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Error Dashboard</h1>
                    <p className="text-sm text-muted-foreground">
                        Monitor system errors, API failures, and authentication issues
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                </div>
            </header>

            {/* Statistics */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Errors (24h)
                        </CardTitle>
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.total24h}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            API Errors
                        </CardTitle>
                        <Server className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.api}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Auth Failures
                        </CardTitle>
                        <Shield className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.auth}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Critical (New)
                        </CardTitle>
                        <CreditCard className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.critical}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base">Error Logs</CardTitle>
                        <div className="flex items-center gap-2">
                            <Select value={errorTypeFilter} onValueChange={(v) => setErrorTypeFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Error Type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Types</SelectItem>
                                    <SelectItem value="api">API</SelectItem>
                                    <SelectItem value="auth">Authentication</SelectItem>
                                    <SelectItem value="payment">Payment</SelectItem>
                                    <SelectItem value="system">System</SelectItem>
                                    <SelectItem value="database">Database</SelectItem>
                                    <SelectItem value="validation">Validation</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Severity" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Severities</SelectItem>
                                    <SelectItem value="critical">Critical</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="new">New</SelectItem>
                                    <SelectItem value="investigating">Investigating</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="ignored">Ignored</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="space-y-3">
                            {[1, 2, 3, 4].map((i) => (
                                <Skeleton key={i} className="h-12 w-full" />
                            ))}
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {!errors || errors.length === 0 ? (
                                <div className="text-sm text-muted-foreground text-center py-8">
                                    No errors found. System is healthy! 🎉
                                </div>
                            ) : (
                                errors.map((error) => (
                                    <Collapsible key={error.id}>
                                        <Card className="border-l-4" style={{
                                            borderLeftColor: error.severity === 'critical' ? '#ef4444' :
                                                error.severity === 'high' ? '#f97316' :
                                                    error.severity === 'medium' ? '#eab308' : '#3b82f6'
                                        }}>
                                            <CollapsibleTrigger className="w-full">
                                                <div className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                                                    <div className="flex items-center gap-3 flex-1">
                                                        <span className="text-2xl">{getErrorTypeIcon(error.error_type)}</span>
                                                        <div className="flex flex-col items-start gap-1">
                                                            <div className="flex items-center gap-2">
                                                                <Badge className={getErrorSeverityColor(error.severity)}>
                                                                    {error.severity}
                                                                </Badge>
                                                                <Badge variant="outline">
                                                                    {getErrorTypeLabel(error.error_type)}
                                                                </Badge>
                                                                {error.status_code && (
                                                                    <Badge variant="outline">{error.status_code}</Badge>
                                                                )}
                                                            </div>
                                                            <p className="text-sm font-medium text-left">{error.message}</p>
                                                            {error.endpoint && (
                                                                <p className="text-xs text-muted-foreground">
                                                                    {error.method} {error.endpoint}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-muted-foreground">
                                                            {format(new Date(error.created_at), "PP p")}
                                                        </span>
                                                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                    </div>
                                                </div>
                                            </CollapsibleTrigger>
                                            <CollapsibleContent>
                                                <div className="border-t p-4 space-y-3 bg-muted/20">
                                                    {error.stack_trace && (
                                                        <div>
                                                            <h4 className="text-sm font-semibold mb-2">Stack Trace</h4>
                                                            <pre className="text-xs bg-black text-green-400 p-3 rounded overflow-x-auto">
                                                                {error.stack_trace}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {error.metadata && Object.keys(error.metadata).length > 0 && (
                                                        <div>
                                                            <h4 className="text-sm font-semibold mb-2">Metadata</h4>
                                                            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                                                                {JSON.stringify(error.metadata, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    <div className="flex gap-2">
                                                        {error.status === "new" && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => resolveErrorMutation.mutate(error.id)}
                                                            >
                                                                Mark as Resolved
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </CollapsibleContent>
                                        </Card>
                                    </Collapsible>
                                ))
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </section>
    );
}
