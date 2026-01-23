import { Button } from "@/components/ui/button";
import { X, Ban, Search, Shield, Download } from "lucide-react";

interface BulkActionsBarProps {
    selectedCount: number;
    onClearSelection: () => void;
    onBulkSuspend: () => void;
    onBulkInvestigate: () => void;
    onBulkWhitelist: () => void;
    onBulkExport: () => void;
    isProcessing?: boolean;
}

export function BulkActionsBar({
    selectedCount,
    onClearSelection,
    onBulkSuspend,
    onBulkInvestigate,
    onBulkWhitelist,
    onBulkExport,
    isProcessing = false,
}: BulkActionsBarProps) {
    if (selectedCount === 0) return null;

    return (
        <div className="sticky bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <div className="container flex items-center justify-between py-3">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                        {selectedCount} {selectedCount === 1 ? "alert" : "alerts"} selected
                    </span>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onClearSelection}
                        disabled={isProcessing}
                    >
                        <X className="h-4 w-4 mr-1" />
                        Clear
                    </Button>
                </div>

                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onBulkExport}
                        disabled={isProcessing}
                    >
                        <Download className="h-4 w-4 mr-1" />
                        Export
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onBulkWhitelist}
                        disabled={isProcessing}
                    >
                        <Shield className="h-4 w-4 mr-1" />
                        Whitelist
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onBulkInvestigate}
                        disabled={isProcessing}
                    >
                        <Search className="h-4 w-4 mr-1" />
                        Investigate
                    </Button>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={onBulkSuspend}
                        disabled={isProcessing}
                    >
                        <Ban className="h-4 w-4 mr-1" />
                        Suspend
                    </Button>
                </div>
            </div>
        </div>
    );
}
