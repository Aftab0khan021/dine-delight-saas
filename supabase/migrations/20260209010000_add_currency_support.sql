-- Add currency support to restaurants
-- Allows restaurant admins to choose their preferred currency
-- Default is INR (Indian Rupee)

-- Add currency_code column to restaurants table
ALTER TABLE public.restaurants 
ADD COLUMN IF NOT EXISTS currency_code TEXT NOT NULL DEFAULT 'INR';

-- Add check constraint for valid currency codes
ALTER TABLE public.restaurants
ADD CONSTRAINT valid_currency_code CHECK (
  currency_code IN ('INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'JPY', 'CNY')
);

-- Update existing restaurants to use INR
UPDATE public.restaurants 
SET currency_code = 'INR' 
WHERE currency_code IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.restaurants.currency_code IS 'ISO 4217 currency code for restaurant pricing (default: INR)';
