-- Add is_daily_special flag to menu_items
-- Allows admins to mark any dish as "Today's Special" from the admin panel
-- instead of manually editing settings JSONB.

ALTER TABLE menu_items
  ADD COLUMN IF NOT EXISTS is_daily_special boolean NOT NULL DEFAULT false;

-- Index for fast public profile queries
CREATE INDEX IF NOT EXISTS idx_menu_items_daily_special
  ON menu_items (restaurant_id, is_daily_special)
  WHERE is_daily_special = true AND deleted_at IS NULL;

COMMENT ON COLUMN menu_items.is_daily_special IS
  'When true, this item appears in the Today''s Specials section on the public restaurant profile page.';
