// Abuse Detection Helper Utilities

export type AbuseSeverity = 'low' | 'medium' | 'high' | 'critical';
export type AbusePatternType =
    | 'excessive_orders'
    | 'failed_payments'
    | 'rapid_creation'
    | 'menu_spam'
    | 'staff_churn'
    | 'qr_abuse';
export type AbuseStatus = 'pending' | 'investigating' | 'resolved' | 'false_positive';

export interface AbuseDetection {
    id: string;
    restaurant_id: string;
    pattern_type: AbusePatternType;
    severity: AbuseSeverity;
    details: Record<string, any>;
    threshold_value: number | null;
    actual_value: number | null;
    detected_at: string;
    status: AbuseStatus;
    assigned_to: string | null;
    notes: string | null;
    resolved_at: string | null;
    created_at: string;
    updated_at: string;
}

/**
 * Get color class for severity badge
 */
export function getSeverityColor(severity: AbuseSeverity): string {
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
 * Get icon for severity level
 */
export function getSeverityIcon(severity: AbuseSeverity): string {
    switch (severity) {
        case 'critical':
            return '🔴';
        case 'high':
            return '🟠';
        case 'medium':
            return '🟡';
        case 'low':
            return '🟢';
        default:
            return '⚪';
    }
}

/**
 * Get human-readable label for pattern type
 */
export function getPatternTypeLabel(patternType: AbusePatternType): string {
    switch (patternType) {
        case 'excessive_orders':
            return 'Excessive Orders';
        case 'failed_payments':
            return 'Failed Payments';
        case 'rapid_creation':
            return 'Rapid Account Creation';
        case 'menu_spam':
            return 'Menu Spam';
        case 'staff_churn':
            return 'Staff Churn';
        case 'qr_abuse':
            return 'QR Code Abuse';
        default:
            return patternType;
    }
}

/**
 * Get icon for pattern type
 */
export function getPatternTypeIcon(patternType: AbusePatternType): string {
    switch (patternType) {
        case 'excessive_orders':
            return '📦';
        case 'failed_payments':
            return '💳';
        case 'rapid_creation':
            return '⚡';
        case 'menu_spam':
            return '📋';
        case 'staff_churn':
            return '👥';
        case 'qr_abuse':
            return '📱';
        default:
            return '⚠️';
    }
}

/**
 * Get description for pattern type
 */
export function getPatternTypeDescription(patternType: AbusePatternType): string {
    switch (patternType) {
        case 'excessive_orders':
            return 'Restaurants with abnormally high order volumes';
        case 'failed_payments':
            return 'Multiple failed payment attempts';
        case 'rapid_creation':
            return 'Multiple restaurants from same IP/email domain';
        case 'menu_spam':
            return 'Excessive menu item creation/deletion';
        case 'staff_churn':
            return 'Frequent staff additions/removals';
        case 'qr_abuse':
            return 'Excessive QR code generation';
        default:
            return 'Unknown pattern type';
    }
}

/**
 * Get color class for status badge
 */
export function getStatusColor(status: AbuseStatus): string {
    switch (status) {
        case 'pending':
            return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'investigating':
            return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'resolved':
            return 'bg-green-100 text-green-800 border-green-200';
        case 'false_positive':
            return 'bg-gray-100 text-gray-800 border-gray-200';
        default:
            return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

/**
 * Get human-readable label for status
 */
export function getStatusLabel(status: AbuseStatus): string {
    switch (status) {
        case 'pending':
            return 'Pending';
        case 'investigating':
            return 'Investigating';
        case 'resolved':
            return 'Resolved';
        case 'false_positive':
            return 'False Positive';
        default:
            return status;
    }
}

/**
 * Format abuse details for display
 */
export function formatAbuseDetails(detection: AbuseDetection): string {
    const { pattern_type, details, actual_value, threshold_value } = detection;

    switch (pattern_type) {
        case 'excessive_orders':
            return `${actual_value} orders detected (threshold: ${threshold_value})`;
        case 'menu_spam':
            return `${actual_value} menu changes (threshold: ${threshold_value})`;
        case 'staff_churn':
            return `${actual_value} staff changes (threshold: ${threshold_value})`;
        case 'qr_abuse':
            return `${actual_value} QR generations (threshold: ${threshold_value})`;
        case 'failed_payments':
            return `${actual_value} failed payments (threshold: ${threshold_value})`;
        case 'rapid_creation':
            return `${actual_value} accounts created (threshold: ${threshold_value})`;
        default:
            return JSON.stringify(details);
    }
}

/**
 * Export abuse detections to CSV
 */
export function exportToCSV(detections: AbuseDetection[], filename = 'abuse-detections.csv'): void {
    const headers = [
        'ID',
        'Restaurant ID',
        'Pattern Type',
        'Severity',
        'Status',
        'Actual Value',
        'Threshold Value',
        'Detected At',
        'Resolved At',
        'Notes'
    ];

    const rows = detections.map(d => [
        d.id,
        d.restaurant_id,
        getPatternTypeLabel(d.pattern_type),
        d.severity,
        getStatusLabel(d.status),
        d.actual_value?.toString() || '',
        d.threshold_value?.toString() || '',
        new Date(d.detected_at).toISOString(),
        d.resolved_at ? new Date(d.resolved_at).toISOString() : '',
        d.notes || ''
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

/**
 * Export abuse detections to JSON
 */
export function exportToJSON(detections: AbuseDetection[], filename = 'abuse-detections.json'): void {
    const json = JSON.stringify(detections, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/**
 * Get threshold for pattern type
 */
export function getPatternThreshold(patternType: AbusePatternType): number {
    switch (patternType) {
        case 'excessive_orders':
            return 100;
        case 'menu_spam':
            return 50;
        case 'staff_churn':
            return 10;
        case 'qr_abuse':
            return 20;
        case 'failed_payments':
            return 5;
        case 'rapid_creation':
            return 4;
        default:
            return 0;
    }
}

/**
 * Get time window for pattern type
 */
export function getPatternTimeWindow(patternType: AbusePatternType): string {
    switch (patternType) {
        case 'excessive_orders':
            return '24 hours';
        case 'menu_spam':
            return '24 hours';
        case 'staff_churn':
            return '7 days';
        case 'qr_abuse':
            return '24 hours';
        case 'failed_payments':
            return '7 days';
        case 'rapid_creation':
            return '5 minutes';
        default:
            return 'Unknown';
    }
}
