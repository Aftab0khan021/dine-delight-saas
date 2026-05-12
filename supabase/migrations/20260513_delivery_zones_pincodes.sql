-- Add pincodes column to delivery_zones
ALTER TABLE delivery_zones ADD COLUMN IF NOT EXISTS pincodes TEXT[] DEFAULT '{}';
COMMENT ON COLUMN delivery_zones.pincodes IS 'Array of pincodes/zip codes served by this delivery zone';
