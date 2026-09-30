# User Management & RBAC Subsystem — Entity Relationship Diagram (ERD)

> **Module**: User Management, Authentication & RBAC Subsystem  
> **Target Database**: PostgreSQL 18.x  
> **Key Architecture Decisions**:
> - **Multi-Role Architecture**: Supported via `user_roles` junction table (`user_id`, `role_id`, `is_primary`), while preserving `users.role_id` as the primary role pointer for backward compatibility.
> - **Stateful Session Lifecycle**: Sessions stored in `sessions` table (`mg_sid` cookie maps to `token_hash`). Enforces 8-hour rolling idle timeout (`expires_at`) and 30-day absolute ceiling.
> - **Credential Security & Autonomy**: Cryptographic temporary passwords generated on creation (`must_change_password = TRUE`). Plaintext passwords never stored.
> - **Administrative Audit Trail**: High-impact administrative actions tracked in `audit_logs` (`user_id`, `target_user_id`, `action`, `description`).

---

## 1. Mermaid Entity-Relationship Diagram

```mermaid
---
config:
  layout: elk
  theme: neutral
---

erDiagram

    %% ==========================================
    %% USER MANAGEMENT & RBAC TABLES
    %% ==========================================

    ROLES {
        uuid id PK
        string name UK "Super Admin, Admin, Logistics Supervisor, Sales Supervisor, Driver, Plant Supervisor"
        string description "Nullable"
        timestamptz created_at
    }

    PERMISSIONS {
        uuid id PK
        string name UK "e.g. users.manage, fleet.view, route.manage"
        string description "Nullable"
    }

    ROLE_PERMISSIONS {
        uuid role_id PK,FK
        uuid permission_id PK,FK
    }

    USERS {
        uuid id PK
        string username UK "System-automated e.g. jdoe"
        string password_hash "Bcrypt (10 salt rounds)"
        string first_name
        string last_name
        string phone "Nullable"
        date birthdate "Nullable"
        uuid role_id FK "Primary role pointer"
        boolean is_active "Default TRUE"
        boolean is_blocked "Default FALSE"
        boolean must_change_password "Default TRUE"
        timestamptz created_at
    }

    USER_ROLES {
        uuid user_id PK,FK
        uuid role_id PK,FK
        boolean is_primary "Default FALSE"
        timestamptz assigned_at
    }

    SESSIONS {
        uuid id PK
        uuid user_id FK
        string token_hash "SHA-256 session token hash"
        timestamptz created_at
        timestamptz expires_at "8-hour idle timeout"
        timestamptz revoked_at "Nullable"
    }

    AUDIT_LOGS {
        uuid id PK
        uuid user_id FK "Acting administrator"
        uuid target_user_id FK "Nullable target user"
        string action "e.g. USER_CREATED, ROLE_UPDATED"
        string description "Nullable"
        timestamptz created_at
    }


    %% ==========================================
    %% RELATIONSHIPS
    %% ==========================================

    %% RBAC Role Permissions
    ROLES ||--|{ ROLE_PERMISSIONS : "has"
    PERMISSIONS ||--|{ ROLE_PERMISSIONS : "assigned_to"

    %% Primary Role & Multi-Role Junction
    ROLES ||--o{ USERS : "primary_role_of"
    USERS ||--|{ USER_ROLES : "assigned_roles"
    ROLES ||--o{ USER_ROLES : "granted_via"

    %% User Sessions & Administrative Audit
    USERS ||--o{ SESSIONS : "authenticated_sessions"
    USERS ||--o{ AUDIT_LOGS : "performed_actions (user_id)"
    USERS ||--o{ AUDIT_LOGS : "targeted_in (target_user_id)"
```

---

## 2. Table Specifications

### `roles`
System-defined and organizational security roles.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique role identifier |
| `name` | `VARCHAR(50)` | No | `UNIQUE` | Role name (e.g. `Super Admin`, `Admin`, `Logistics Supervisor`) |
| `description` | `TEXT` | Yes | `NULL` | Role purpose and responsibility scope |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |

