import { useState, useMemo, useRef, useEffect } from "react";
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
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { MoreVertical, Plus, RefreshCw, Download, Ticket, MessageCircle, ThumbsUp, ThumbsDown } from "lucide-react";

import { SLAIndicator } from "../components/SLAIndicator";
import {
    SupportTicket,
    TicketStatus,
    TicketPriority,
    getPriorityColor,
    getStatusColor,
    getStatusLabel,
    calculateSLAStatus,
    exportTicketsToCSV,
    formatTimeRemaining,
} from "../utils/supportHelpers";

type TicketWithRestaurant = SupportTicket & {
    restaurants?: { name: string };
};

// ─── Chat log types ─────────────────────────────────────────────────────────
type ChatMessage = { id: number; text: string; from: "user" | "agent"; time: string; reaction?: "up" | "down" | null };
type ChatTicket = { id: string; subject: string; created_at: string; updated_at: string; restaurant_id: string | null; restaurants?: { name: string }; metadata: { chat_messages?: ChatMessage[]; source?: string; satisfaction?: string; updated_at?: string } | null };

export default function SuperAdminSupport() {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Tab state
    const [activeTab, setActiveTab] = useState<"tickets" | "chats">("tickets");

    // Filters
    const [statusFilter, setStatusFilter] = useState<TicketStatus | "all">("all");
    const [priorityFilter, setPriorityFilter] = useState<TicketPriority | "all">("all");
    const [slaFilter, setSlaFilter] = useState<"all" | "on-time" | "at-risk" | "breached">("all");

    // Create ticket modal
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [selectedTicket, setSelectedTicket] = useState<TicketWithRestaurant | null>(null);
    const [newTicket, setNewTicket] = useState({
        subject: "",
        description: "",
        priority: "medium" as TicketPriority,
        restaurant_id: "",
    });

    // Fetch tickets
    const { data: tickets, isLoading, isFetching, refetch } = useQuery({
        queryKey: ["superadmin", "support-tickets", statusFilter, priorityFilter, slaFilter],
        queryFn: async () => {
            let query = supabase
                .from("support_tickets")
                .select(`
          *,
          restaurants(name)
        `)
                .order("created_at", { ascending: false })
                .limit(500);

            if (statusFilter !== "all") {
                query = query.eq("status", statusFilter);
            }
            if (priorityFilter !== "all") {
                query = query.eq("priority", priorityFilter);
            }

            const { data, error } = await query;
            if (error) throw error;

            let results = (data || []) as TicketWithRestaurant[];

            // Filter by SLA status (client-side since it's calculated)
            if (slaFilter !== "all") {
                results = results.filter((ticket) => {
                    const sla = calculateSLAStatus(ticket);
                    return sla.status === slaFilter;
                });
            }

            return results;
        },
    });

    // Calculate statistics
    const stats = useMemo(() => {
        if (!tickets) return { open: 0, inProgress: 0, breached: 0, avgResolution: 0 };

        const open = tickets.filter((t) => t.status === "open").length;
        const inProgress = tickets.filter((t) => t.status === "in_progress").length;
        const breached = tickets.filter((t) => t.sla_breached && t.status !== "resolved" && t.status !== "closed").length;

        const resolvedTickets = tickets.filter((t) => t.resolution_time_minutes !== null);
        const avgResolution = resolvedTickets.length > 0
            ? resolvedTickets.reduce((sum, t) => sum + (t.resolution_time_minutes || 0), 0) / resolvedTickets.length
            : 0;

        return { open, inProgress, breached, avgResolution };
    }, [tickets]);

    // Update ticket status mutation
    const updateStatusMutation = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: TicketStatus }) => {
            const updates: Record<string, unknown> = { status };
            if (status === "resolved") {
                updates.resolved_at = new Date().toISOString();
            }

            const { error } = await supabase
                .from("support_tickets")
                .update(updates)
                .eq("id", id);

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["superadmin", "support-tickets"] });
            toast({ title: "Success", description: "Ticket status updated" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to update ticket",
                variant: "destructive",
            });
        },
    });

    // Create ticket mutation
    const createTicketMutation = useMutation({
        mutationFn: async (ticket: typeof newTicket) => {
            const { data: { user } } = await supabase.auth.getUser();
            const { error } = await supabase
                .from("support_tickets")
                .insert({
                    subject: ticket.subject,
                    description: ticket.description,
                    priority: ticket.priority,
                    restaurant_id: ticket.restaurant_id || null,
                    created_by: user?.id,
                    status: "open",
                });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["superadmin", "support-tickets"] });
            toast({ title: "Success", description: "Ticket created successfully" });
            setCreateModalOpen(false);
            setNewTicket({ subject: "", description: "", priority: "medium", restaurant_id: "" });
        },
        onError: (error: any) => {
            toast({
                title: "Error",
                description: error.message || "Failed to create ticket",
                variant: "destructive",
            });
        },
    });

    const handleCreateTicket = () => {
        if (!newTicket.subject.trim()) {
            toast({ title: "Error", description: "Subject is required", variant: "destructive" });
            return;
        }
        createTicketMutation.mutate(newTicket);
    };

    const handleExport = () => {
        if (tickets) {
            exportTicketsToCSV(tickets);
            toast({ title: "Success", description: "Tickets exported to CSV" });
        }
    };

    // ─── Chat Logs query ─────────────────────────────────────────────────────
    const { data: chatLogs, isLoading: chatsLoading } = useQuery({
        queryKey: ["superadmin", "chat-logs"],
        enabled: activeTab === "chats",
        queryFn: async () => {
            const { data, error } = await supabase
                .from("support_tickets")
                .select(`*, restaurants(name)`)
                .like("subject", "Chat Support%")
                .order("updated_at", { ascending: false })
                .limit(200);
            if (error) throw error;
            return (data || []) as ChatTicket[];
        },
    });

    const [selectedChat, setSelectedChat] = useState<ChatTicket | null>(null);
    const chatBottomRef = useRef<HTMLDivElement>(null);
    useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [selectedChat]);

    // Chat stats
    const chatStats = useMemo(() => {
        if (!chatLogs) return { total: 0, positive: 0, negative: 0, avgMsgs: 0 };
        let positive = 0, negative = 0, totalMsgs = 0;
        chatLogs.forEach(c => {
            const msgs = (c.metadata as any)?.chat_messages || [];
            totalMsgs += msgs.length;
            msgs.forEach((m: ChatMessage) => { if (m.reaction === "up") positive++; if (m.reaction === "down") negative++; });
        });
        return { total: chatLogs.length, positive, negative, avgMsgs: chatLogs.length ? Math.round(totalMsgs / chatLogs.length) : 0 };
    }, [chatLogs]);

    return (
        <section className="flex flex-col gap-4 w-full">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="space-y-1">
                    <h1 className="text-2xl font-semibold tracking-tight">Support & Chat Logs</h1>
                    <p className="text-sm text-muted-foreground">
                        Manage support tickets and view chatbot conversations
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => refetch()}>
                        <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleExport}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                    </Button>
                    <Button size="sm" onClick={() => setCreateModalOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        New Ticket
                    </Button>
                </div>
            </header>

            {/* Tab Toggle */}
            <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                <button onClick={() => setActiveTab("tickets")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "tickets" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}>
                    <Ticket className="h-4 w-4 inline mr-1.5" />Tickets
                </button>
                <button onClick={() => setActiveTab("chats")} className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === "chats" ? "bg-background shadow-sm" : "hover:bg-background/50"}`}>
                    <MessageCircle className="h-4 w-4 inline mr-1.5" />Chat Logs
                </button>
            </div>

            {activeTab === "tickets" && (<>
            {/* Statistics */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Open Tickets
                        </CardTitle>
                        <Ticket className="h-4 w-4 text-yellow-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.open}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            In Progress
                        </CardTitle>
                        <Ticket className="h-4 w-4 text-blue-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.inProgress}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            SLA Breached
                        </CardTitle>
                        <Ticket className="h-4 w-4 text-red-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-red-600">{stats.breached}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                            Avg Resolution
                        </CardTitle>
                        <Ticket className="h-4 w-4 text-green-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {stats.avgResolution > 0 ? formatTimeRemaining(stats.avgResolution) : "—"}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Filters and Table */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                        <CardTitle className="text-base">All Tickets</CardTitle>
                        <div className="flex flex-wrap items-center gap-2">
                            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Statuses</SelectItem>
                                    <SelectItem value="open">Open</SelectItem>
                                    <SelectItem value="in_progress">In Progress</SelectItem>
                                    <SelectItem value="resolved">Resolved</SelectItem>
                                    <SelectItem value="closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="Priority" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Priorities</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="low">Low</SelectItem>
                                </SelectContent>
                            </Select>

                            <Select value={slaFilter} onValueChange={(v) => setSlaFilter(v as any)}>
                                <SelectTrigger className="w-[140px] h-8">
                                    <SelectValue placeholder="SLA Status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All SLA</SelectItem>
                                    <SelectItem value="on-time">On Time</SelectItem>
                                    <SelectItem value="at-risk">At Risk</SelectItem>
                                    <SelectItem value="breached">Breached</SelectItem>
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
                        <div className="w-full overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="min-w-[80px]">Priority</TableHead>
                                        <TableHead className="min-w-[300px]">Subject</TableHead>
                                        <TableHead className="min-w-[180px]">Restaurant</TableHead>
                                        <TableHead className="min-w-[120px]">Status</TableHead>
                                        <TableHead className="min-w-[180px]">SLA</TableHead>
                                        <TableHead className="min-w-[160px]">Created</TableHead>
                                        <TableHead className="w-12"></TableHead>
                                    </TableRow>
                                </TableHeader>

                                <TableBody>
                                    {!tickets || tickets.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-sm text-muted-foreground text-center py-8">
                                                No support tickets found.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        tickets.map((ticket) => (
                                            <TableRow key={ticket.id}>
                                                <TableCell>
                                                    <Badge className={getPriorityColor(ticket.priority)}>
                                                        {ticket.priority}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">{ticket.subject}</TableCell>
                                                <TableCell className="text-sm">
                                                    {ticket.restaurants?.name || "—"}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={getStatusColor(ticket.status)}>
                                                        {getStatusLabel(ticket.status)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    <SLAIndicator ticket={ticket} />
                                                </TableCell>
                                                <TableCell className="text-sm">
                                                    {format(new Date(ticket.created_at), "PP p")}
                                                </TableCell>
                                                <TableCell>
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm">
                                                                <MoreVertical className="h-4 w-4" />
                                                            </Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent align="end">
                                                            <DropdownMenuItem onClick={() => setSelectedTicket(ticket)}>
                                                                View Details
                                                            </DropdownMenuItem>
                                                            {ticket.status === "open" && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        updateStatusMutation.mutate({
                                                                            id: ticket.id,
                                                                            status: "in_progress",
                                                                        })
                                                                    }
                                                                >
                                                                    Start Progress
                                                                </DropdownMenuItem>
                                                            )}
                                                            {ticket.status === "in_progress" && (
                                                                <DropdownMenuItem
                                                                    onClick={() =>
                                                                        updateStatusMutation.mutate({
                                                                            id: ticket.id,
                                                                            status: "resolved",
                                                                        })
                                                                    }
                                                                >
                                                                    Mark Resolved
                                                                </DropdownMenuItem>
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
            {/* Create Ticket Modal */}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Support Ticket</DialogTitle>
                        <DialogDescription>
                            Create a new support ticket for a restaurant or general issue.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="subject">Subject *</Label>
                            <Input
                                id="subject"
                                placeholder="Brief description of the issue"
                                value={newTicket.subject}
                                onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label htmlFor="description">Description</Label>
                            <Textarea
                                id="description"
                                placeholder="Detailed description of the issue"
                                value={newTicket.description}
                                onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                                rows={4}
                            />
                        </div>
                        <div>
                            <Label htmlFor="priority">Priority</Label>
                            <Select
                                value={newTicket.priority}
                                onValueChange={(v) => setNewTicket({ ...newTicket, priority: v as TicketPriority })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="low">Low</SelectItem>
                                    <SelectItem value="medium">Medium</SelectItem>
                                    <SelectItem value="high">High</SelectItem>
                                    <SelectItem value="urgent">Urgent</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="restaurant_id">Restaurant ID (Optional)</Label>
                            <Input
                                id="restaurant_id"
                                placeholder="Leave empty for general issues"
                                value={newTicket.restaurant_id}
                                onChange={(e) => setNewTicket({ ...newTicket, restaurant_id: e.target.value })}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateTicket} disabled={createTicketMutation.isPending}>
                            {createTicketMutation.isPending ? "Creating..." : "Create Ticket"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Ticket Detail Dialog */}
            <Dialog open={!!selectedTicket} onOpenChange={(o) => !o && setSelectedTicket(null)}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Badge className={getPriorityColor(selectedTicket?.priority ?? 'medium')}>
                                {selectedTicket?.priority}
                            </Badge>
                            {selectedTicket?.subject}
                        </DialogTitle>
                        <DialogDescription>
                            Ticket #{selectedTicket?.id?.slice(0, 8).toUpperCase()} · {selectedTicket?.restaurants?.name ?? 'General'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                            <Badge className={getStatusColor(selectedTicket?.status ?? 'open')}>
                                {getStatusLabel(selectedTicket?.status ?? 'open')}
                            </Badge>
                            {selectedTicket && <SLAIndicator ticket={selectedTicket} />}
                        </div>
                        {selectedTicket?.description && (
                            <div>
                                <p className="text-xs text-muted-foreground mb-1 font-medium uppercase tracking-wide">Description</p>
                                <p className="text-sm bg-muted/40 rounded p-3 whitespace-pre-wrap">{selectedTicket.description}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                                <p className="text-xs text-muted-foreground">Created</p>
                                <p>{selectedTicket ? format(new Date(selectedTicket.created_at), 'PP p') : '—'}</p>
                            </div>
                            {selectedTicket?.resolved_at && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Resolved</p>
                                    <p>{format(new Date(selectedTicket.resolved_at), 'PP p')}</p>
                                </div>
                            )}
                            {selectedTicket?.resolution_time_minutes && (
                                <div>
                                    <p className="text-xs text-muted-foreground">Resolution Time</p>
                                    <p>{formatTimeRemaining(selectedTicket.resolution_time_minutes)}</p>
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedTicket(null)}>Close</Button>
                        {selectedTicket?.status === 'open' && (
                            <Button onClick={() => {
                                updateStatusMutation.mutate({ id: selectedTicket.id, status: 'in_progress' });
                                setSelectedTicket(null);
                            }}>Start Progress</Button>
                        )}
                        {selectedTicket?.status === 'in_progress' && (
                            <Button onClick={() => {
                                updateStatusMutation.mutate({ id: selectedTicket.id, status: 'resolved' });
                                setSelectedTicket(null);
                            }}>Mark Resolved</Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            </>)}

            {/* ═══════════ CHAT LOGS TAB ═══════════ */}
            {activeTab === "chats" && (<>
            {/* Chat Stats */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Chats</CardTitle><MessageCircle className="h-4 w-4 text-blue-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{chatStats.total}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Avg Messages</CardTitle><MessageCircle className="h-4 w-4 text-purple-600" /></CardHeader><CardContent><div className="text-2xl font-bold">{chatStats.avgMsgs}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Positive Reactions</CardTitle><ThumbsUp className="h-4 w-4 text-green-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-green-600">{chatStats.positive}</div></CardContent></Card>
                <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Negative Reactions</CardTitle><ThumbsDown className="h-4 w-4 text-red-600" /></CardHeader><CardContent><div className="text-2xl font-bold text-red-600">{chatStats.negative}</div></CardContent></Card>
            </div>

            {/* Chat Logs Table */}
            <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Chat Conversations</CardTitle></CardHeader>
                <CardContent>
                    {chatsLoading ? (
                        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                    ) : (
                        <div className="w-full overflow-x-auto">
                            <Table>
                                <TableHeader><TableRow>
                                    <TableHead className="min-w-[200px]">Restaurant</TableHead>
                                    <TableHead className="min-w-[80px]">Messages</TableHead>
                                    <TableHead className="min-w-[100px]">Reactions</TableHead>
                                    <TableHead className="min-w-[160px]">Last Active</TableHead>
                                    <TableHead className="w-24"></TableHead>
                                </TableRow></TableHeader>
                                <TableBody>
                                    {(!chatLogs || chatLogs.length === 0) ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No chat logs found.</TableCell></TableRow>
                                    ) : chatLogs.map(chat => {
                                        const msgs: ChatMessage[] = (chat.metadata as any)?.chat_messages || [];
                                        const ups = msgs.filter(m => m.reaction === "up").length;
                                        const downs = msgs.filter(m => m.reaction === "down").length;
                                        return (
                                            <TableRow key={chat.id}>
                                                <TableCell className="font-medium">{chat.restaurants?.name || "Unknown"}</TableCell>
                                                <TableCell>{msgs.length}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2 text-xs">
                                                        {ups > 0 && <span className="text-green-600 flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{ups}</span>}
                                                        {downs > 0 && <span className="text-red-600 flex items-center gap-0.5"><ThumbsDown className="h-3 w-3" />{downs}</span>}
                                                        {ups === 0 && downs === 0 && <span className="text-muted-foreground">—</span>}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-sm">{chat.updated_at ? format(new Date(chat.updated_at), "PP p") : "—"}</TableCell>
                                                <TableCell>
                                                    <Button size="sm" variant="outline" onClick={() => setSelectedChat(chat)}>View</Button>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Chat Transcript Dialog */}
            <Dialog open={!!selectedChat} onOpenChange={o => !o && setSelectedChat(null)}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <MessageCircle className="h-5 w-5 text-primary" />
                            {selectedChat?.restaurants?.name || "Chat"}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedChat?.created_at ? format(new Date(selectedChat.created_at), "PPP p") : ""}
                            {" · "}{((selectedChat?.metadata as any)?.chat_messages || []).length} messages
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto space-y-3 py-3 px-1 min-h-[200px] max-h-[50vh]">
                        {((selectedChat?.metadata as any)?.chat_messages || []).map((msg: ChatMessage) => (
                            <div key={msg.id} className={`flex gap-2 ${msg.from === "user" ? "justify-end" : "justify-start"}`}>
                                {msg.from === "agent" && <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">S</div>}
                                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                                    msg.from === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm"
                                }`}>
                                    {msg.text}
                                    <div className={`text-[9px] mt-1 opacity-60 flex items-center gap-1.5 ${msg.from === "user" ? "justify-end" : ""}`}>
                                        {msg.time}
                                        {msg.reaction === "up" && <ThumbsUp className="h-2.5 w-2.5 text-green-500" />}
                                        {msg.reaction === "down" && <ThumbsDown className="h-2.5 w-2.5 text-red-500" />}
                                    </div>
                                </div>
                            </div>
                        ))}
                        <div ref={chatBottomRef} />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setSelectedChat(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            </>)}
        </section>
    );
}
