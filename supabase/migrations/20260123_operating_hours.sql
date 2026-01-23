-- ============================================================
-- Phase 1: Operating Hours & Holiday Mode
-- Migration: Add operating hours and holiday mode support
-- ============================================================

-- Add operating hours columns to restaurants table
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS special_hours JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS is_holiday_mode BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS holiday_mode_message TEXT,
ADD COLUMN IF NOT EXISTS max_variants_per_item INTEGER DEFAULT 5;

-- Operating hours structure:
-- {
--   "monday": [{"open": "09:00", "close": "17:00"}, {"open": "18:00", "close": "22:00"}],
--   "tuesday": [{"open": "09:00", "close": "22:00"}],
--   "wednesday": [{"open": "09:00", "close": "22:00"}],
--   "thursday": [{"open": "09:00", "close": "22:00"}],
--   "friday": [{"open": "09:00", "close": "22:00"}],
--   "saturday": [{"open": "10:00", "close": "23:00"}],
--   "sunday": []  // closed
-- }

-- Special hours structure (for holidays/special days):
-- {
--   "2026-12-25": {"closed": true, "message": "Merry Christmas!"},
--   "2026-01-01": {"hours": [{"open": "12:00", "close": "18:00"}], "message": "New Year - Limited Hours"}
-- }

COMMENT ON COLUMN public.restaurants.operating_hours IS 'Weekly operating hours by day of week';
COMMENT ON COLUMN public.restaurants.special_hours IS 'Special hours for holidays and special days (date-based overrides)';
COMMENT ON COLUMN public.restaurants.is_holiday_mode IS 'Temporary closure mode';
COMMENT ON COLUMN public.restaurants.holiday_mode_message IS 'Custom message displayed during holiday mode';
COMMENT ON COLUMN public.restaurants.max_variants_per_item IS 'Maximum number of variants allowed per menu item (configurable by restaurant admin)';