---

### `permissions`
Granular feature permissions protecting backend route endpoints.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique permission identifier |
| `name` | `VARCHAR(100)` | No | `UNIQUE` | Permission slug (e.g. `users.manage`, `fleet.view`, `route.manage`) |
| `description` | `TEXT` | Yes | `NULL` | Detailed action authority description |

---

### `role_permissions`
Many-to-many junction mapping permissions to organizational roles.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `role_id` | `UUID` | No | `FK -> roles(id)` | Parent role |
| `permission_id` | `UUID` | No | `FK -> permissions(id)` | Granted permission |

**Composite Primary Key:** `PRIMARY KEY (role_id, permission_id)`

---

### `users`
Core user account profiles for enterprise authentication.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique user identifier |
| `username` | `VARCHAR(50)` | No | `UNIQUE` | System-automated username (`first_name[0] + last_name`) |
| `password_hash` | `TEXT` | No | Bcrypt hashed string | Secure password hash (10 salt rounds) |
| `first_name` | `VARCHAR(100)` | No | Non-empty | First name |
| `last_name` | `VARCHAR(100)` | No | Non-empty | Last name |
| `phone` | `VARCHAR(20)` | Yes | `NULL` | Mobile contact number |
| `birthdate` | `DATE` | Yes | `NULL` | Birthdate |
| `role_id` | `UUID` | No | `FK -> roles(id)` | Primary role foreign key |
| `is_active` | `BOOLEAN` | No | `DEFAULT TRUE` | Account active state |
| `is_blocked` | `BOOLEAN` | No | `DEFAULT FALSE` | Security block indicator |
| `must_change_password` | `BOOLEAN` | No | `DEFAULT TRUE` | First-login password change gatekeeper |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Record creation timestamp |

---

### `user_roles`
Many-to-many junction enabling employees to hold multiple organizational roles concurrently.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `user_id` | `UUID` | No | `FK -> users(id) ON DELETE CASCADE` | Assigned user |
| `role_id` | `UUID` | No | `FK -> roles(id) ON DELETE RESTRICT` | Assigned role |
| `is_primary` | `BOOLEAN` | No | `DEFAULT FALSE` | Flags primary organizational role |
| `assigned_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Assignment timestamp |

**Composite Primary Key & Indexes:**
- `PRIMARY KEY (user_id, role_id)`
- `idx_user_roles_user_id`: Index on `user_roles(user_id)` for session authorization queries.
- `idx_user_roles_role_id`: Index on `user_roles(role_id)` for role membership queries.

---

### `sessions`
Stateful user sessions for secure HTTP cookie authentication.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Session record identifier |
| `user_id` | `UUID` | No | `FK -> users(id)` | Authenticated user |
| `token_hash` | `VARCHAR(255)` | No | SHA-256 hash | Hash of the client's `mg_sid` cookie |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Login session creation timestamp |
| `expires_at` | `TIMESTAMPTZ` | No | Timestamp | Rolling 8-hour idle expiry |
| `revoked_at` | `TIMESTAMPTZ` | Yes | `NULL` | Explicit logout or password change invalidation timestamp |

---

### `audit_logs`
Tracks administrative lifecycle actions and sensitive security modifications.

| Column | Data Type | Nullable | Default / Constraints | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Audit log identifier |
| `user_id` | `UUID` | No | `FK -> users(id)` | Administrator who performed the action |
| `target_user_id` | `UUID` | Yes | `FK -> users(id)` | Target user modified |
| `action` | `VARCHAR(100)` | No | Non-empty | Action slug (e.g. `USER_CREATED`, `USER_DEACTIVATED`, `ROLE_CHANGED`) |
| `description` | `TEXT` | Yes | `NULL` | Human-readable explanation and context |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT NOW()` | Audit timestamp |
