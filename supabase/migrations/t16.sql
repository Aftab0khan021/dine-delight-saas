-- Add deleted_at to menu_items
ALTER TABLE public.menu_items ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
