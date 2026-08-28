-- ============================================================
-- SALES & DELIVERY SUBSYSTEM: CUSTOMERS MIGRATION
-- ============================================================

-- Create custom ENUM type for customer types (guarded)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'customer_type_enum') THEN
        CREATE TYPE customer_type_enum AS ENUM ('RETAIL', 'COMMERCIAL', 'WHOLESALE');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "customers" (
    "id" UUID DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "address" TEXT NOT NULL,
    "contact_number" VARCHAR(50) NOT NULL,
    "customer_type" customer_type_enum NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id")
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS "idx_customers_name" ON "customers" ("name");
CREATE INDEX IF NOT EXISTS "idx_customers_customer_type" ON "customers" ("customer_type");
CREATE INDEX IF NOT EXISTS "idx_customers_is_active" ON "customers" ("is_active");

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_customers_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_customers_updated_at ON "customers";
CREATE TRIGGER trigger_update_customers_updated_at
    BEFORE UPDATE ON "customers"
    FOR EACH ROW
    EXECUTE FUNCTION update_customers_updated_at_column();
