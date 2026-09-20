# MadayawGas API Contract: User Administration

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for administrator user lifecycle management, credentials provisioning, role assignment, and access state control in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/users`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Dangerous Operations & Password Confirmation

High-impact administrative actions require acting administrator password confirmation (`confirmPassword` / `adminPassword` in the JSON request body or `x-confirm-password` request header) enforced by `requirePasswordConfirmation` middleware:
1. `PATCH /api/users/:id/role`
2. `PATCH /api/users/:id/credentials`
3. `PATCH /api/users/:id/status`

If the password is missing, the API rejects with `401 Unauthorized` (`code: 'PASSWORD_CONFIRMATION_REQUIRED'`).
If the password is invalid, the API rejects with `401 Unauthorized` (`code: 'INVALID_CONFIRMATION_PASSWORD'`).

---

## Endpoints

### 1. List All Users

Returns a list of all user accounts with support for server-side pagination, search, role filtering, status filtering, and sorting.

- **HTTP Method**: `GET`
- **URL**: `/api/users`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.view` or `users.manage`

#### Query Parameters

| Parameter | Type | Required | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `page` | Integer | No | `1` | Page number (triggers standardized pagination envelope). Minimum `1`. |
| `limit` / `pageSize` | Integer | No | `20` | Items per page (clamped between `1` and `100`). Triggers standardized envelope. |
| `search` | String | No | None | Case-insensitive substring search matching `username`, `first_name`, or `last_name`. |
| `roleId` | UUID | No | None | Filter users assigned to a specific role UUID. |
| `isActive` | Boolean | No | None | Filter by active account status (`true` / `false`). |
| `isBlocked` | Boolean | No | None | Filter by blocked status (`true` / `false`). |
| `sortBy` | String | No | `createdAt` | Sort field: `createdAt`, `username`, `firstName`, `lastName`, `role`, `isActive`, `isBlocked`. |
| `sortOrder` | String | No | `DESC` | Sort direction: `ASC` or `DESC`. |

#### Response: `200 OK` (Standardized Paginated Format)
*Returned when `page`, `limit`, or `pageSize` query parameters are provided.*

```json
{
  "status": "success",
  "data": [
    {
      "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
      "username": "superadmin",
      "firstName": "Super",
      "lastName": "Admin",
      "phone": "+639170000001",
      "birthdate": null,
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
      "roles": [
        {
          "id": "d710521e-2549-43dd-a890-470fc0988ef8",
          "name": "Super Admin",
          "isPrimary": true
        }
      ],
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": false,
      "createdAt": "2026-08-25T08:37:47.789Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "totalItems": 15,
    "totalPages": 1,
    "hasNextPage": false,
    "hasPrevPage": false
  }
}
```

#### Response: `200 OK` (Legacy Unpaginated Format)
*Preserved for backward compatibility when pagination query parameters are omitted.*

```json
{
  "status": "success",
  "data": {
    "users": [
      {
        "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
        "username": "superadmin",
        "firstName": "Super",
        "lastName": "Admin",
        "phone": "+639170000001",
        "birthdate": null,
        "role": "Super Admin",
        "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
        "roles": [
          {
            "id": "d710521e-2549-43dd-a890-470fc0988ef8",
            "name": "Super Admin",
            "isPrimary": true
          }
        ],
        "isActive": true,
        "isBlocked": false,
        "mustChangePassword": false,
        "createdAt": "2026-08-25T08:37:47.789Z"
      }
    ]
  }
}
```

---

### 2. Register / Create User Account

Creates a new user account. **The system automatically generates the username (`firstName[0] + lastName`, e.g. `jdoe`) and a cryptographically secure temporary password.** Supports single-role assignment (`roleId`) or multi-role assignment (`roleIds` + `primaryRoleId`).

- **HTTP Method**: `POST`
- **URL**: `/api/users`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Request Body (Single Role)

```json
{
  "firstName": "Juan",
  "lastName": "Cruz",
  "phone": "+639171234567",
  "birthdate": "1995-10-20",
  "roleId": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84"
}
```

#### Request Body (Multi-Role)

