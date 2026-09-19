# MadayawGas API Contract: Role & Permission Management

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for system role CRUD operations and system permission catalog queries in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/users`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Protected Default Roles

Core system default roles cannot be deleted:
- `Super Admin`
- `Admin`
- `Plant Supervisor`
- `Logistics Supervisor`
- `Sales Supervisor`
- `Fleet Manager`
- `Sales Manager`
- `Sales Person`
- `Driver`

Custom roles created by administrators can be updated and deleted (provided no users are currently assigned to them).

---

## Endpoints

### 1. Get System Roles List

Retrieves all system roles along with their assigned permissions and user counts.

- **HTTP Method**: `GET`
- **URL**: `/api/users/roles`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "roles": [
      {
        "id": "69f0702c-5b29-4d69-a1b7-769cf3500aa1",
        "name": "Admin",
        "description": "Administrator with unrestricted access to the system.",
        "permissions": [
          "dashboard.view",
          "fleet.view",
          "fleet.manage",
          "inventory.view",
          "inventory.manage",
          "sales.view",
          "users.manage",
          "history.view"
        ],
        "userCount": 2,
        "createdAt": "2026-08-25T16:00:00.000Z"
      },
      {
        "id": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
        "name": "Fleet Manager",
        "description": "Manages fleet, route dispatch, and operational activities.",
        "permissions": [
          "dashboard.view",
          "fleet.view",
          "fleet.manage",
          "route.view",
          "route.manage"
        ],
        "userCount": 1,
        "createdAt": "2026-08-25T16:00:00.000Z"
      }
    ]
  }
}
```

---

### 2. Get Single Role Details

Retrieves details for a single role by UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/users/roles/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Role unique identifier |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "role": {
      "id": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
      "name": "Fleet Manager",
      "description": "Manages fleet, route dispatch, and operational activities.",
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "fleet.manage",
        "route.view",
        "route.manage"
      ],
      "userCount": 1,
      "createdAt": "2026-08-25T16:00:00.000Z"
    }
  }
}
```

---

### 3. Get System Permissions Catalog

Retrieves the complete list of system permissions available for role assignment.

- **HTTP Method**: `GET`
- **URL**: `/api/users/permissions`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "permissions": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "name": "dashboard.view",
        "description": "View the dashboard."
      },
      {
        "id": "22222222-3333-4444-5555-666666666666",
        "name": "fleet.view",
        "description": "View fleet and maintenance information."
      },
      {
        "id": "33333333-4444-5555-6666-777777777777",
        "name": "fleet.manage",
        "description": "Create, update, and manage fleet and maintenance records."
      }
    ]
  }
}
```

---

### 4. Create System Role

Creates a new custom role and optionally assigns permissions.

- **HTTP Method**: `POST`
- **URL**: `/api/users/roles`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Request Body

```json
{
  "name": "Quality Inspector",
  "description": "Inspects LPG cylinder safety and truck condition",
  "permissions": [
    "dashboard.view",
    "fleet.view",
    "inventory.view"
  ]
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | **Yes** | Unique role name (minimum 2 characters) |
| `description` | String | No | Human-readable role description |
| `permissions` | Array<String> | No | Array of valid permission names to assign |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "message": "Role created successfully",
  "data": {
    "role": {
      "id": "99999999-aaaa-bbbb-cccc-dddddddddddd",
      "name": "Quality Inspector",
      "description": "Inspects LPG cylinder safety and truck condition",
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "inventory.view"
      ],
      "userCount": 0,
      "createdAt": "2026-08-29T21:40:00.000Z"
    }
  }
}
```

---

### 5. Update System Role

Updates an existing role's name, description, or assigned permissions. Automatically revokes active sessions for all users holding this role.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/roles/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Request Body

```json
{
  "name": "Lead Quality Inspector",
  "description": "Oversees safety and vehicle inspection standards",
  "permissions": [
    "dashboard.view",
    "fleet.view",
    "fleet.manage",
    "inventory.view",
    "inventory.manage"
  ]
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | No | Updated unique role name (min 2 chars) |
| `description` | String | No | Updated role description |
| `permissions` | Array<String> | No | Complete replacement array of permission names |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Role updated successfully",
  "data": {
    "role": {
      "id": "99999999-aaaa-bbbb-cccc-dddddddddddd",
      "name": "Lead Quality Inspector",
      "description": "Oversees safety and vehicle inspection standards",
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "fleet.manage",
        "inventory.view",
        "inventory.manage"
      ],
      "userCount": 0,
      "createdAt": "2026-08-29T21:40:00.000Z"
    }
  }
}
```

---

### 6. Delete System Role

> [!CAUTION]
> **Dangerous Operation**: Permanently deletes a custom system role. Core system default roles cannot be deleted. Roles with assigned users cannot be deleted. Requires password confirmation.

- **HTTP Method**: `DELETE`
- **URL**: `/api/users/roles/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` in body or `x-confirm-password` header)

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Role unique identifier |

#### Request Body

```json
{
  "confirmPassword": "AdminPassword123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `confirmPassword` | String | **Yes** | Logged-in administrator's password to confirm action |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Role 'Lead Quality Inspector' successfully deleted"
}
```

#### Error Responses

- **`400 Bad Request`**: Role is a protected system default role (`Super Admin`, `Admin`, `Plant Supervisor`, `Logistics Supervisor`, `Sales Supervisor`, `Fleet Manager`, `Sales Manager`, `Sales Person`, `Driver`) or has active assigned users.
- **`401 Unauthorized`**: Missing or incorrect confirmation password.
- **`404 Not Found`**: Role ID not found.
