# MadayawGas API Contract: System Event History Log

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for System Event History Logs in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/history` (or `/api/history-logs`)
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `history.view` | View system event history logs across all modules | Super Admin, Admin |

---

## History Log Data Model & Format

### Frontend-Ready Object Format

Each log entry is formatted for direct display in frontend tables and filters:

| Field | Type | Description | Example |
| :--- | :--- | :--- | :--- |
| `id` | String (UUID) | Unique log entry identifier | `"1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"` |
| `date` | String | Formatted date string (`MMM DD, YYYY`) | `"Aug 24, 2026"` |
| `time` | String | Formatted 12-hour time string (`hh:mm A`) | `"08:30 AM"` |
| `userName` | String | Full name of acting user or `'System'` | `"Alejandro Doe"` |
| `userRole` | String | Role name of acting user | `"System Admin"` |
| `actionType` | String | Human-readable action type | `"Created"`, `"Updated"`, `"Deactivated"`, `"Assigned"`, `"Status Changed"` |
| `module` | String | System module classification | `"User Management"`, `"Fleet Management"`, `"Inventory Management"`, `"Sales & Delivery"`, `"Route Dispatch"` |
| `details` | String | Concise summary of the logged event | `"Created new user account for 'Juan Dela Cruz'"` |
| `action` | String | System machine action code | `"USER_CREATED"`, `"TRUCK_CREATED"`, `"PRODUCT_CREATED"`, `"CUSTOMER_CREATED"` |
| `targetId` | String \| null | UUID of the entity modified | `"27d6365b-bfb0-4ca7-b286-63d1bcfa2520"` |
| `targetType` | String \| null | Entity type classification | `"user"`, `"truck"`, `"product"`, `"customer"` |
| `metadata` | Object | Arbitrary JSON metadata for event details | `{"containerType": "CANISTER", "netWeightKg": 0.25}` |
| `createdAt` | String (ISO 8601) | Precise timestamp of event occurrence | `"2026-08-24T08:30:00.000Z"` |

---

## Endpoints

### 1. View History Logs (List, Filter, Search & Pagination)

Retrieves a paginated list of system history logs with support for module filtering, action type filtering, keyword search, and pagination.

- **HTTP Method**: `GET`
- **URL**: `/api/history` (or `/api/history-logs`)
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `history.view` (or dashboard/module view permissions)

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `module` | String | No | `All Modules` | Filter by module name (e.g. `'User Management'`, `'Fleet Management'`, `'Inventory Management'`, `'Sales & Delivery'`) |
| `actionType` | String | No | None | Filter by action type (e.g. `'Created'`, `'Updated'`, `'Deactivated'`, `'Assigned'`) |
| `search` | String | No | None | Case-insensitive search across `userName`, `details`, `actionType`, `module`, and `action` |
| `limit` | Number | No | `100` | Number of records to return per page |
| `offset` | Number | No | `0` | Offset for pagination |
| `startDate` | String (ISO) | No | None | Filter records created on or after date |
| `endDate` | String (ISO) | No | None | Filter records created on or before date |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 3,
    "total": 12,
    "logs": [
      {
        "id": "c1f725a3-7649-4eb5-8e5a-2cb7ea4c03b1",
        "date": "Aug 24, 2026",
        "time": "08:30 AM",
        "userName": "Alejandro Doe",
        "userRole": "System Admin",
        "actionType": "Created",
        "module": "User Management",
        "details": "Created new user account for 'Juan Dela Cruz'",
        "action": "USER_CREATED",
        "targetId": "d522513f-3665-4f7a-b9c1-5bb7d825c0a1",
        "targetType": "user",
        "metadata": {
          "username": "jcruz",
          "role": "Sales Person"
        },
        "createdAt": "2026-08-24T08:30:00.000Z"
      },
      {
        "id": "b2e6149a-6538-4da4-7d49-1ba6d93b02a0",
        "date": "Aug 24, 2026",
        "time": "09:15 AM",
        "userName": "Carlos Fleet",
        "userRole": "Fleet Manager",
        "actionType": "Assigned",
        "module": "Fleet Management",
        "details": "Assigned driver 'Juan Sales' to truck 'ABC-1001'",
        "action": "TRUCK_DRIVER_ASSIGNED",
        "targetId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        "targetType": "truck",
        "metadata": {},
        "createdAt": "2026-08-24T09:15:00.000Z"
      },
      {
        "id": "a3d50389-5427-4c93-6c38-0a95c82a019f",
        "date": "Aug 24, 2026",
        "time": "11:20 AM",
        "userName": "Alejandro Doe",
        "userRole": "System Admin",
        "actionType": "Deactivated",
        "module": "User Management",
        "details": "Deactivated account access for 'jcruz'",
        "action": "USER_DEACTIVATED",
        "targetId": "d522513f-3665-4f7a-b9c1-5bb7d825c0a1",
        "targetType": "user",
        "metadata": {
          "isActive": false,
          "isBlocked": false
        },
        "createdAt": "2026-08-24T11:20:00.000Z"
      }
    ]
  }
}
```

#### Error Responses

- **`401 Unauthorized`**: Missing or invalid session cookie (`mg_sid`).
- **`403 Forbidden`**: User has temporary credentials (`MUST_CHANGE_PASSWORD`) or lacks required permissions.

---

### 2. View Single History Log Detail

Retrieves a single system history log by its UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/history/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `history.view`

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the history log entry |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "log": {
      "id": "c1f725a3-7649-4eb5-8e5a-2cb7ea4c03b1",
      "date": "Aug 24, 2026",
      "time": "08:30 AM",
      "userName": "Alejandro Doe",
      "userRole": "System Admin",
      "actionType": "Created",
      "module": "User Management",
      "details": "Created new user account for 'Juan Dela Cruz'",
      "action": "USER_CREATED",
      "targetId": "d522513f-3665-4f7a-b9c1-5bb7d825c0a1",
      "targetType": "user",
      "metadata": {
        "username": "jcruz",
        "role": "Sales Person"
      },
      "createdAt": "2026-08-24T08:30:00.000Z"
    }
  }
}
```

#### Error Responses

- **`404 Not Found`**:
  ```json
  {
    "status": "fail",
    "message": "History log not found"
  }
  ```
