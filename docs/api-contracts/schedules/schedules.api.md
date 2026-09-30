# MadayawGas API Contract: Schedule Subsystem

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for Service Zones, Weekly Schedule Templates, and Operational Daily Truck Schedules in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/schedules`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `route.view` | View all delivery routes, weekly master templates, and daily operational schedules | Super Admin, Admin, Logistics Supervisor |
| `route.view_own` | View operational route schedules specifically assigned to the authenticated user | Sales Person |
| `route.manage` | Create/update service zones, configure templates, generate schedules, and cancel runs | Super Admin, Admin, Logistics Supervisor |

---

## Data Models & Database Schemas

### 1. `service_zones` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique zone identifier |
| `code` | `VARCHAR(50)` | No | `UNIQUE` | Human-readable route code (e.g. `TORIL`) |
| `name` | `VARCHAR(100)` | No | `UNIQUE` | Distinct zone name |
| `description` | `TEXT` | Yes | Nullable | Operational zone description |
| `is_active` | `BOOLEAN` | No | `DEFAULT TRUE` | Active routing status flag |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Last updated timestamp |

### 2. `schedule_templates` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique template identifier |
| `truck_id` | `UUID` | No | `REFERENCES vehicles(id) ON DELETE CASCADE` | Assigned delivery truck |
| `zone_id` | `UUID` | No | `REFERENCES service_zones(id)` | Target service zone |
| `day_of_week` | `INT` | No | `CHECK (day_of_week BETWEEN 1 AND 7)` | Day of week (1=Mon, ..., 7=Sun) |
| `default_sales_user_id` | `UUID` | Yes | `REFERENCES users(id) ON DELETE SET NULL` | Default Sales Person |
| `is_active` | `BOOLEAN` | No | `DEFAULT TRUE` | Active template status |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Last updated timestamp |
| *Constraint* | - | - | `UNIQUE(truck_id, day_of_week)` | At most 1 template per truck/day |

### 3. `truck_schedules` Table
| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique operational schedule ID |
| `scheduled_date` | `DATE` | No | Date format `YYYY-MM-DD` | Calendar date of deployment |
| `truck_id` | `UUID` | No | `REFERENCES vehicles(id)` | Deployed delivery vehicle |
| `sales_user_id` | `UUID` | No | `REFERENCES users(id)` | Assigned Sales Person |
| `zone_id` | `UUID` | No | `REFERENCES service_zones(id)` | Target service zone |
| `created_by` | `UUID` | Yes | `REFERENCES users(id) ON DELETE SET NULL` | User who created/generated record |
| `status` | `schedule_status` | No | `'SCHEDULED'` \| `'DISPATCHED'` \| `'CANCELLED'` | Operational status |
| `notes` | `TEXT` | Yes | Nullable | Operational dispatch instructions |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Last updated timestamp |
| *Constraint* | - | - | `UNIQUE(truck_id, scheduled_date)` | Unique schedule per truck per date |

---

## Endpoints

### 1. Service Zones

#### `GET /api/schedules/zones`
List all delivery service zones.
- **Permission**: `route.view` or `route.view_own`
- **Query Parameters**: `isActive` (optional boolean), `search` (optional string)

#### `POST /api/schedules/zones`
Register a new delivery service zone.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "code": "TORIL",
  "name": "Toril District",
  "description": "Toril Commercial and Residential Route",
  "isActive": true
}
```

#### `PATCH /api/schedules/zones/:id`
Update an existing service zone.
- **Permission**: `route.manage`

---

### 2. Weekly Master Route Templates

#### `GET /api/schedules/templates`
List all weekly route templates.
- **Permission**: `route.view`
- **Query Parameters**: `truckId`, `dayOfWeek` (1-7), `zoneId`, `isActive`

#### `POST /api/schedules/templates`
Create a recurring weekly master template.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "truckId": "4a123456-7890-4abc-def1-234567890abc",
  "zoneId": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
  "dayOfWeek": 1,
  "defaultSalesUserId": "3c987654-3210-4cba-fed0-987654321cba",
  "isActive": true
}
```

#### `PATCH /api/schedules/templates/:id`
Update a weekly route template.
- **Permission**: `route.manage`

#### `DELETE /api/schedules/templates/:id`
Delete a weekly route template.
- **Permission**: `route.manage`

---

### 3. Operational Daily Truck Schedules

#### `GET /api/schedules`
List date-stamped operational truck schedules with filtering and pagination.
- **Permission**: `route.view` (all) or `route.view_own` (filtered to own assignments)
- **Query Parameters**:
  - `startDate`, `endDate`, `date` (`YYYY-MM-DD`)
  - `truckId`, `salesUserId`, `zoneId`, `status` (`SCHEDULED`, `DISPATCHED`, `CANCELLED`)
  - `page`, `limit` (standard pagination envelope)

#### `POST /api/schedules`
Create an ad-hoc single-day operational schedule.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "scheduledDate": "2026-10-06",
  "truckId": "4a123456-7890-4abc-def1-234567890abc",
  "salesUserId": "3c987654-3210-4cba-fed0-987654321cba",
  "zoneId": "7b8f9e6a-5432-41a9-83bc-9d0e12345678",
  "notes": "Emergency morning relief route"
}
```

#### `POST /api/schedules/generate`
Batch generate daily schedules from active weekly templates across a date range.
- Automatically skips grounded trucks (`UNDER_MAINTENANCE`, `INACTIVE`, `RETIRED`).
- Honors existing schedules and prevents duplicate booking on the same calendar date.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "startDate": "2026-10-05",
  "endDate": "2026-10-11"
}
```
- **Response**: `201 Created`
```json
{
  "status": "success",
  "data": {
    "dateRange": { "startDate": "2026-10-05", "endDate": "2026-10-11" },
    "generatedCount": 12,
    "skippedCount": 2,
    "skippedDetails": [
      {
        "date": "2026-10-05",
        "truckId": "...",
        "plateNumber": "ABC-1003",
        "reason": "Vehicle is UNDER_MAINTENANCE"
      }
    ],
    "generatedSchedules": [ ... ]
  }
}
```

#### `PATCH /api/schedules/:id`
Modify scheduled operational parameters (sales rep, zone, date, notes) prior to dispatch.
- **Permission**: `route.manage`

#### `PATCH /api/schedules/:id/cancel`
Cancel a scheduled run.
- **Permission**: `route.manage`
- **Request Body**:
```json
{
  "reason": "Vehicle breakdown or typhoon warning"
}
```
