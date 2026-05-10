-- Add bill_breakdown JSONB column to orders table
-- Stores the full breakdown: tax label/rate, extra charges (CGST, SGST, service charge, packing, etc.)
-- The individual tax_cents and tip_cents columns already exist.

ALTER TABLE orders
ADD COLUMN IF NOT EXISTS bill_breakdown JSONB DEFAULT '{}';

COMMENT ON COLUMN orders.bill_breakdown IS 'Full bill breakdown: { tax_label, tax_rate_pct, extra_charges: [{label, cents}] }';
