-- Run this in Supabase SQL Editor
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS ip_address text;
