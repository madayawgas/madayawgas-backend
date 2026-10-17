-- ============================================================
-- SALES & DELIVERY SUBSYSTEM (PHASE 1: TRANSACTIONS & RECEIVABLES)
-- Migration 015: Customer Schema Extension, Sales Transactions,
-- Line Items, Sales Invoices, and Canister Receivables Ledger
-- ============================================================

BEGIN;

-- ============================================================
-- 1. HELPER TRIGGER FUNCTION FOR UPDATED_AT
-- ============================================================

CREATE OR REPLACE FUNCTION update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 2. EXTEND CUSTOMERS TABLE SCHEMA & CONSTRAINTS
-- ============================================================

-- Convert customer_type column from customer_type_enum to VARCHAR(30) with check constraint
-- to accommodate RETAIL, RETAILER, COMMERCIAL, WHOLESALE, and HOUSEHOLD gracefully
ALTER TABLE "customers" ALTER COLUMN "customer_type" TYPE VARCHAR(30) USING customer_type::text;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CHK_customers_customer_type') THEN
        ALTER TABLE "customers" ADD CONSTRAINT "CHK_customers_customer_type" 
            CHECK (customer_type IN ('COMMERCIAL', 'RETAIL', 'RETAILER', 'WHOLESALE', 'HOUSEHOLD'));
    END IF;
END $$;

-- Add extended customer profile attributes
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "business_name" VARCHAR(150);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "contact_person" VARCHAR(100);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "alternate_contact_number" VARCHAR(30);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "tin" VARCHAR(30);
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "delivery_address" TEXT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "zone_id" UUID REFERENCES "service_zones"("id") ON DELETE RESTRICT;
ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "created_by" UUID REFERENCES "users"("id") ON DELETE SET NULL;

-- Backfill existing customer rows
UPDATE "customers"
SET contact_person = name
WHERE contact_person IS NULL;

UPDATE "customers"
SET delivery_address = address
WHERE delivery_address IS NULL;

-- Trigger to maintain synchronization between legacy (name, address) and new (contact_person, business_name, delivery_address) fields
CREATE OR REPLACE FUNCTION sync_customer_profile_columns()
RETURNS TRIGGER AS $$
BEGIN
    -- Sync address and delivery_address
    IF NEW.delivery_address IS NULL AND NEW.address IS NOT NULL THEN
        NEW.delivery_address = NEW.address;
    ELSIF NEW.address IS NULL AND NEW.delivery_address IS NOT NULL THEN
        NEW.address = NEW.delivery_address;
    END IF;

    -- Sync name, business_name, contact_person
    IF NEW.name IS NULL THEN
        NEW.name = COALESCE(NEW.business_name, NEW.contact_person, 'Customer');
    END IF;
    IF NEW.contact_person IS NULL THEN
        NEW.contact_person = NEW.name;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_customer_profile ON "customers";
CREATE TRIGGER trigger_sync_customer_profile
    BEFORE INSERT OR UPDATE ON "customers"
    FOR EACH ROW
    EXECUTE FUNCTION sync_customer_profile_columns();

-- Customer performance & lookup indexes
CREATE INDEX IF NOT EXISTS "idx_customers_zone_id" ON "customers" ("zone_id");
CREATE INDEX IF NOT EXISTS "idx_customers_business_name" ON "customers" ("business_name");
CREATE INDEX IF NOT EXISTS "idx_customers_contact_person" ON "customers" ("contact_person");


