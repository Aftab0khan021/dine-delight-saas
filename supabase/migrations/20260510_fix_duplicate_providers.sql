-- ============================================================
-- Fix: Remove duplicate AI provider rows
-- The seed migration was run twice, creating duplicate entries
-- ============================================================

-- Step 1: Delete duplicate rows, keeping only the one with the lowest id
DELETE FROM public.ai_providers
WHERE id NOT IN (
    SELECT DISTINCT ON (provider_type, provider_name) id
    FROM public.ai_providers
    ORDER BY provider_type, provider_name, created_at ASC
);

-- Step 2: Add UNIQUE constraint to prevent future duplicates
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'ai_providers_type_name_unique'
    ) THEN
        ALTER TABLE public.ai_providers
        ADD CONSTRAINT ai_providers_type_name_unique
        UNIQUE (provider_type, provider_name);
    END IF;
END $$;
