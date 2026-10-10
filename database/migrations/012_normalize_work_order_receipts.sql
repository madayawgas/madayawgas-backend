-- ============================================================
-- FLEET & MAINTENANCE SUBSYSTEM MIGRATION
-- Migration 012: Normalize work_order_receipts to Visual Attachment Ledger
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS "work_order_receipts" CASCADE;

CREATE TABLE "work_order_receipts" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "work_order_id" UUID NOT NULL REFERENCES "work_orders"("id") ON DELETE CASCADE,
    "uploaded_by" UUID REFERENCES "users"("id") ON DELETE SET NULL,
    "file_url" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "idx_work_order_receipts_wo_id" ON "work_order_receipts"("work_order_id");

COMMIT;
