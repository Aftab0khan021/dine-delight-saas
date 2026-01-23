// Super Admin Types
// Generated from database schema

export type RestaurantStatus = 'active' | 'suspended' | 'terminated' | 'locked';

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type BillingPeriod = 'monthly' | 'yearly';

export type LogSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';

export interface SubscriptionPlan {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    price_cents: number;
    currency: string;
    billing_period: BillingPeriod;
    trial_days: number;
    features: PlanFeatures;
    is_active: boolean;
    sort_order: number;
    created_at: string;
    updated_at: string;
}

export interface PlanFeatures {
    online_ordering: boolean;
    qr_menu: boolean;
    staff_limit: number; // -1 for unlimited
    custom_domain: boolean;
    analytics: boolean;
    api_access: boolean;
    priority_support?: boolean;
    [key: string]: any; // Allow additional features
}

export interface FeatureFlag {
    id: string;
    key: string;
    name: string;
    description: string | null;
    is_enabled: boolean;
    config: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface RestaurantFeature {
    id: string;
    restaurant_id: string;
    feature_key: string;
    is_enabled: boolean;
    config: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface SuperAdminAuditLog {
    id: string;
    admin_user_id: string | null;
    action: string;
    entity_type: string | null;
    entity_id: string | null;
    restaurant_id: string | null;
    before_value: Record<string, any> | null;
    after_value: Record<string, any> | null;
    ip_address: string | null;
    user_agent: string | null;
    metadata: Record<string, any>;
    created_at: string;
}

export interface PlatformSettings {
    key: string;
    value: any;
    description: string | null;
    updated_at: string;
    updated_by: string | null;
}

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
}

// Enhanced existing types

export interface RestaurantEnhanced {
    id: string;
    name: string;
    slug: string;
    status: RestaurantStatus;
    suspension_reason: string | null;
    suspended_at: string | null;
    suspended_by: string | null;
    last_active_at: string | null;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface SubscriptionEnhanced {
    id: string;
    restaurant_id: string;
    plan_id: string | null;
    status: string;
    is_manual_override: boolean;
    override_reason: string | null;
    override_by: string | null;
    override_at: string | null;
    discount_percent: number;
    discount_reason: string | null;
    current_period_start: string;
    current_period_end: string;
    created_at: string;
    updated_at: string;
}

// View types

export interface RestaurantHealthScore {
    id: string;
    name: string;
    status: RestaurantStatus;
    last_active_at: string | null;
    subscription_status: string | null;
    plan_name: string | null;
    total_orders: number;
    orders_last_30_days: number;
    staff_count: number;
    health_score: number; // 0-100
}

export interface PlatformMetrics {
    total_restaurants: number;
    active_restaurants: number;
    suspended_restaurants: number;
    new_restaurants_30d: number;
    active_subscriptions: number;
    total_orders: number;
    orders_30d: number;
    mrr_cents: number;
    total_users: number;
}

// Helper types

export interface AuditAction {
    action: string;
    entity_type?: string;
    entity_id?: string;
    restaurant_id?: string;
    before_value?: Record<string, any>;
    after_value?: Record<string, any>;
    metadata?: Record<string, any>;
}

export interface RestaurantSuspension {
    restaurant_id: string;
    reason: string;
    suspended_by: string;
}

export interface SubscriptionOverride {
    subscription_id: string;
    reason: string;
    override_by: string;
    changes: Partial<SubscriptionEnhanced>;
}
