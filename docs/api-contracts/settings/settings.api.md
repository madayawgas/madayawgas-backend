# System Settings API Contract

> **Base Path**: `/api/settings`  
> **Classification**: System Logic (Cross-Cutting Configuration)  
> **Source**: `src/features/settings/settings.routes.js`

---

## 1. Endpoints Overview

| Method | Endpoint | Description | Required Permission |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/settings/effective` | Retrieve non-secret effective operational thresholds and bounds for authenticated clients | Authenticated (any active role) |
| `GET` | `/api/settings` | List all configurable business system settings | `settings.view` |
| `GET` | `/api/settings/:key` | Retrieve a single system setting by its dot-delimited key | `settings.view` |
| `PATCH` | `/api/settings/:key` | Update a configurable system setting value (validated against type and min/max bounds) | `settings.manage` |

---

## 2. Endpoint Details

### 2.1 Get Effective Operational Config (`GET /api/settings/effective`)
Returns the current resolved operational thresholds (such as `fleet.pm_odometer_threshold_km`, `fleet.work_order_approval_threshold`, `operations.fuel_efficiency_variance_percent`, `operations.sos_dedup_window_seconds`, `inventory.canisters_per_crate`, and `schedules.max_generation_days`) for any authenticated user.

### 2.2 List All System Settings (`GET /api/settings`)
Requires `settings.view` (`Super Admin`, `Admin`). Returns all rows from `system_settings` including `key`, `value`, `value_type`, `category`, `label`, `description`, `unit`, `min_value`, `max_value`, `updated_by`, `created_at`, and `updated_at`.

### 2.3 Get Setting by Key (`GET /api/settings/:key`)
Requires `settings.view` (`Super Admin`, `Admin`). Returns the single setting matching `:key` or `404 Not Found` if it does not exist.

### 2.4 Update System Setting (`PATCH /api/settings/:key`)
Requires `settings.manage` (`Super Admin`, `Admin`).

**Request Body**:
```json
{
  "value": "5000"
}
```

Validates `value` against the setting's `value_type` (`INTEGER`, `NUMBER`, `BOOLEAN`, `STRING`) and optional `min_value` / `max_value` bounds, updates `updated_by` and `updated_at`, and records a system event in `history_logs`.
