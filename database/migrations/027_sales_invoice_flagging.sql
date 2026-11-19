-- ============================================================
-- Migration 027: Sales Invoice Flagging & Resolution Support
-- Adds 'FLAGGED' to sales_invoices.payment_status and records
-- flag reason, review notes, actor, and timestamp.
-- ============================================================

BEGIN;

ALTER TABLE "sales_invoices"
    DROP CONSTRAINT IF EXISTS "sales_invoices_payment_status_check";

ALTER TABLE "sales_invoices"
    ADD CONSTRAINT "sales_invoices_payment_status_check"
    CHECK ("payment_status" IN ('PAID_UNVERIFIED', 'FLAGGED', 'VERIFIED'));

ALTER TABLE "sales_invoices"
    ADD COLUMN IF NOT EXISTS "flag_reason" VARCHAR(100),
    ADD COLUMN IF NOT EXISTS "flag_notes" TEXT,
    ADD COLUMN IF NOT EXISTS "flagged_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS "flagged_at" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_sales_invoices_flagged"
    ON "sales_invoices" ("payment_status")
    WHERE "payment_status" = 'FLAGGED';

COMMIT;
