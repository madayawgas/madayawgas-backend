-- ============================================================
-- HARDENING SCHEDULES, TRIPS, AND INVENTORY DATA INTEGRITY
-- Migration 014: Status-Filtered Partial Unique Indexes
-- and Active Trip Guards
-- ============================================================

-- 1. Drop unconditional unique constraint on truck_schedules (truck_id, scheduled_date)
ALTER TABLE "truck_schedules" DROP CONSTRAINT IF EXISTS "UQ_truck_schedules_truck_date";

-- 2. Clean up any historical duplicate assignments before creating partial unique indexes
WITH duplicates AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY sales_user_id, scheduled_date ORDER BY created_at ASC) as rn
    FROM truck_schedules
    WHERE status != 'CANCELLED'
),
alternate_sales AS (
    SELECT id FROM users WHERE username = 'suser1' LIMIT 1
)
UPDATE truck_schedules ts
SET sales_user_id = (SELECT id FROM alternate_sales)
WHERE ts.id IN (SELECT id FROM duplicates WHERE rn > 1)
  AND (SELECT id FROM alternate_sales) IS NOT NULL;

UPDATE trips t
SET sales_user_id = ts.sales_user_id
FROM truck_schedules ts
WHERE t.schedule_id = ts.id
  AND t.sales_user_id != ts.sales_user_id;

-- 3. Create partial unique indexes for truck_schedules
-- Allows re-scheduling a truck on the same date if the prior schedule was CANCELLED
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_truck_schedules_active_truck_date" 
    ON "truck_schedules" ("truck_id", "scheduled_date") 
    WHERE "status" != 'CANCELLED';

-- Enforce that a Sales Person cannot be scheduled on multiple vehicles on the same date
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_truck_schedules_active_sales_date" 
    ON "truck_schedules" ("sales_user_id", "scheduled_date") 
    WHERE "status" != 'CANCELLED';

-- 4. Create partial unique index for schedule_templates
-- Prevent assigning the same default sales person to multiple active templates on the same weekday
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_schedule_templates_active_sales_day" 
    ON "schedule_templates" ("default_sales_user_id", "day_of_week") 
    WHERE "is_active" = TRUE AND "default_sales_user_id" IS NOT NULL;

-- 5. Create partial unique indexes for active trips
-- Guarantees that at most 1 active trip (PENDING or IN_PROGRESS) can exist per truck, driver, and sales rep
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_trips_active_truck" 
    ON "trips" ("truck_id") 
    WHERE "status" IN ('PENDING', 'IN_PROGRESS');

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_trips_active_driver" 
    ON "trips" ("driver_id") 
    WHERE "status" IN ('PENDING', 'IN_PROGRESS');

CREATE UNIQUE INDEX IF NOT EXISTS "UQ_trips_active_sales_user" 
    ON "trips" ("sales_user_id") 
    WHERE "status" IN ('PENDING', 'IN_PROGRESS');

-- 6. Index for fast querying of overdue unclosed trips
CREATE INDEX IF NOT EXISTS "IX_trips_overdue_checkin" 
    ON "trips" ("departure_time") 
    WHERE "status" IN ('PENDING', 'IN_PROGRESS');
