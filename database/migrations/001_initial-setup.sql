-- ==========================================
-- 001_initial_auth.sql
-- Authentication and User Management
-- ==========================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- Roles
-- ==========================================

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- Users
-- ==========================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    role_id UUID NOT NULL,

    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,

    first_name VARCHAR(100) NOT NULL,
    middle_name VARCHAR(100),
    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255) UNIQUE,
    contact_number VARCHAR(20),

    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_users_role
        FOREIGN KEY (role_id)
        REFERENCES roles(id)
        ON DELETE RESTRICT
);

-- ==========================================
-- Seed System Roles
-- ==========================================

INSERT INTO roles (name, description)
VALUES
('Super Admin', 'Full system access'),
('Manager', 'Business monitoring and reporting'),
('Dispatcher', 'Truck dispatching and route management'),
('Warehouse Staff', 'Warehouse inventory operations'),
('Driver', 'Mobile application access');