```json
{
  "firstName": "Samantha",
  "lastName": "Doe",
  "phone": "+639171234588",
  "birthdate": "1992-04-10",
  "roleIds": [
    "5752c002-125c-42ae-9bc6-e78fffeaa583",
    "f2fef090-ffb9-47ff-b52e-6d9b4c4897f2"
  ],
  "primaryRoleId": "5752c002-125c-42ae-9bc6-e78fffeaa583"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `firstName` | String | Yes | User first name |
| `lastName` | String | Yes | User last name |
| `phone` | String | No | Contact phone number in any supported format. Automatically standardized to `+63...`. |
| `birthdate` | Date/String | No | User birthdate (YYYY-MM-DD or null) |
| `roleId` | UUID | Optional* | Target primary role ID (Required if `roleIds` is not provided) |
| `roleIds` | Array<UUID> | Optional* | Array of role IDs for multi-role assignment (e.g. Sales Supervisor + Logistics Supervisor) |
| `primaryRoleId` | UUID | Optional | Designates primary role among `roleIds` (defaults to first ID if omitted) |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "c1f7a4e2-...",
      "username": "jcruz",
      "firstName": "Juan",
      "lastName": "Cruz",
      "phone": "+639171234567",
      "birthdate": "1995-10-20",
      "role": "Sales Person",
      "roleId": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84",
      "roles": [
        {
          "id": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84",
          "name": "Sales Person",
          "isPrimary": true
        }
      ],
      "roleNames": [
        "Sales Person"
      ],
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": true,
      "createdAt": "2026-08-25T16:30:00.000Z"
    },
    "temporaryPassword": "Mg#8xK9pL2!"
  }
}
```

---

### 3. View User Profile by ID

Retrieves details for a specific user.

- **HTTP Method**: `GET`
- **URL**: `/api/users/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.view` OR Self (`id === req.user.id`)

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "c1f7a4e2-...",
      "username": "jcruz",
      "firstName": "Juan",
      "lastName": "Cruz",
      "phone": "+639171234567",
      "birthdate": "1995-10-20",
      "role": "Sales Person",
      "roleId": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84",
      "roles": [
        {
          "id": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84",
          "name": "Sales Person",
          "isPrimary": true
        }
      ],
      "roleNames": [
        "Sales Person"
      ],
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": true,
      "permissions": [
        "sales.view",
        "sales.create",
        "sales.update"
      ],
      "createdAt": "2026-08-25T16:30:00.000Z"
    }
  }
}
```

---

### 4. Update User Profile by ID

Updates profile information for a target user. Admins can update roles; users can update their own personal details.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage` OR Self (`id === req.user.id`)

#### Request Body

```json
{
  "firstName": "Juanito",
  "lastName": "Cruz",
  "phone": "+639179998877",
  "birthdate": "1995-10-20",
  "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `firstName` | String | No | Updated first name |
| `lastName` | String | No | Updated last name |
| `phone` | String | No | Updated contact number |
| `birthdate` | Date/String | No | Updated birthdate |
| `roleId` | UUID | No | Single role ID (Admin only, requires `users.manage`) |
| `roleIds` | Array<UUID> | No | Array of role IDs for multi-role (Admin only, requires `users.manage`) |
| `primaryRoleId` | UUID | No | Designates primary role among `roleIds` (Admin only) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "c1f7a4e2-...",
      "username": "jcruz",
      "firstName": "Juanito",
      "lastName": "Cruz",
      "phone": "+639179998877",
      "birthdate": "1995-10-20",
      "role": "Fleet Manager",
      "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
      "roles": [
        {
          "id": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
          "name": "Fleet Manager",
          "isPrimary": true
        }
      ],
      "roleNames": [
        "Fleet Manager"
      ],
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": true
    }
  }
}
```

---

### 5. Change User Role (Admin)

> [!CAUTION]
> **Dangerous Operation**: Modifying user roles alters system access permissions and immediately revokes all active sessions for the target user. Requires administrator password confirmation.

Updates a user's system role and reconfigures their permissions. Supports single-role (`roleId`) or multi-role (`roleIds` + `primaryRoleId`). Revokes all active sessions for the user so updated permissions apply immediately.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/:id/role`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` / `adminPassword` in body or `x-confirm-password` header)

#### Request Body (Single Role)

