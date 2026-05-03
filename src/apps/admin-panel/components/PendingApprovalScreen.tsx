import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Clock, Info, XCircle, AlertTriangle, Send } from "lucide-react";

interface PendingApprovalScreenProps {
    userEmail: string;
}

export function PendingApprovalScreen({ userEmail }: PendingApprovalScreenProps) {
    const [restaurantName, setRestaurantName] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState("");

    const { data: request, refetch } = useQuery({
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

    // Submit a missing request (self-healing for users whose request INSERT failed)
    const handleSubmitRequest = async () => {
        if (!restaurantName.trim()) return;
        setSubmitting(true);
        setSubmitError("");

        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error("Not authenticated");

            const slug = restaurantName
                .toLowerCase()
                .trim()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .replace(/^-|-$/g, '');

            const { error } = await supabase
                .from('restaurant_admin_requests')
                .insert({
                    user_id: user.id,
                    restaurant_name: restaurantName.trim(),
                    restaurant_slug: slug || 'my-restaurant',
                    status: 'pending'
                });

            if (error) throw error;

            refetch();
        } catch (err: any) {
            console.error("Submit request error:", err);
            setSubmitError(err.message || "Failed to submit request");
        } finally {
            setSubmitting(false);
        }
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

    // No request exists — let the user submit one (self-healing)
    if (!request) {
        return (
            <div className="min-h-screen flex items-center justify-center p-6 bg-muted/50">
                <Card className="max-w-md w-full">
                    <CardHeader>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center">
                                <AlertTriangle className="h-6 w-6 text-orange-600" />
                            </div>
                        </div>
                        <CardTitle>Complete Your Application</CardTitle>
                        <CardDescription>
                            Your account was created but the application wasn't fully submitted. Please enter your restaurant details below.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="rest-name">Restaurant Name *</Label>
                            <Input
                                id="rest-name"
                                placeholder="e.g., The Golden Spoon"
                                value={restaurantName}
                                onChange={(e) => setRestaurantName(e.target.value)}
                                required
                            />
                        </div>

                        {submitError && (
                            <Alert variant="destructive">
                                <AlertDescription>{submitError}</AlertDescription>
                            </Alert>
                        )}

                        <Button
                            className="w-full"
                            onClick={handleSubmitRequest}
                            disabled={submitting || !restaurantName.trim()}
                        >
                            <Send className="mr-2 h-4 w-4" />
                            {submitting ? "Submitting..." : "Submit Application"}
                        </Button>

                        <Button variant="outline" className="w-full" onClick={handleSignOut}>
                            Sign Out
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Pending state (request exists)
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
