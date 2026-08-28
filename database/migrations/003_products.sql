-- ============================================================
-- INVENTORY SUBSYSTEM: PRODUCTS MIGRATION
-- ============================================================

-- Create custom ENUM type for container categories (guarded)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'container_type_enum') THEN
        CREATE TYPE container_type_enum AS ENUM ('CYLINDER', 'CANISTER');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS "products" (
    "id" UUID DEFAULT gen_random_uuid(),
    "name" VARCHAR(255) NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "container_type" container_type_enum NOT NULL,
    "net_weight_kg" NUMERIC(6, 3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_products_name" UNIQUE ("name"),
    CONSTRAINT "CHK_products_net_weight_kg" CHECK ("net_weight_kg" > 0)
);

-- Trigger function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_products_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_products_updated_at ON "products";
CREATE TRIGGER trigger_update_products_updated_at
    BEFORE UPDATE ON "products"
    FOR EACH ROW
    EXECUTE FUNCTION update_products_updated_at_column();