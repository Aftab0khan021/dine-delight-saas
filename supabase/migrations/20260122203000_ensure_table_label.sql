-- Ensure table_label column exists on orders table
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'table_label') THEN
        ALTER TABLE orders ADD COLUMN table_label TEXT;
    END IF;
END $$;