```json
{
  "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
  "confirmPassword": "AdminPassword123!"
}
```

#### Request Body (Multi-Role)

```json
{
  "roleIds": [
    "5752c002-125c-42ae-9bc6-e78fffeaa583",
    "f2fef090-ffb9-47ff-b52e-6d9b4c4897f2"
  ],
  "primaryRoleId": "5752c002-125c-42ae-9bc6-e78fffeaa583",
  "confirmPassword": "AdminPassword123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `roleId` | UUID | Optional* | Valid Role UUID to assign (Required if `roleIds` is not provided) |
| `roleIds` | Array<UUID> | Optional* | Array of valid Role UUIDs for multi-role assignment (e.g. Sales Supervisor + Logistics Supervisor) |
| `primaryRoleId` | UUID | Optional | Designates primary role among `roleIds` (defaults to first ID if omitted) |
| `confirmPassword` | String | **Yes** | Acting administrator's current account password |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "User role updated successfully",
  "data": {
    "user": {
      "id": "c1f7a4e2-...",
      "username": "jcruz",
      "firstName": "Juan",
      "lastName": "Cruz",
      "phone": "+639171234567",
      "birthdate": "1995-10-20",
      "role": "Fleet Manager",
      "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
      "roles": [
        {
          "id": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
          "name": "Fleet Manager",
          "isPrimary": true
        }
      ],
      "roleNames": [
        "Fleet Manager"
      ],
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": false,
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "fleet.manage",
        "route.view",
        "route.manage",
        "delivery.view",
        "delivery.update"
      ],
      "createdAt": "2026-08-25T16:30:00.000Z"
    }
  }
}
```

---

### 6. Update User Credentials / Reset Password (Admin Reset)

> [!CAUTION]
> **Dangerous Operation**: Resetting credentials generates a new temporary password and immediately invalidates all active sessions for the target user. Requires administrator password confirmation.

Allows an administrator to update a user's `username` or trigger a password reset. **Requires the administrator's password confirmation (`adminPassword` or `confirmPassword`)**. Automatically generates a new temporary password and revokes all existing sessions.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/:id/credentials`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` / `adminPassword` in body or `x-confirm-password` header)

#### Request Body

```json
{
  "resetPassword": true,
  "username": "jcruz_updated",
  "confirmPassword": "Superadmin123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `confirmPassword` | String | **Yes** | Logged-in administrator's password to confirm action |
| `resetPassword` | Boolean | Optional | Set to `true` to auto-generate a new temporary password |
| `username` | String | Optional | Updated unique username (min 3 chars) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "id": "c1f7a4e2-...",
    "username": "jcruz_updated",
    "firstName": "Juanito",
    "lastName": "Cruz",
    "role": "Fleet Manager",
    "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
    "mustChangePassword": true,
    "temporaryPassword": "Mg#4aB7zX9!",
    "message": "Temporary password generated. Target user must log in and change their password."
  }
}
```

---

### 7. Deactivate / Activate or Block / Unblock User Account

> [!CAUTION]
> **Dangerous Operation**: Deactivating or blocking a user immediately disables account access and terminates all active sessions. Requires administrator password confirmation. Super Admin accounts cannot be deactivated or blocked.

Updates a user account's active or blocked status. **Requires the administrator's password confirmation (`adminPassword` or `confirmPassword`)**. Revoking access (`isActive = false` or `isBlocked = true`) immediately invalidates all active sessions. Super Admin accounts cannot be deactivated or blocked.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/:id/status`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` / `adminPassword` in body or `x-confirm-password` header)

#### Request Body

```json
{
  "isActive": false,
  "isBlocked": true,
  "confirmPassword": "Superadmin123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `confirmPassword` | String | **Yes** | Logged-in administrator's password to confirm action |
| `isActive` | Boolean | Optional | Set user active state (`true` or `false`) |
| `isBlocked` | Boolean | Optional | Set user blocked state (`true` or `false`) |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "c1f7a4e2-...",
      "username": "jcruz",
      "firstName": "Juanito",
      "lastName": "Cruz",
      "phone": "+639179998877",
      "role": "Fleet Manager",
      "isActive": false,
      "isBlocked": true,
      "mustChangePassword": true
    }
  }
}
```