-- ============================================================
-- 3. SALES TRANSACTIONS (FRONTLINE VEHICLE ORDER HEADERS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "sales_transactions" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "transaction_no" VARCHAR(50) NOT NULL UNIQUE,
    "trip_id" UUID NOT NULL REFERENCES "trips"("id") ON DELETE RESTRICT,
    "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
    "recorded_by" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
    "status" VARCHAR(20) NOT NULL DEFAULT 'COMPLETED' CHECK ("status" IN ('COMPLETED', 'CANCELLED')),
    "cancellation_reason" TEXT,
    "cancelled_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "cancelled_at" TIMESTAMPTZ,
    "transacted_at" TIMESTAMPTZ NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sales_transactions_trip_id" ON "sales_transactions" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_sales_transactions_customer_id" ON "sales_transactions" ("customer_id");
CREATE INDEX IF NOT EXISTS "idx_sales_transactions_recorded_by" ON "sales_transactions" ("recorded_by");
CREATE INDEX IF NOT EXISTS "idx_sales_transactions_status" ON "sales_transactions" ("status");
CREATE INDEX IF NOT EXISTS "idx_sales_transactions_transacted_at" ON "sales_transactions" ("transacted_at");
CREATE INDEX IF NOT EXISTS "idx_sales_transactions_synced_at" ON "sales_transactions" ("synced_at");

DROP TRIGGER IF EXISTS trigger_update_sales_transactions_updated_at ON "sales_transactions";
CREATE TRIGGER trigger_update_sales_transactions_updated_at
    BEFORE UPDATE ON "sales_transactions"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 4. SALES TRANSACTION ITEMS (FROZEN MULTI-SKU LINE ITEMS)
-- ============================================================

CREATE TABLE IF NOT EXISTS "sales_transaction_items" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "transaction_id" UUID NOT NULL REFERENCES "sales_transactions"("id") ON DELETE CASCADE,
    "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
    "quantity_sold" INTEGER NOT NULL CHECK ("quantity_sold" >= 0),
    "empties_returned" INTEGER NOT NULL DEFAULT 0 CHECK ("empties_returned" >= 0),
    "empties_defective" INTEGER NOT NULL DEFAULT 0 CHECK ("empties_defective" >= 0),
    "unit_price_at_sale" NUMERIC(10, 2) NOT NULL CHECK ("unit_price_at_sale" >= 0),
    "subtotal_amount" NUMERIC(12, 2) NOT NULL CHECK ("subtotal_amount" >= 0),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sales_transaction_items_transaction_id" ON "sales_transaction_items" ("transaction_id");
CREATE INDEX IF NOT EXISTS "idx_sales_transaction_items_product_id" ON "sales_transaction_items" ("product_id");


-- ============================================================
-- 5. SALES INVOICES (BILLING, SETTLEMENT & GCASH PAYMENT PROOF)
-- ============================================================

CREATE TABLE IF NOT EXISTS "sales_invoices" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "transaction_id" UUID NOT NULL UNIQUE REFERENCES "sales_transactions"("id") ON DELETE CASCADE,
    "invoice_number" VARCHAR(50) NOT NULL UNIQUE,
    "declaration_number" VARCHAR(50) NOT NULL,
    "total_amount" NUMERIC(12, 2) NOT NULL CHECK ("total_amount" >= 0),
    "payment_method" VARCHAR(20) NOT NULL CHECK ("payment_method" IN ('CASH', 'GCASH')),
    "payment_status" VARCHAR(20) NOT NULL DEFAULT 'PAID_UNVERIFIED' CHECK ("payment_status" IN ('PAID_UNVERIFIED', 'VERIFIED')),
    "payment_reference_number" VARCHAR(100),
    "payment_proof_key" VARCHAR(255),
    "verified_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "verified_at" TIMESTAMPTZ,
    "transacted_at" TIMESTAMPTZ NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "idx_sales_invoices_transaction_id" ON "sales_invoices" ("transaction_id");
CREATE INDEX IF NOT EXISTS "idx_sales_invoices_invoice_number" ON "sales_invoices" ("invoice_number");
CREATE INDEX IF NOT EXISTS "idx_sales_invoices_declaration_number" ON "sales_invoices" ("declaration_number");
CREATE INDEX IF NOT EXISTS "idx_sales_invoices_payment_method" ON "sales_invoices" ("payment_method");
CREATE INDEX IF NOT EXISTS "idx_sales_invoices_payment_status" ON "sales_invoices" ("payment_status");

DROP TRIGGER IF EXISTS trigger_update_sales_invoices_updated_at ON "sales_invoices";
CREATE TRIGGER trigger_update_sales_invoices_updated_at
    BEFORE UPDATE ON "sales_invoices"
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp_column();


-- ============================================================
-- 6. CANISTER LEDGER (APPEND-ONLY RECEIVABLES & DEBT LEDGER)
-- ============================================================

CREATE TABLE IF NOT EXISTS "canister_ledger" (
    "id" UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    "customer_id" UUID NOT NULL REFERENCES "customers"("id") ON DELETE RESTRICT,
    "product_id" UUID NOT NULL REFERENCES "products"("id") ON DELETE RESTRICT,
    "trip_id" UUID NOT NULL REFERENCES "trips"("id") ON DELETE RESTRICT,
    "transaction_id" UUID NOT NULL REFERENCES "sales_transactions"("id") ON DELETE CASCADE,
    "quantity_loaned" INTEGER NOT NULL DEFAULT 0 CHECK ("quantity_loaned" >= 0),
    "quantity_returned" INTEGER NOT NULL DEFAULT 0 CHECK ("quantity_returned" >= 0),
    "net_balance_change" INTEGER NOT NULL,
    "transacted_at" TIMESTAMPTZ NOT NULL,
    "synced_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CHK_canister_ledger_net_balance" CHECK ("net_balance_change" = ("quantity_loaned" - "quantity_returned"))
);

CREATE INDEX IF NOT EXISTS "idx_canister_ledger_customer_product" ON "canister_ledger" ("customer_id", "product_id");
CREATE INDEX IF NOT EXISTS "idx_canister_ledger_trip_id" ON "canister_ledger" ("trip_id");
CREATE INDEX IF NOT EXISTS "idx_canister_ledger_transaction_id" ON "canister_ledger" ("transaction_id");
CREATE INDEX IF NOT EXISTS "idx_canister_ledger_transacted_at" ON "canister_ledger" ("transacted_at");

COMMIT;
