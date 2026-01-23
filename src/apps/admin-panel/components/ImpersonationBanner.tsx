import { useImpersonation } from "../hooks/useImpersonation";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserCog, X, Eye, Lock } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

export function ImpersonationBanner() {
    const { isImpersonating, isReadOnly, expiresAt, endImpersonation } = useImpersonation();

    if (!isImpersonating) {
        return null;
    }

    const timeRemaining = expiresAt
        ? formatDistanceToNow(new Date(expiresAt), { addSuffix: true })
        : "Unknown";

    return (
        <Alert className="rounded-none border-x-0 border-t-0 border-b-2 border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <UserCog className="h-5 w-5 text-yellow-700 dark:text-yellow-400" />
                    <div className="flex items-center gap-2 flex-wrap">
                        <AlertDescription className="text-sm font-medium text-yellow-900 dark:text-yellow-100 m-0">
                            Impersonation Active
                        </AlertDescription>
                        <Badge variant={isReadOnly ? "secondary" : "destructive"} className="text-xs">
                            {isReadOnly ? (
                                <>
                                    <Lock className="h-3 w-3 mr-1" />
                                    Read-Only
                                </>
                            ) : (
                                <>
                                    <Eye className="h-3 w-3 mr-1" />
                                    Full Access
                                </>
                            )}
                        </Badge>
                        <span className="text-xs text-yellow-700 dark:text-yellow-400">
                            Expires {timeRemaining}
                        </span>
                    </div>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={endImpersonation}
                    className="border-yellow-600 text-yellow-900 hover:bg-yellow-100 dark:text-yellow-100 dark:hover:bg-yellow-900"
                >
                    <X className="h-4 w-4 mr-2" />
                    End Impersonation
                </Button>
            </div>
        </Alert>
    );
}
