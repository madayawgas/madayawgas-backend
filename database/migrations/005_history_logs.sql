-- ============================================================
-- SYSTEM EVENT HISTORY LOGS MIGRATION
-- ============================================================

CREATE TABLE IF NOT EXISTS "history_logs" (
    "id" UUID DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "user_name" VARCHAR(150) NOT NULL,
    "user_role" VARCHAR(100) NOT NULL,
    "action_type" VARCHAR(50) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "action" VARCHAR(100) NOT NULL,
    "details" TEXT NOT NULL,
    "target_id" VARCHAR(255),
    "target_type" VARCHAR(100),
    "metadata" JSONB DEFAULT '{}'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "FK_history_logs_user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
        ON DELETE SET NULL
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS "idx_history_logs_module" ON "history_logs" ("module");
CREATE INDEX IF NOT EXISTS "idx_history_logs_action_type" ON "history_logs" ("action_type");
CREATE INDEX IF NOT EXISTS "idx_history_logs_user_id" ON "history_logs" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_history_logs_created_at" ON "history_logs" ("created_at" DESC);

-- ============================================================
-- RBAC PERMISSION: history.view
-- ============================================================

INSERT INTO permissions (name, description)
VALUES ('history.view', 'View system event history logs.')
ON CONFLICT (name) DO NOTHING;

-- Grant history.view to Super Admin and Admin roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name IN ('Super Admin', 'Admin')
  AND p.name = 'history.view'
ON CONFLICT DO NOTHING;
