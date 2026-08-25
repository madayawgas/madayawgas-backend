CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE "roles" (
    "id" UUID DEFAULT gen_random_uuid(),
    "name" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_roles_name" UNIQUE ("name")
);


CREATE TABLE "permissions" (
    "id" UUID DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,

    PRIMARY KEY ("id"),
    CONSTRAINT "UQ_permissions_name" UNIQUE ("name")
);


CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    PRIMARY KEY ("role_id", "permission_id"),

    CONSTRAINT "FK_role_permissions_role_id"
        FOREIGN KEY ("role_id")
        REFERENCES "roles"("id"),

    CONSTRAINT "FK_role_permissions_permission_id"
        FOREIGN KEY ("permission_id")
        REFERENCES "permissions"("id")
);


CREATE TABLE "users" (
    "id" UUID DEFAULT gen_random_uuid(),
    "username" VARCHAR(50) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(20),
    "birthdate" DATE,
    "role_id" UUID NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT TRUE,
    "is_blocked" BOOLEAN NOT NULL DEFAULT FALSE,
    "must_change_password" BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),

    CONSTRAINT "UQ_users_username" UNIQUE ("username"),

    CONSTRAINT "FK_users_role_id"
        FOREIGN KEY ("role_id")
        REFERENCES "roles"("id")
);


CREATE TABLE "audit_logs" (
    "id" UUID DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "target_user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY ("id"),

    CONSTRAINT "FK_audit_logs_user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id"),

    CONSTRAINT "FK_audit_logs_target_user_id"
        FOREIGN KEY ("target_user_id")
        REFERENCES "users"("id")
);


CREATE TABLE "sessions" (
    "id" UUID DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,

    PRIMARY KEY ("id"),

    CONSTRAINT "FK_sessions_user_id"
        FOREIGN KEY ("user_id")
        REFERENCES "users"("id")
);