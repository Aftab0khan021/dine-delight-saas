-- 1. Index for Soft Deletes (Speed up Menu Loading)
CREATE INDEX IF NOT EXISTS idx_menu_items_active_deleted 
ON public.menu_items (is_active, deleted_at);

CREATE INDEX IF NOT EXISTS idx_categories_active_deleted 
ON public.categories (is_active, deleted_at);

-- 2. Index for Store Hours (Speed up "Is Open?" check)
CREATE INDEX IF NOT EXISTS idx_restaurants_accepting_orders 
ON public.restaurants (is_accepting_orders);

-- 3. Index for Order Tokens (Speed up Order Tracking)
CREATE INDEX IF NOT EXISTS idx_orders_token 
ON public.orders (order_token);
