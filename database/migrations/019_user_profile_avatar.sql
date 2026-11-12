-- Migration 019: Add user profile avatar media key
-- ============================================================

BEGIN;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "avatar_media_key" VARCHAR(255) DEFAULT NULL;

COMMENT ON COLUMN "users"."avatar_media_key" IS 'Canonical relative storage key for user profile avatar (e.g. users/avatars/4b2a8f9c1d0e.jpg)';

COMMIT;
