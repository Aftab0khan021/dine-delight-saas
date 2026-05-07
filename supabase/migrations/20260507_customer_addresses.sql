-- Migration to add saved_addresses to customer_profiles
ALTER TABLE public.customer_profiles
ADD COLUMN IF NOT EXISTS saved_addresses JSONB DEFAULT '[]';

COMMENT ON COLUMN public.customer_profiles.saved_addresses IS 'List of saved addresses for the customer {label, address}';
