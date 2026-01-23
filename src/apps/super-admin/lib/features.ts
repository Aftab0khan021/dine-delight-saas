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
    // Core Features
    {
        key: 'online_ordering',
        name: 'Online Ordering',
        description: 'Allow customers to place orders online through the restaurant website',
        type: 'boolean',
        category: 'core',
        defaultValue: true,
    },
    {
        key: 'qr_menu',
        name: 'QR Menu',
        description: 'Enable QR code menu access for contactless dining',
        type: 'boolean',
        category: 'core',
        defaultValue: true,
    },
    {
        key: 'analytics',
        name: 'Analytics Dashboard',
        description: 'Access to detailed analytics and reporting dashboard',
        type: 'boolean',
        category: 'core',
        defaultValue: true,
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
