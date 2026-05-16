import type { Json } from "@/integrations/supabase/types";

// ─── Restaurant Settings ────────────────────────────────────────────────────
// Typed interface for the JSON `settings` column on the `restaurants` table.
// Eliminates `as any` casts across the entire codebase.

export interface ThemeConfig {
  primary_color?: string;
  font_family?: string;
  custom_css?: string;
}

export interface TaxConfig {
  rate_pct?: number;
  label?: string;
  enabled?: boolean;
}

export interface LoyaltyConfig {
  enabled?: boolean;
  points_per_100_spent?: number;
  points_to_currency?: number;
  min_redeem_points?: number;
}

export interface OtpConfig {
  enabled?: boolean;
  provider?: string;
  twilio_sid?: string;
  twilio_token?: string;
  twilio_from?: string;
  whatsapp_template_sid?: string;
}

export interface SocialLinks {
  instagram?: string;
  facebook?: string;
  twitter?: string;
  youtube?: string;
  tiktok?: string;
  website?: string;
  [key: string]: string | undefined;
}

export interface EventItem {
  title?: string;
  description?: string;
  date?: string;
  image_url?: string;
}

export interface TestimonialItem {
  name: string;
  text: string;
  rating: number;
}

export interface OperatingHoursSlot {
  open: string;
  close: string;
}

export interface OperatingHours {
  monday?: OperatingHoursSlot[];
  tuesday?: OperatingHoursSlot[];
  wednesday?: OperatingHoursSlot[];
  thursday?: OperatingHoursSlot[];
  friday?: OperatingHoursSlot[];
  saturday?: OperatingHoursSlot[];
  sunday?: OperatingHoursSlot[];
  [day: string]: OperatingHoursSlot[] | undefined;
}

export interface RestaurantSettings {
  // Theme & Branding
  theme?: ThemeConfig;

  // Tax
  tax_config?: TaxConfig;
  tax_rate?: number;
  tax_label?: string;

  // Loyalty
  loyalty_config?: LoyaltyConfig;

  // OTP / Verification
  otp_config?: OtpConfig;

  // Contact & Social
  whatsapp_number?: string;
  contact_phone?: string;
  contact_email?: string;
  address?: string;
  google_maps_url?: string;
  social_links?: SocialLinks;

  // Gallery & Content
  gallery_images?: string[];
  testimonials?: TestimonialItem[];
  chefs_story?: string;
  events?: EventItem[];

  // Operating Hours
  operating_hours?: OperatingHours;

  // Feature Toggles
  reservation_enabled?: boolean;
  holiday_mode?: boolean;
  holiday_mode_end_date?: string;
  auto_accept_orders?: boolean;
  notifications_enabled?: boolean;
  online_payments_enabled?: boolean;

  // Reviews
  auto_approve_reviews?: boolean;

  // Catch-all for future keys (avoids casting)
  [key: string]: unknown;
}

// ─── Platform Settings (super-admin) ────────────────────────────────────────

export interface PlatformSettings {
  platform_name?: string;
  support_email?: string;
  max_restaurants?: number | string;
  maintenance_mode?: boolean;
  new_signups_enabled?: boolean;
  manual_subscription_controls_enabled?: boolean | string;
  [key: string]: unknown;
}

// ─── Helper: safely parse Json | null into RestaurantSettings ───────────────

/**
 * Safely cast a Supabase `Json | null` value to `RestaurantSettings`.
 * Returns an empty object `{}` if the value is null, not an object, or an array.
 *
 * Usage:
 * ```ts
 * const settings = parseSettings(restaurant.settings);
 * const color = settings.theme?.primary_color;
 * ```
 */
export function parseSettings(raw: Json | null | undefined): RestaurantSettings {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as unknown as RestaurantSettings;
  }
  return {};
}

/**
 * Same as parseSettings but for the super-admin platform_settings table.
 */
export function parsePlatformSettings(raw: Json | null | undefined): PlatformSettings {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as unknown as PlatformSettings;
  }
  return {};
}
