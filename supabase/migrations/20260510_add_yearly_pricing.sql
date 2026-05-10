-- Add yearly pricing column to subscription_plans
ALTER TABLE subscription_plans
ADD COLUMN IF NOT EXISTS yearly_price_cents INTEGER DEFAULT 0;

COMMENT ON COLUMN subscription_plans.yearly_price_cents IS 'Annual price in cents (paise). Typically discounted vs 12x monthly.';

-- Seed yearly prices for existing plans (~16% discount vs monthly * 12)
UPDATE subscription_plans SET yearly_price_cents = 29000  WHERE slug = 'starter';      -- ₹290/yr vs ₹348 (₹29*12)
UPDATE subscription_plans SET yearly_price_cents = 79000  WHERE slug = 'professional';  -- ₹790/yr vs ₹948 (₹79*12)
UPDATE subscription_plans SET yearly_price_cents = 199000 WHERE slug = 'enterprise';    -- ₹1990/yr vs ₹2388 (₹199*12)
