-- ============================================================
-- FLEET SUBSYSTEM: TRUCKS MIGRATION
-- ============================================================

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'truck_status') THEN
        CREATE TYPE truck_status AS ENUM (
            'ACTIVE',
            'INACTIVE',
            'UNDER_MAINTENANCE',
            'RETIRED'
        );
    END IF;
END $$;


-- ============================================================
-- 2. TRUCKS (FLEET VEHICLES)
-- ============================================================

CREATE TABLE "trucks" (
    "id" UUID DEFAULT gen_random_uuid(),
    "driver_id" UUID,
    "plate_number" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100) NOT NULL,
    "year_model" INT NOT NULL,
    "current_odometer" INT NOT NULL DEFAULT 0,
    "last_pm_odometer" INT NOT NULL DEFAULT 0,
    "status" truck_status NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_trucks_driver_id" UNIQUE ("driver_id"),
    CONSTRAINT "UQ_trucks_plate_number" UNIQUE ("plate_number"),
    CONSTRAINT "CHK_trucks_current_odometer" CHECK ("current_odometer" >= 0),
    CONSTRAINT "CHK_trucks_last_pm_odometer" CHECK ("last_pm_odometer" >= 0),

    CONSTRAINT "FK_trucks_driver_id"
        FOREIGN KEY ("driver_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);

-- Trigger function to automatically update updated_at timestamp on trucks
CREATE OR REPLACE FUNCTION update_trucks_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_trucks_updated_at ON "trucks";
CREATE TRIGGER trigger_update_trucks_updated_at
    BEFORE UPDATE ON "trucks"
    FOR EACH ROW
    EXECUTE FUNCTION update_trucks_updated_at_column();


-- ============================================================
-- 3. PERFORMANCE INDEXES
-- ============================================================

CREATE INDEX "IX_trucks_driver_id" ON "trucks" ("driver_id");
