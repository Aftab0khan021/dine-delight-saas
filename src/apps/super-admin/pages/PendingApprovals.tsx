import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Check, X, Clock, Building2 } from "lucide-react";
import { DenyDialog } from "../components/DenyDialog";

export default function PendingApprovals() {
    const { toast } = useToast();
    const [approvingId, setApprovingId] = useState<string | null>(null);

    const { data: requests, refetch } = useQuery({
        queryKey: ['pending-requests'],
        queryFn: async () => {
            const { data, error } = await supabase
                .from('restaurant_admin_requests')
                .select(`
          *,
          profiles:user_id (email, full_name)
        `)
                .eq('status', 'pending')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return data || [];
        }
    });

    const handleApprove = async (request: any) => {
        try {
            setApprovingId(request.id);
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Update profile status to active
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ account_status: 'active' })
                .eq('id', request.user_id);

            if (profileError) throw profileError;

            // 2. Update request status to approved
            const { error: requestError } = await supabase
                .from('restaurant_admin_requests')
                .update({
                    status: 'approved',
                    reviewed_by: user?.id,
                    reviewed_at: new Date().toISOString()
                })
                .eq('id', request.id);

            if (requestError) throw requestError;

            // 3. TODO: Send approval email (via Edge Function)
            // await supabase.functions.invoke('send-approval-email', {
            //   body: { userId: request.user_id, approved: true }
            // });

            toast({
                title: "Request Approved",
                description: `${request.profiles.email} can now create their restaurant.`,
            });

            refetch();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setApprovingId(null);
        }
    };

    const handleDeny = async (request: any, reason: string) => {
        try {
            const { data: { user } } = await supabase.auth.getUser();

            // 1. Update profile status to denied
            const { error: profileError } = await supabase
                .from('profiles')
                .update({ account_status: 'denied' })
                .eq('id', request.user_id);

            if (profileError) throw profileError;

            // 2. Update request status to denied with reason
            const { error: requestError } = await supabase
                .from('restaurant_admin_requests')
                .update({
                    status: 'denied',
                    reviewed_by: user?.id,
                    reviewed_at: new Date().toISOString(),
                    denial_reason: reason
                })
                .eq('id', request.id);

            if (requestError) throw requestError;

            // 3. TODO: Send denial email (via Edge Function)
            // await supabase.functions.invoke('send-approval-email', {
            //   body: { userId: request.user_id, approved: false, reason }
            // });

            toast({
                title: "Request Denied",
                description: `${request.profiles.email} has been notified.`,
            });

            refetch();
        } catch (error: any) {
            toast({
                title: "Error",
                description: error.message,
                variant: "destructive",
            });
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Pending Approvals</h1>
                <p className="text-muted-foreground mt-2">
                    Review and approve restaurant admin applications
                </p>
            </div>

            {requests && requests.length === 0 && (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                        <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                        <p className="text-lg font-medium">No pending requests</p>
                        <p className="text-sm text-muted-foreground">
                            All applications have been reviewed
                        </p>
                    </CardContent>
                </Card>
            )}

            <div className="grid gap-4">
                {requests?.map((request) => (
                    <Card key={request.id}>
                        <CardHeader>
                            <div className="flex items-start justify-between">
                                <div className="flex items-start gap-3">
                                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Building2 className="h-6 w-6 text-primary" />
                                    </div>
                                    <div>
                                        <CardTitle className="text-xl">{request.restaurant_name}</CardTitle>
                                        <CardDescription className="mt-1">
                                            {request.profiles.full_name} • {request.profiles.email}
                                        </CardDescription>
                                    </div>
                                </div>
                                <Badge variant="secondary" className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Pending
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                {request.business_type && (
                                    <div>
                                        <span className="text-muted-foreground block mb-1">Business Type</span>
                                        <p className="font-medium capitalize">{request.business_type}</p>
                                    </div>
                                )}
                                {request.phone && (
                                    <div>
                                        <span className="text-muted-foreground block mb-1">Phone</span>
                                        <p className="font-medium">{request.phone}</p>
                                    </div>
                                )}
                                <div>
                                    <span className="text-muted-foreground block mb-1">Submitted</span>
                                    <p className="font-medium">
                                        {new Date(request.created_at).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric'
                                        })}
                                    </p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">Slug</span>
                                    <p className="font-medium font-mono text-xs">{request.restaurant_slug}</p>
                                </div>
                            </div>

                            <div className="flex gap-2 pt-2">
                                <Button
                                    onClick={() => handleApprove(request)}
                                    disabled={approvingId === request.id}
                                    className="flex-1"
                                >
                                    <Check className="mr-2 h-4 w-4" />
                                    {approvingId === request.id ? "Approving..." : "Approve"}
                                </Button>
                                <DenyDialog
                                    onDeny={(reason) => handleDeny(request, reason)}
                                    restaurantName={request.restaurant_name}
                                />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}
