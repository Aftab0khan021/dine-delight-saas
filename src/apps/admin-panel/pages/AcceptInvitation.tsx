import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle, CheckCircle2, LogOut } from "lucide-react";

export default function AcceptInvitation() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState(false);

    const [invitationData, setInvitationData] = useState<any>(null);
    const [fullName, setFullName] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [settingPassword, setSettingPassword] = useState(false);

    // Fix #7: Check if user is already logged in when the page loads
    const [existingSession, setExistingSession] = useState<any>(null);

    useEffect(() => {
        checkSessionAndVerifyToken();
    }, []);

    const checkSessionAndVerifyToken = async () => {
        // Fix #7: Detect if user is already logged into a different account
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            setExistingSession(session);
        }

        await verifyToken();
    };

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
                        setError("This invitation has already been used. If you already set your password, please log in from the admin login page.");
                    } else {
                        setError("This invitation has expired. Please ask your admin to resend the invitation.");
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

    // Fix #7: Allow user to sign out of existing session before accepting invite
    const handleSignOutAndContinue = async () => {
        await supabase.auth.signOut();
        setExistingSession(null);
    };

    const handleSetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        // Validation
        if (!fullName.trim()) {
            setError("Please enter your full name.");
            return;
        }

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

            // Fix #1: Atomically claim the token BEFORE creating the user.
            // This prevents race conditions where two tabs could use the same token.
            // The RLS policy only allows updating tokens where used_at IS NULL.
            const { error: claimError, count } = await supabase
                .from("invitation_tokens")
                .update({ used_at: new Date().toISOString() })
                .eq("token", token)
                .is("used_at", null)
                .select();

            // If update didn't match any rows, the token was already claimed
            if (claimError) {
                console.error("Token claim error:", claimError);
                setError("Failed to process invitation. The token may have already been used.");
                setSettingPassword(false);
                return;
            }

            // Fix #8 & #11: Create user account with full_name in metadata
            const { data: authData, error: signUpError } = await supabase.auth.signUp({
                email: invitationData.email,
                password: password,
                options: {
                    data: {
                        full_name: fullName.trim(),
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

            // Fix #2: Verify that the DB trigger created the user_roles row.
            // If it didn't (trigger failure), create it explicitly as a fallback.
            const { data: existingRole } = await supabase
                .from("user_roles")
                .select("user_id")
                .eq("user_id", authData.user.id)
                .eq("restaurant_id", invitationData.restaurant_id)
                .maybeSingle();

            if (!existingRole) {
                console.warn("Trigger didn't create user_role, inserting fallback...");
                await supabase
                    .from("user_roles")
                    .insert({
                        user_id: authData.user.id,
                        restaurant_id: invitationData.restaurant_id,
                        role: invitationData.role || "user",
                        staff_category_id: invitationData.staff_category_id || null,
                    });
            }

            // Also verify profile exists
            const { data: existingProfile } = await supabase
                .from("profiles")
                .select("id")
                .eq("id", authData.user.id)
                .maybeSingle();

            if (!existingProfile) {
                console.warn("Trigger didn't create profile, inserting fallback...");
                await supabase
                    .from("profiles")
                    .insert({
                        id: authData.user.id,
                        email: invitationData.email,
                        full_name: fullName.trim(),
                        account_status: "active",
                    });
            }

            // Update staff_invites status
            await supabase
                .from("staff_invites")
                .update({ status: 'accepted' })
                .eq("email", invitationData.email)
                .eq("restaurant_id", invitationData.restaurant_id)
                .eq("status", "pending");

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
            <div className="min-h-screen flex items-center justify-center bg-muted/30">
                <div className="text-center">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
                    <p className="text-muted-foreground">Verifying invitation...</p>
                </div>
            </div>
        );
    }

    if (error && !invitationData) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 border">
                    <div className="text-center mb-6">
                        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Invalid Invitation</h1>
                    </div>

                    <Alert variant="destructive" className="mb-6">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>

                    <div className="flex flex-col gap-2">
                        <Button
                            onClick={() => navigate("/admin/auth")}
                            className="w-full"
                        >
                            Go to Login
                        </Button>
                        <Button
                            onClick={() => navigate("/")}
                            className="w-full"
                            variant="outline"
                        >
                            Return to Home
                        </Button>
                    </div>
                </div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 border">
                    <div className="text-center">
                        <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Welcome!</h1>
                        <p className="text-muted-foreground mb-4">
                            Your account has been created successfully.
                        </p>
                        <p className="text-sm text-muted-foreground">
                            Redirecting to dashboard...
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    // Fix #7: Show warning if user is already logged in
    if (existingSession && invitationData) {
        const currentEmail = existingSession.user?.email;
        const inviteEmail = invitationData.email;
        const isSameEmail = currentEmail?.toLowerCase() === inviteEmail?.toLowerCase();

        return (
            <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
                <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 border">
                    <div className="text-center mb-6">
                        <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                        <h1 className="text-2xl font-bold mb-2">Already Logged In</h1>
                        <p className="text-muted-foreground">
                            {isSameEmail
                                ? `You're already logged in as ${currentEmail}. This invitation is for the same email.`
                                : `You're logged in as ${currentEmail}, but this invitation is for ${inviteEmail}.`
                            }
                        </p>
                    </div>

                    <div className="flex flex-col gap-2">
                        {isSameEmail ? (
                            <Button onClick={() => navigate("/admin/dashboard")} className="w-full">
                                Go to Dashboard
                            </Button>
                        ) : (
                            <Button onClick={handleSignOutAndContinue} className="w-full">
                                <LogOut className="mr-2 h-4 w-4" />
                                Sign out & accept invitation
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-muted/30 p-4">
            <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-8 border">
                <div className="text-center mb-8">
                    <h1 className="text-2xl font-bold mb-2">
                        Set Your Password
                    </h1>
                    <p className="text-muted-foreground">
                        Welcome! Complete the form below to join the team.
                    </p>
                </div>

                {error && (
                    <Alert variant="destructive" className="mb-6">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSetPassword} className="space-y-5">
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            value={invitationData?.email || ""}
                            disabled
                            className="bg-muted/50"
                        />
                    </div>

                    {/* Fix #11: Collect full name */}
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>
                        <Input
                            id="fullName"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Enter your full name"
                            required
                            disabled={settingPassword}
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
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
                        <p className="text-xs text-muted-foreground">
                            Must be at least 8 characters
                        </p>
                    </div>

                    <div className="space-y-2">
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
                                Creating Account...
                            </>
                        ) : (
                            "Create Account & Continue"
                        )}
                    </Button>
                </form>

                <p className="text-center text-xs text-muted-foreground mt-6">
                    By creating an account, you agree to our terms and conditions.
                </p>
            </div>
        </div>
    );
}
