import { useState, useMemo, useEffect, useRef } from "react";
import { format } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreVertical, RefreshCw, Filter } from "lucide-react";

import { AbuseDetectionStats } from "../components/AbuseDetectionStats";
import { PatternDetectionCards } from "../components/PatternDetectionCards";
import { AbuseAlertDetailsModal } from "../components/AbuseAlertDetailsModal";
import { BulkActionsBar } from "../components/BulkActionsBar";

import {
  AbuseDetection,
  AbuseSeverity,
  AbusePatternType,
  AbuseStatus,
  getSeverityColor,
  getSeverityIcon,
  getPatternTypeLabel,
  getPatternTypeIcon,
  getStatusColor,
  getStatusLabel,
  formatAbuseDetails,
  exportToCSV,
  exportToJSON,
} from "../utils/abuseDetectionHelpers";

type AbuseDetectionWithRestaurant = AbuseDetection & {
  restaurants?: { name: string };
};

export default function SuperAdminAbuse() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filters
  const [severityFilter, setSeverityFilter] = useState<AbuseSeverity | "all">("all");
  const [patternFilter, setPatternFilter] = useState<AbusePatternType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<AbuseStatus | "all">("all");

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedDetection, setSelectedDetection] = useState<AbuseDetectionWithRestaurant | null>(null);
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);

  // Bulk actions
  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Fetch abuse detections
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["superadmin", "abuse-detections", severityFilter, patternFilter, statusFilter],
    queryFn: async () => {
      let query = supabase
        .from("abuse_detections")
        .select(`
          *,
          restaurants(name)
        `)
        .order("detected_at", { ascending: false })
        .limit(500);

      if (severityFilter !== "all") {
        query = query.eq("severity", severityFilter);
      }
      if (patternFilter !== "all") {
        query = query.eq("pattern_type", patternFilter);
      }
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AbuseDetectionWithRestaurant[];
    },
  });

  // Calculate statistics
  const stats = useMemo(() => {
    if (!data) return { activeAlerts: 0, investigating: 0, resolvedToday: 0, criticalAlerts: 0 };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return {
      activeAlerts: data.filter((d) => d.status === "pending").length,
      investigating: data.filter((d) => d.status === "investigating").length,
      resolvedToday: data.filter(
        (d) => d.resolved_at && new Date(d.resolved_at) >= today
      ).length,
      criticalAlerts: data.filter((d) => d.severity === "critical" && d.status === "pending").length,
    };
  }, [data]);

  // Calculate pattern counts
  const patternCounts = useMemo(() => {
    if (!data) return [];

    const counts = new Map<AbusePatternType, number>();
    data.forEach((d) => {
      counts.set(d.pattern_type, (counts.get(d.pattern_type) || 0) + 1);
    });

    return Array.from(counts.entries()).map(([type, detected]) => ({ type, detected }));
  }, [data]);

  // Update detection mutation
  const updateDetectionMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      notes,
    }: {
      id: string;
      status: AbuseStatus;
      notes?: string;
    }) => {
      const updates: any = { status };
      if (notes) updates.notes = notes;
      if (status === "resolved" || status === "false_positive") {
        updates.resolved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("abuse_detections")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "abuse-detections"] });
      toast({ title: "Success", description: "Alert updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update alert",
        variant: "destructive",
      });
    },
  });

  // Suspend restaurant mutation
  const suspendRestaurantMutation = useMutation({
    mutationFn: async (restaurantIds: string[]) => {
      const { error } = await supabase
        .from("restaurants")
        .update({
          status: "suspended",
          suspension_reason: "Abuse detected by automated system",
          suspended_at: new Date().toISOString(),
        })
        .in("id", restaurantIds);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Restaurants suspended successfully" });
      setSelectedIds(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to suspend restaurants",
        variant: "destructive",
      });
    },
  });

  // Whitelist restaurant mutation
  const whitelistRestaurantMutation = useMutation({
    mutationFn: async (restaurantIds: string[]) => {
      const { data: { user } } = await supabase.auth.getUser();

      const records = restaurantIds.map((id) => ({
        restaurant_id: id,
        reason: "Whitelisted via bulk action",
        whitelisted_by: user?.id,
      }));

      const { error } = await supabase.from("abuse_whitelist").upsert(records);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Restaurants whitelisted successfully" });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: ["superadmin", "abuse-detections"] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to whitelist restaurants",
        variant: "destructive",
      });
    },
  });

  // Run detection mutation
  const runDetectionMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("run_all_abuse_detections");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["superadmin", "abuse-detections"] });
      toast({ title: "Success", description: "Detection scan completed" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to run detection",
        variant: "destructive",
      });
    },
  });

  // Handlers
  const handleSelectAll = () => {
    if (selectedIds.size === data?.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(data?.map((d) => d.id) || []));
    }
  };

  const handleSelectOne = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleInvestigate = async (detectionId: string, notes: string) => {
    await updateDetectionMutation.mutateAsync({
      id: detectionId,
      status: "investigating",
      notes,
    });
  };

  const handleResolve = async (detectionId: string, notes: string) => {
    await updateDetectionMutation.mutateAsync({
      id: detectionId,
      status: "resolved",
      notes,
    });
  };

  const handleMarkFalsePositive = async (detectionId: string, notes: string) => {
    await updateDetectionMutation.mutateAsync({
      id: detectionId,
      status: "false_positive",
      notes,
    });
  };

  const handleBulkSuspend = async () => {
    setIsProcessing(true);
    try {
      const restaurantIds = Array.from(selectedIds)
        .map((id) => data?.find((d) => d.id === id)?.restaurant_id)
        .filter(Boolean) as string[];

      await suspendRestaurantMutation.mutateAsync(restaurantIds);
      setSuspendDialogOpen(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkInvestigate = async () => {
    setIsProcessing(true);
    try {
      for (const id of Array.from(selectedIds)) {
        await updateDetectionMutation.mutateAsync({
          id,
          status: "investigating",
        });
      }
      setSelectedIds(new Set());
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkWhitelist = async () => {
    setIsProcessing(true);
    try {
      const restaurantIds = Array.from(selectedIds)
        .map((id) => data?.find((d) => d.id === id)?.restaurant_id)
        .filter(Boolean) as string[];

      await whitelistRestaurantMutation.mutateAsync(restaurantIds);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBulkExport = () => {
    const selectedDetections = data?.filter((d) => selectedIds.has(d.id)) || [];
    exportToCSV(selectedDetections);
  };

  const handleViewDetails = (detection: AbuseDetectionWithRestaurant) => {
    setSelectedDetection(detection);
    setDetailsModalOpen(true);
  };

  // Error toast
  const lastErrorMessageRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isError) return;
    const err = error as any;
    const message = err?.message ?? "Failed to load abuse detections";
    if (lastErrorMessageRef.current === message) return;
    lastErrorMessageRef.current = message;
    toast({ title: "Error", description: message, variant: "destructive" });
  }, [isError, error, toast]);

  return (
    <section className="space-y-6 pb-20">
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Security & Abuse Monitoring</h1>
          <p className="text-sm text-muted-foreground">
            Detect and investigate suspicious activity across the platform
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => runDetectionMutation.mutate()}
            disabled={runDetectionMutation.isPending}
          >
            {runDetectionMutation.isPending ? "Scanning..." : "Run Detection Scan"}
          </Button>
        </div>
      </header>

      {/* Statistics */}
      <AbuseDetectionStats
        activeAlerts={stats.activeAlerts}
        investigating={stats.investigating}
        resolvedToday={stats.resolvedToday}
        criticalAlerts={stats.criticalAlerts}
        isLoading={isLoading}
      />

      {/* Pattern Detection Cards */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Detection Patterns</h2>
        <PatternDetectionCards patterns={patternCounts} isLoading={isLoading} />
      </div>

      {/* Filters and Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Abuse Alerts</CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
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

              <Select value={patternFilter} onValueChange={(v) => setPatternFilter(v as any)}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue placeholder="Pattern Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Patterns</SelectItem>
                  <SelectItem value="excessive_orders">Excessive Orders</SelectItem>
                  <SelectItem value="failed_payments">Failed Payments</SelectItem>
                  <SelectItem value="rapid_creation">Rapid Creation</SelectItem>
                  <SelectItem value="menu_spam">Menu Spam</SelectItem>
                  <SelectItem value="staff_churn">Staff Churn</SelectItem>
                  <SelectItem value="qr_abuse">QR Abuse</SelectItem>
                </SelectContent>
              </Select>

              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
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
          ) : isError ? (
            <div className="text-sm text-muted-foreground text-center py-8">
              Unable to load abuse alerts.
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">
                      <Checkbox
                        checked={selectedIds.size === data?.length && data.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="min-w-[120px]">Severity</TableHead>
                    <TableHead className="min-w-[180px]">Pattern Type</TableHead>
                    <TableHead className="min-w-[200px]">Restaurant</TableHead>
                    <TableHead className="min-w-[220px]">Details</TableHead>
                    <TableHead className="min-w-[120px]">Status</TableHead>
                    <TableHead className="min-w-[160px]">Detected</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {!data || data.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-sm text-muted-foreground text-center py-8">
                        No abuse alerts found. Run a detection scan to check for suspicious activity.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.map((detection) => (
                      <TableRow key={detection.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(detection.id)}
                            onCheckedChange={() => handleSelectOne(detection.id)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge className={getSeverityColor(detection.severity)}>
                            {getSeverityIcon(detection.severity)} {detection.severity}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{getPatternTypeIcon(detection.pattern_type)}</span>
                            <span className="text-sm">{getPatternTypeLabel(detection.pattern_type)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {detection.restaurants?.name || "Unknown"}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatAbuseDetails(detection)}
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(detection.status)}>
                            {getStatusLabel(detection.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {format(new Date(detection.detected_at), "PP p")}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => handleViewDetails(detection)}>
                                View Details
                              </DropdownMenuItem>
                              {detection.status === "pending" && (
                                <DropdownMenuItem
                                  onClick={() => handleInvestigate(detection.id, "")}
                                >
                                  Start Investigation
                                </DropdownMenuItem>
                              )}
                              {detection.status === "investigating" && (
                                <>
                                  <DropdownMenuItem
                                    onClick={() => handleResolve(detection.id, "")}
                                  >
                                    Resolve
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => handleMarkFalsePositive(detection.id, "")}
                                  >
                                    Mark False Positive
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedIds.size}
        onClearSelection={() => setSelectedIds(new Set())}
        onBulkSuspend={() => setSuspendDialogOpen(true)}
        onBulkInvestigate={handleBulkInvestigate}
        onBulkWhitelist={handleBulkWhitelist}
        onBulkExport={handleBulkExport}
        isProcessing={isProcessing}
      />

      {/* Alert Details Modal */}
      <AbuseAlertDetailsModal
        detection={selectedDetection}
        restaurantName={selectedDetection?.restaurants?.name}
        open={detailsModalOpen}
        onOpenChange={setDetailsModalOpen}
        onInvestigate={handleInvestigate}
        onResolve={handleResolve}
        onMarkFalsePositive={handleMarkFalsePositive}
      />

      {/* Suspend Confirmation Dialog */}
      <AlertDialog open={suspendDialogOpen} onOpenChange={setSuspendDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend Restaurants?</AlertDialogTitle>
            <AlertDialogDescription>
              This will suspend {selectedIds.size} restaurant{selectedIds.size > 1 ? "s" : ""}.
              They will not be able to access their accounts until unsuspended.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkSuspend} className="bg-destructive text-destructive-foreground">
              Suspend
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
