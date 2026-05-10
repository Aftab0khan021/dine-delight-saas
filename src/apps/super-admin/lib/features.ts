// Feature Definitions
// Centralized feature configuration for the platform

export interface FeatureDefinition {
    key: string;
    name: string;
    description: string;
    type: 'boolean' | 'limit' | 'config';
    category: 'core' | 'limits' | 'premium' | 'advanced';
    defaultValue: boolean | number;
    unit?: string; // For limit types
}

export const FEATURE_DEFINITIONS: FeatureDefinition[] = [
    // Core Features (all default OFF — enabled via subscription or override)
    {
        key: 'online_ordering',
        name: 'Online Ordering',
        description: 'Allow customers to place orders online through the restaurant website',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'qr_menu',
        name: 'QR Menu',
        description: 'Enable QR code menu access for contactless dining',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'analytics',
        name: 'Analytics Dashboard',
        description: 'Access to detailed analytics and reporting dashboard',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'kitchen_display',
        name: 'Kitchen Display',
        description: 'Kitchen display system for order preparation tracking',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'coupons',
        name: 'Coupons & Discounts',
        description: 'Create and manage promo codes and discount campaigns',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'reviews',
        name: 'Customer Reviews',
        description: 'View and manage customer reviews and ratings',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'customer_management',
        name: 'Customer Management',
        description: 'CRM database for customer profiles, order history, and insights',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'delivery_zones',
        name: 'Delivery Zones',
        description: 'Configure delivery areas and zone-based pricing',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'online_payments',
        name: 'Online Payments',
        description: 'Accept card, UPI (GPay, PhonePe, Paytm), and digital payments at checkout',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'staff_categories',
        name: 'Staff Categories',
        description: 'Create custom staff roles with granular permission assignments',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },

    // Limits
    {
        key: 'staff_limit',
        name: 'Staff Limit',
        description: 'Maximum number of staff members that can be added (-1 for unlimited)',
        type: 'limit',
        category: 'limits',
        defaultValue: 10,
        unit: 'users',
    },
    {
        key: 'menu_items_limit',
        name: 'Menu Items Limit',
        description: 'Maximum number of menu items that can be created (-1 for unlimited)',
        type: 'limit',
        category: 'limits',
        defaultValue: 100,
        unit: 'items',
    },
    {
        key: 'api_rate_limit',
        name: 'API Rate Limit',
        description: 'Maximum API requests per hour (-1 for unlimited)',
        type: 'limit',
        category: 'limits',
        defaultValue: 1000,
        unit: 'requests/hour',
    },

    // Premium Features
    {
        key: 'custom_domain',
        name: 'Custom Domain',
        description: 'Use your own custom domain for the restaurant website',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'api_access',
        name: 'API Access',
        description: 'Access to REST API for custom integrations',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'priority_support',
        name: 'Priority Support',
        description: 'Get priority customer support with faster response times',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'white_label',
        name: 'White Label',
        description: 'Remove platform branding and use your own branding',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'menu_insights',
        name: 'Menu Insights',
        description: 'AI-powered menu performance analytics and recommendations',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'whatsapp_crm',
        name: 'WhatsApp CRM',
        description: 'WhatsApp marketing and customer communication tools',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'whatsapp_bot',
        name: 'WhatsApp Bot',
        description: 'Automated WhatsApp ordering bot for customers',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'otp_verification',
        name: 'OTP Verification',
        description: 'Phone number verification via SMS/WhatsApp OTP',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },

    // Advanced Features
    {
        key: 'table_reservations',
        name: 'Table Reservations',
        description: 'Allow customers to reserve tables online',
        type: 'boolean',
        category: 'advanced',
        defaultValue: false,
    },
    {
        key: 'loyalty_program',
        name: 'Loyalty Program',
        description: 'Built-in customer loyalty and rewards program',
        type: 'boolean',
        category: 'advanced',
        defaultValue: false,
    },
    {
        key: 'email_marketing',
        name: 'Email Marketing',
        description: 'Send marketing emails and newsletters to customers',
        type: 'boolean',
        category: 'advanced',
        defaultValue: false,
    },
    {
        key: 'inventory_management',
        name: 'Inventory Management',
        description: 'Track and manage ingredient inventory',
        type: 'boolean',
        category: 'advanced',
        defaultValue: false,
    },
    {
        key: 'multi_location',
        name: 'Multi-Location Support',
        description: 'Manage multiple restaurant locations from one account',
        type: 'boolean',
        category: 'advanced',
        defaultValue: false,
    },
    {
        key: 'smart_ranking',
        name: 'Smart Menu Ranking',
        description: 'Auto-sort menu items by popularity so best-sellers appear first',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'order_heatmap',
        name: 'Order Heatmap',
        description: 'Visual heatmap showing busiest ordering hours and days',
        type: 'boolean',
        category: 'core',
        defaultValue: false,
    },
    {
        key: 'ai_descriptions',
        name: 'AI Menu Descriptions',
        description: 'AI-generated appetizing menu item descriptions (free template + paid GPT)',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
    {
        key: 'sentiment_analysis',
        name: 'Review Sentiment',
        description: 'Auto-classify reviews as positive/neutral/negative with sentiment badges',
        type: 'boolean',
        category: 'premium',
        defaultValue: false,
    },
];

// Helper functions
export function getFeatureDefinition(key: string): FeatureDefinition | undefined {
    return FEATURE_DEFINITIONS.find((f) => f.key === key);
}

export function getFeaturesByCategory(category: string): FeatureDefinition[] {
    return FEATURE_DEFINITIONS.filter((f) => f.category === category);
}

export function getBooleanFeatures(): FeatureDefinition[] {
    return FEATURE_DEFINITIONS.filter((f) => f.type === 'boolean');
}

export function getLimitFeatures(): FeatureDefinition[] {
    return FEATURE_DEFINITIONS.filter((f) => f.type === 'limit');
}

export function getDefaultFeatures(): Record<string, boolean | number> {
    return FEATURE_DEFINITIONS.reduce((acc, feature) => {
        acc[feature.key] = feature.defaultValue;
        return acc;
    }, {} as Record<string, boolean | number>);
}

export const FEATURE_CATEGORIES = [
    { key: 'core', label: 'Core Features', description: 'Essential features for restaurant operations' },
    { key: 'limits', label: 'Limits', description: 'Resource and usage limits' },
    { key: 'premium', label: 'Premium Features', description: 'Advanced features for premium plans' },
    { key: 'advanced', label: 'Advanced Features', description: 'Specialized features for specific use cases' },
] as const;
