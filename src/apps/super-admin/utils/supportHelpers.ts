// Support Tools Utility Helpers

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type SLAStatus = 'on-time' | 'at-risk' | 'breached';
export type ErrorType = 'api' | 'auth' | 'payment' | 'system' | 'database' | 'validation';
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
export type ErrorStatus = 'new' | 'investigating' | 'resolved' | 'ignored';

export interface SupportTicket {
    id: string;
    restaurant_id: string | null;
    subject: string;
    description: string | null;
    status: TicketStatus;
    priority: TicketPriority;
    assigned_to: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    resolved_at: string | null;
    sla_due_at: string | null;
    sla_breached: boolean;
    response_time_minutes: number | null;
    resolution_time_minutes: number | null;
    tags: string[];
    metadata: Record<string, any>;
}

export interface ErrorLog {
    id: string;
    error_type: ErrorType;
    severity: ErrorSeverity;
    message: string;
    endpoint: string | null;
    method: string | null;
    status_code: number | null;
    user_id: string | null;
    restaurant_id: string | null;
    ip_address: string | null;
    user_agent: string | null;
    stack_trace: string | null;
    metadata: Record<string, any>;
    status: ErrorStatus;
    resolved_at: string | null;
    resolved_by: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

// SLA Configuration (in minutes)
export const SLA_TIMES = {
    urgent: 2 * 60,    // 2 hours
    high: 8 * 60,      // 8 hours
    medium: 24 * 60,   // 24 hours
    low: 72 * 60,      // 72 hours
};

/**
 * Calculate SLA status for a ticket
 */
export function calculateSLAStatus(ticket: SupportTicket): {
    status: SLAStatus;
    minutesRemaining: number;
    percentRemaining: number;
} {
    if (!ticket.sla_due_at || ticket.status === 'resolved' || ticket.status === 'closed') {
        return { status: 'on-time', minutesRemaining: 0, percentRemaining: 100 };
    }

    const now = new Date();
    const dueAt = new Date(ticket.sla_due_at);
    const createdAt = new Date(ticket.created_at);

    const totalMinutes = (dueAt.getTime() - createdAt.getTime()) / 1000 / 60;
    const minutesRemaining = (dueAt.getTime() - now.getTime()) / 1000 / 60;
    const percentRemaining = (minutesRemaining / totalMinutes) * 100;

    if (minutesRemaining < 0) {
        return { status: 'breached', minutesRemaining, percentRemaining: 0 };
    } else if (percentRemaining < 25) {
        return { status: 'at-risk', minutesRemaining, percentRemaining };
    } else {
        return { status: 'on-time', minutesRemaining, percentRemaining };
    }
}

/**
 * Get color for ticket priority
 */
export function getPriorityColor(priority: TicketPriority): string {
    switch (priority) {
        case 'urgent':
            return 'bg-red-100 text-red-800 border-red-200';
        case 'high':
            return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'medium':
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'low':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

/**
 * Get color for ticket status
 */
export function getStatusColor(status: TicketStatus): string {
    switch (status) {
        case 'open':
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'in_progress':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'resolved':
            return 'bg-green-100 text-green-800 border-green-200';
        case 'closed':
            return 'bg-gray-100 text-gray-800 border-gray-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

/**
 * Get label for ticket status
 */
export function getStatusLabel(status: TicketStatus): string {
    switch (status) {
        case 'open':
            return 'Open';
        case 'in_progress':
            return 'In Progress';
        case 'resolved':
            return 'Resolved';
        case 'closed':
            return 'Closed';
        default:
            return status;
    }
}

/**
 * Get color for error severity
 */
export function getErrorSeverityColor(severity: ErrorSeverity): string {
    switch (severity) {
        case 'critical':
            return 'bg-red-100 text-red-800 border-red-200';
        case 'high':
            return 'bg-orange-100 text-orange-800 border-orange-200';
        case 'medium':
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'low':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

/**
 * Get icon for error type
 */
export function getErrorTypeIcon(errorType: ErrorType): string {
    switch (errorType) {
        case 'api':
            return '🔌';
        case 'auth':
            return '🔐';
        case 'payment':
            return '💳';
        case 'system':
            return '⚙️';
        case 'database':
            return '🗄️';
        case 'validation':
            return '✅';
        default:
            return '⚠️';
    }
}

/**
 * Get label for error type
 */
export function getErrorTypeLabel(errorType: ErrorType): string {
    switch (errorType) {
        case 'api':
            return 'API Error';
        case 'auth':
            return 'Authentication';
        case 'payment':
            return 'Payment';
        case 'system':
            return 'System';
        case 'database':
            return 'Database';
        case 'validation':
            return 'Validation';
        default:
            return errorType;
    }
}

/**
 * Format time remaining/overdue
 */
export function formatTimeRemaining(minutes: number): string {
    const absMinutes = Math.abs(minutes);

    if (absMinutes < 60) {
        return `${Math.round(absMinutes)}m`;
    } else if (absMinutes < 1440) {
        const hours = Math.floor(absMinutes / 60);
        const mins = Math.round(absMinutes % 60);
        return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
    } else {
        const days = Math.floor(absMinutes / 1440);
        const hours = Math.floor((absMinutes % 1440) / 60);
        return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
    }
}

/**
 * Export tickets to CSV
 */
export function exportTicketsToCSV(tickets: SupportTicket[], filename = 'support-tickets.csv'): void {
    const headers = [
        'ID',
        'Subject',
        'Status',
        'Priority',
        'SLA Status',
        'Created At',
        'Resolved At',
        'Resolution Time (min)'
    ];

    const rows = tickets.map(t => {
        const sla = calculateSLAStatus(t);
        return [
            t.id,
            t.subject,
            getStatusLabel(t.status),
            t.priority,
            sla.status,
            new Date(t.created_at).toISOString(),
            t.resolved_at ? new Date(t.resolved_at).toISOString() : '',
            t.resolution_time_minutes?.toString() || ''
        ];
    });

    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Export errors to CSV
 */
export function exportErrorsToCSV(errors: ErrorLog[], filename = 'error-logs.csv'): void {
    const headers = [
        'ID',
        'Type',
        'Severity',
        'Message',
        'Endpoint',
        'Status Code',
        'Created At',
        'Status'
    ];

    const rows = errors.map(e => [
        e.id,
        getErrorTypeLabel(e.error_type),
        e.severity,
        e.message,
        e.endpoint || '',
        e.status_code?.toString() || '',
        new Date(e.created_at).toISOString(),
        e.status
    ]);

    const csv = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
