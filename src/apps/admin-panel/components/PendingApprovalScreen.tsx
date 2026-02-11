import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Clock, Info, XCircle } from "lucide-react";

interface PendingApprovalScreenProps {
    userEmail: string;
}

export function PendingApprovalScreen({ userEmail }: PendingApprovalScreenProps) {
    const { data: request } = useQuery({
        queryKey: ['admin-request'],
        queryFn: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return null;

            const { data } = await supabase
                .from('restaurant_admin_requests')
                .select('*')
                .eq('user_id', user.id)
                .maybeSingle();
            return data;
        },
        refetchInterval: 30000, // Refresh every 30 seconds
    });

    const handleSignOut = async () => {
        await supabase.auth.signOut();
        window.location.href = '/admin/auth';
    };

    // Denied state
    if (request?.status === 'denied') {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-muted/50">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-12 w-12 rounded-full bg-destructive/10 flex items-center justify-center">
                                <XCircle className="h-6 w-6 text-destructive" />
                            </div>
                        </div>
                        <CardTitle className="text-destructive">Application Denied</CardTitle>
                        <CardDescription>Your restaurant admin request was not approved</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Unfortunately, your application to become a restaurant admin was not approved at this time.
                        </p>

                        {request.denial_reason && (
                            <Alert variant="destructive">
                                <AlertTitle>Reason for Denial</AlertTitle>
                                <AlertDescription className="mt-2">
                                    {request.denial_reason}
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="text-sm space-y-2 pt-2">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Restaurant:</span>
                                <span className="font-medium">{request.restaurant_name}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Reviewed:</span>
                                <span className="font-medium">
                                    {request.reviewed_at ? new Date(request.reviewed_at).toLocaleDateString() : 'N/A'}
                                </span>
                            </div>
                        </div>

                        <Button variant="outline" className="w-full" onClick={handleSignOut}>
                            Sign Out
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Pending state
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-muted/50">
            <Card className="max-w-md w-full">
                <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-12 w-12 rounded-full bg-yellow-100 flex items-center justify-center">
                            <Clock className="h-6 w-6 text-yellow-600 animate-pulse" />
                        </div>
                    </div>
                    <CardTitle>Pending Approval</CardTitle>
                    <CardDescription>Your application is being reviewed by our team</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" />
                            <p className="text-sm font-medium">Application Submitted</p>
                        </div>
                        <p className="text-sm text-muted-foreground pl-4">{userEmail}</p>
                    </div>

                    {request && (
                        <div className="space-y-2 text-sm border-t pt-4">
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Restaurant Name:</span>
                                <span className="font-medium">{request.restaurant_name}</span>
                            </div>
                            {request.business_type && (
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Business Type:</span>
                                    <span className="font-medium capitalize">{request.business_type}</span>
                                </div>
                            )}
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Submitted:</span>
                                <span className="font-medium">{new Date(request.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    )}

                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            Our team typically reviews applications within 24-48 hours. You'll receive an email notification once a decision has been made.
                        </AlertDescription>
                    </Alert>

                    <div className="pt-2 space-y-2">
                        <p className="text-xs text-muted-foreground text-center">
                            This page will automatically refresh. You can also close this window and check back later.
                        </p>
                        <Button variant="outline" className="w-full" onClick={handleSignOut}>
                            Sign Out
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
