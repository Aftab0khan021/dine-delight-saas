// ============================================================================
// RBAC Types
// ============================================================================

export type StaffRole = "super_admin" | "restaurant_admin" | "user" | "staff";

export type StaffCategory = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  color: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type Permission = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: PermissionCategory;
  created_at: string;
};

export type PermissionCategory = "orders" | "menu" | "staff" | "analytics" | "settings";

export type CategoryPermission = {
  category_id: string;
  permission_id: string;
  created_at: string;
};

// ============================================================================
// Permission Constants
// ============================================================================

export const PERMISSIONS = {
  // Orders
  VIEW_ORDERS: "view_orders",
  MANAGE_ORDERS: "manage_orders",
  DELETE_ORDERS: "delete_orders",

  // Menu
  VIEW_MENU: "view_menu",
  EDIT_MENU: "edit_menu",
  MANAGE_CATEGORIES: "manage_categories",

  // Staff
  VIEW_STAFF: "view_staff",
  MANAGE_STAFF: "manage_staff",
  MANAGE_CATEGORIES_STAFF: "manage_categories_staff",

  // Analytics
  VIEW_ANALYTICS: "view_analytics",
  EXPORT_REPORTS: "export_reports",

  // Settings
  VIEW_SETTINGS: "view_settings",
  MANAGE_SETTINGS: "manage_settings",
  MANAGE_BILLING: "manage_billing",

  // QR & Coupons
  VIEW_QR: "view_qr",
  MANAGE_QR: "manage_qr",
  VIEW_COUPONS: "view_coupons",
  MANAGE_COUPONS: "manage_coupons",
} as const;

export type PermissionCode = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ============================================================================
// Default Categories
// ============================================================================

export const DEFAULT_CATEGORIES = [
  {
    name: "Manager",
    description: "Full access to all features except billing",
    color: "#8b5cf6",
    permissions: [
      PERMISSIONS.VIEW_ORDERS,
      PERMISSIONS.MANAGE_ORDERS,
      PERMISSIONS.VIEW_MENU,
      PERMISSIONS.EDIT_MENU,
      PERMISSIONS.MANAGE_CATEGORIES,
      PERMISSIONS.VIEW_STAFF,
      PERMISSIONS.MANAGE_STAFF,
      PERMISSIONS.VIEW_ANALYTICS,
      PERMISSIONS.EXPORT_REPORTS,
      PERMISSIONS.VIEW_SETTINGS,
      PERMISSIONS.MANAGE_SETTINGS,
      PERMISSIONS.VIEW_QR,
      PERMISSIONS.MANAGE_QR,
      PERMISSIONS.VIEW_COUPONS,
      PERMISSIONS.MANAGE_COUPONS,
    ],
  },
  {
    name: "Chef",
    description: "View orders and menu items",
    color: "#f59e0b",
    permissions: [
      PERMISSIONS.VIEW_ORDERS,
      PERMISSIONS.VIEW_MENU,
    ],
  },
  {
    name: "Waiter",
    description: "View and manage orders",
    color: "#10b981",
    permissions: [
      PERMISSIONS.VIEW_ORDERS,
      PERMISSIONS.MANAGE_ORDERS,
      PERMISSIONS.VIEW_MENU,
    ],
  },
  {
    name: "Cashier",
    description: "View orders and analytics",
    color: "#3b82f6",
    permissions: [
      PERMISSIONS.VIEW_ORDERS,
      PERMISSIONS.VIEW_ANALYTICS,
    ],
  },
] as const;

// ============================================================================
// Utility Functions
// ============================================================================

export async function sha256Hex(input: string) {
  const enc = new TextEncoder();
  const bytes = enc.encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = Array.from(new Uint8Array(digest));
  return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function buildInviteToken() {
  return crypto.randomUUID();
}

