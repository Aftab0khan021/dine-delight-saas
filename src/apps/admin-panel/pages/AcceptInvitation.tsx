import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function AcceptInvitation() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const [invitationData, setInvitationData] = useState<any>(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [settingPassword, setSettingPassword] = useState(false);

    useEffect(() => {
        verifyToken();
    }, []);

    const verifyToken = async () => {
        const token = searchParams.get("token");

        if (!token) {
            setError("Invalid invitation link. No token provided.");
            setLoading(false);
            return;
        }

        try {
            // Verify token in database
            const { data, error: tokenError } = await supabase
                .from("invitation_tokens")
                .select("*")
                .eq("token", token)
                .is("used_at", null)
                .gt("expires_at", new Date().toISOString())
                .single();

            if (tokenError || !data) {
                if (tokenError?.code === "PGRST116") {
                    // Check if token was used
                    const { data: usedToken } = await supabase
                        .from("invitation_tokens")
                        .select("used_at")
                        .eq("token", token)
                        .single();

                    if (usedToken?.used_at) {
                        setError("This invitation has already been used.");
                    } else {
                        setError("This invitation has expired or is invalid.");
                    }
                } else {
                    setError("Invalid invitation link.");
                }
                setLoading(false);
                return;
            }

            setInvitationData(data);
            setLoading(false);
        } catch (err: any) {
            console.error("Token verification error:", err);
            setError("Failed to verify invitation. Please try again.");
            setLoading(false);
        }
    };

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (password.length < 8) {
            setError("Password must be at least 8 characters long.");
            return;
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match.");
            return;
        }

        setSettingPassword(true);

        try {
            const token = searchParams.get("token");

            // Create user account with password
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: invitationData.email,
                password: password,
                options: {
                    data: {
                        restaurant_id: invitationData.restaurant_id,
                        staff_category_id: invitationData.staff_category_id,
                        role: invitationData.role,
                    },
                },
            });

            if (signUpError) {
                console.error("Sign up error:", signUpError);
                setError(signUpError.message);
                setSettingPassword(false);
                return;
            }

            if (!authData.user) {
                setError("Failed to create account. Please try again.");
                setSettingPassword(false);
                return;
            }

            // Mark token as used
            const { error: updateError } = await supabase
                .from("invitation_tokens")
                .update({ used_at: new Date().toISOString() })
                .eq("token", token);

            if (updateError) {
                console.error("Token update error:", updateError);
                // Non-critical, continue
            }

            // Update staff_invites status
            await supabase
                .from("staff_invites")
                .update({ status: 'accepted' })
                .eq("email", invitationData.email)
                .eq("restaurant_id", invitationData.restaurant_id);

            setSuccess(true);

            // Redirect to dashboard after 2 seconds
            setTimeout(() => {
                navigate("/admin/dashboard");
            }, 2000);

        } catch (err: any) {
            console.error("Password setup error:", err);
            setError("Failed to set password. Please try again.");
            setSettingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-600">Verifying invitation...</p>
                </div>
            </div>
        );
    }

    if (error && !invitationData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
                    <div className="text-center mb-6">
                        <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Invalid Invitation</h1>
                    </div>

                    <Alert variant="destructive" className="mb-6">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>

                    <Button
                        onClick={() => navigate("/")}
                        className="w-full"
                        variant="outline"
                    >
                        Return to Home
                    </Button>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
                    <div className="text-center">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-gray-900 mb-2">Welcome!</h1>
                        <p className="text-gray-600 mb-4">
                            Your account has been created successfully.
                        </p>
                        <p className="text-sm text-gray-500">
                            Redirecting to dashboard...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
            <div className="max-w-md w-full bg-white rounded-lg shadow-lg p-8">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold text-gray-900 mb-2">
                        Set Your Password
                    </h1>
                    <p className="text-gray-600">
                        Welcome! Please set a password to complete your account setup.
                    </p>
                </div>

                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSetPassword} className="space-y-6">
                    <div>
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={invitationData?.email || ""}
                            disabled
                            className="bg-gray-50"
                        />
                    </div>

                    <div>
                        <Label htmlFor="password">Password</Label>
                        <Input
                            id="password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            minLength={8}
                            disabled={settingPassword}
                        />
                        <p className="text-sm text-gray-500 mt-1">
                            Must be at least 8 characters
                        </p>
                    </div>

                    <div>
                        <Label htmlFor="confirmPassword">Confirm Password</Label>
                        <Input
                            id="confirmPassword"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm your password"
                            required
                            minLength={8}
                            disabled={settingPassword}
                        />
                    </div>

                    <Button
                        type="submit"
                        className="w-full"
                        disabled={settingPassword}
                    >
                        {settingPassword ? (
                            <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Setting Password...
                            </>
                        ) : (
                            "Set Password & Continue"
                        )}
                    </Button>
                </form>

                <p className="text-center text-sm text-gray-500 mt-6">
                    By setting your password, you agree to our terms and conditions.
                </p>
            </div>
        </div>
    );
}
