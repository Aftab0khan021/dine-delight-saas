import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X } from "lucide-react";

interface DenyDialogProps {
    onDeny: (reason: string) => void;
    restaurantName: string;
}

export function DenyDialog({ onDeny, restaurantName }: DenyDialogProps) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!reason.trim()) return;

        setSubmitting(true);
        try {
            await onDeny(reason);
            setOpen(false);
            setReason("");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="destructive" className="flex-1">
                    <X className="mr-2 h-4 w-4" />
                    Deny
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Deny Application</DialogTitle>
                    <DialogDescription>
                        You're about to deny the application for <strong>{restaurantName}</strong>.
                        Please provide a reason that will be sent to the applicant.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-2">
                    <Label htmlFor="reason">Reason for Denial *</Label>
                    <Textarea
                        id="reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g., Incomplete business information, duplicate application, etc."
                        rows={4}
                        required
                    />
                    <p className="text-xs text-muted-foreground">
                        This reason will be visible to the applicant.
                    </p>
                </div>
                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => setOpen(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleSubmit}
                        disabled={!reason.trim() || submitting}
                    >
                        {submitting ? "Denying..." : "Deny Application"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
