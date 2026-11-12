-- ============================================================
-- ADD 'RETURNED' VALUE TO TRIP_STATUS ENUM
-- Migration 020: Isolated enum alteration committed before value usage
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'trip_status' AND e.enumlabel = 'RETURNED'
    ) THEN
        ALTER TYPE trip_status ADD VALUE 'RETURNED' AFTER 'IN_PROGRESS';
    END IF;
END $$;
