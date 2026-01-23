import { useState } from "react";
import { format } from "date-fns";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
    AbuseDetection,
    getSeverityColor,
    getSeverityIcon,
    getPatternTypeLabel,
    getPatternTypeIcon,
    getStatusLabel,
    getStatusColor,
    formatAbuseDetails,
} from "../utils/abuseDetectionHelpers";

interface AbuseAlertDetailsModalProps {
    detection: AbuseDetection | null;
    restaurantName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onInvestigate?: (detectionId: string, notes: string) => void;
    onResolve?: (detectionId: string, notes: string) => void;
    onMarkFalsePositive?: (detectionId: string, notes: string) => void;
}

export function AbuseAlertDetailsModal({
    detection,
    restaurantName,
    open,
    onOpenChange,
    onInvestigate,
    onResolve,
    onMarkFalsePositive,
}: AbuseAlertDetailsModalProps) {
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!detection) return null;

    const handleAction = async (action: "investigate" | "resolve" | "false_positive") => {
        setIsSubmitting(true);
        try {
            if (action === "investigate" && onInvestigate) {
                await onInvestigate(detection.id, notes);
            } else if (action === "resolve" && onResolve) {
                await onResolve(detection.id, notes);
            } else if (action === "false_positive" && onMarkFalsePositive) {
                await onMarkFalsePositive(detection.id, notes);
            }
            setNotes("");
            onOpenChange(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <span className="text-2xl">{getPatternTypeIcon(detection.pattern_type)}</span>
                        {getPatternTypeLabel(detection.pattern_type)} Alert
                    </DialogTitle>
                    <DialogDescription>
                        Detected on {format(new Date(detection.detected_at), "PPP 'at' p")}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    {/* Status and Severity */}
                    <div className="flex gap-2">
                        <Badge className={getSeverityColor(detection.severity)}>
                            {getSeverityIcon(detection.severity)} {detection.severity.toUpperCase()}
                        </Badge>
                        <Badge className={getStatusColor(detection.status)}>
                            {getStatusLabel(detection.status)}
                        </Badge>
                    </div>

                    <Separator />

                    {/* Restaurant Info */}
                    <div>
                        <h3 className="text-sm font-semibold mb-2">Restaurant</h3>
                        <p className="text-sm">
                            {restaurantName || "Unknown"} <span className="text-muted-foreground">({detection.restaurant_id})</span>
                        </p>
                    </div>

                    <Separator />

                    {/* Detection Details */}
                    <div>
                        <h3 className="text-sm font-semibold mb-2">Detection Details</h3>
                        <p className="text-sm">{formatAbuseDetails(detection)}</p>
                        {detection.details && Object.keys(detection.details).length > 0 && (
                            <div className="mt-2 p-3 bg-muted rounded-md">
                                <pre className="text-xs overflow-x-auto">
                                    {JSON.stringify(detection.details, null, 2)}
                                </pre>
                            </div>
                        )}
                    </div>

                    {/* Existing Notes */}
                    {detection.notes && (
                        <>
                            <Separator />
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Investigation Notes</h3>
                                <p className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-md">
                                    {detection.notes}
                                </p>
                            </div>
                        </>
                    )}

                    {/* Resolution Info */}
                    {detection.resolved_at && (
                        <>
                            <Separator />
                            <div>
                                <h3 className="text-sm font-semibold mb-2">Resolution</h3>
                                <p className="text-sm text-muted-foreground">
                                    Resolved on {format(new Date(detection.resolved_at), "PPP 'at' p")}
                                </p>
                            </div>
                        </>
                    )}

                    {/* Add Notes Section */}
                    {detection.status !== "resolved" && detection.status !== "false_positive" && (
                        <>
                            <Separator />
                            <div className="space-y-2">
                                <Label htmlFor="notes">Add Notes</Label>
                                <Textarea
                                    id="notes"
                                    placeholder="Add investigation notes or resolution details..."
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    rows={4}
                                />
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2 justify-end">
                                {detection.status === "pending" && (
                                    <Button
                                        onClick={() => handleAction("investigate")}
                                        disabled={isSubmitting}
                                        variant="default"
                                    >
                                        Start Investigation
                                    </Button>
                                )}
                                {detection.status === "investigating" && (
                                    <>
                                        <Button
                                            onClick={() => handleAction("false_positive")}
                                            disabled={isSubmitting}
                                            variant="outline"
                                        >
                                            Mark as False Positive
                                        </Button>
                                        <Button
                                            onClick={() => handleAction("resolve")}
                                            disabled={isSubmitting}
                                            variant="default"
                                        >
                                            Resolve
                                        </Button>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
