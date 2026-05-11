-- ============================================================================
-- Add position/shape columns to restaurant_tables for floor plan
-- Add additional_images to menu_items for multi-photo support
-- ============================================================================

-- Floor plan: position and shape data for visual table layout
ALTER TABLE public.restaurant_tables 
  ADD COLUMN IF NOT EXISTS x_pos FLOAT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS y_pos FLOAT DEFAULT 50,
  ADD COLUMN IF NOT EXISTS shape TEXT DEFAULT 'square' CHECK (shape IN ('square','round','rectangle')),
  ADD COLUMN IF NOT EXISTS floor TEXT DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS width FLOAT DEFAULT 80,
  ADD COLUMN IF NOT EXISTS height FLOAT DEFAULT 80;

COMMENT ON COLUMN public.restaurant_tables.x_pos IS 'X position on the floor plan canvas (percentage 0-100)';
COMMENT ON COLUMN public.restaurant_tables.y_pos IS 'Y position on the floor plan canvas (percentage 0-100)';
COMMENT ON COLUMN public.restaurant_tables.shape IS 'Visual shape: square, round, or rectangle';
COMMENT ON COLUMN public.restaurant_tables.floor IS 'Floor/zone name: main, patio, rooftop, etc.';

-- Menu item multi-photo support
ALTER TABLE public.menu_items 
  ADD COLUMN IF NOT EXISTS additional_images TEXT[] DEFAULT '{}';

COMMENT ON COLUMN public.menu_items.additional_images IS 'Array of additional image URLs for the menu item gallery (up to 4 extra)';
