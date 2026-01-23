import { Badge } from "@/components/ui/badge";
import { Clock, AlertTriangle, CheckCircle } from "lucide-react";
import {
    SupportTicket,
    calculateSLAStatus,
    formatTimeRemaining,
    SLAStatus,
} from "../utils/supportHelpers";

interface SLAIndicatorProps {
    ticket: SupportTicket;
    showLabel?: boolean;
}

export function SLAIndicator({ ticket, showLabel = true }: SLAIndicatorProps) {
    const sla = calculateSLAStatus(ticket);

    const getIcon = (status: SLAStatus) => {
        switch (status) {
            case 'breached':
                return <AlertTriangle className="h-3 w-3" />;
            case 'at-risk':
                return <Clock className="h-3 w-3" />;
            case 'on-time':
                return <CheckCircle className="h-3 w-3" />;
        }
    };

    const getColor = (status: SLAStatus) => {
        switch (status) {
            case 'breached':
                return 'bg-red-100 text-red-800 border-red-200';
            case 'at-risk':
                return 'bg-yellow-100 text-yellow-800 border-yellow-200';
            case 'on-time':
                return 'bg-green-100 text-green-800 border-green-200';
        }
    };

    const getLabel = (status: SLAStatus, minutes: number) => {
        if (status === 'breached') {
            return `Overdue ${formatTimeRemaining(Math.abs(minutes))}`;
        } else if (status === 'at-risk') {
            return `${formatTimeRemaining(minutes)} left`;
        } else {
            return `${formatTimeRemaining(minutes)} left`;
        }
    };

    if (ticket.status === 'resolved' || ticket.status === 'closed') {
        return (
            <Badge variant="outline" className="bg-gray-50 text-gray-600 border-gray-200">
                <CheckCircle className="h-3 w-3 mr-1" />
                {ticket.resolution_time_minutes
                    ? `Resolved in ${formatTimeRemaining(ticket.resolution_time_minutes)}`
                    : 'Resolved'}
            </Badge>
        );
    }

    return (
        <Badge variant="outline" className={getColor(sla.status)}>
            {getIcon(sla.status)}
            {showLabel && (
                <span className="ml-1">
                    {getLabel(sla.status, sla.minutesRemaining)}
                </span>
            )}
        </Badge>
    );
}
