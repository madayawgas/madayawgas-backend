# MadayawGas API Contract: User & Authentication Endpoints

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, and response schemas for user authentication, session management, and user administration in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/users`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side sessions using HTTP-Only cookies.

---

## Session & Security Specifications

- **Cookie Name**: `mg_sid`
- **Cookie Security**: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` (production only).
- **Session Expiration Rules**:
  - **Idle Expiration**: 8 Hours (activity extends idle expiration).
  - **Absolute Expiration**: 30 Days (hard limit from creation, never extended by activity).

---

## Authentication Endpoints

### 1. User Login

Authenticates user credentials and creates a server-side session.

- **HTTP Method**: `POST`
- **URL**: `/api/users/login`
- **Authentication**: Public

#### Request Body

```json
{
  "username": "superadmin",
  "password": "Superadmin123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `username` | String | Yes | User username |
| `password` | String | Yes | User password |

#### Response: `200 OK` (Success)

Sets HTTP-Only `mg_sid` cookie.

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
      "username": "superadmin",
      "firstName": "Super",
      "lastName": "Admin",
      "phone": "+639170000001",
      "birthdate": null,
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": false,
      "permissions": [
        "dashboard.view",
        "fleet.view",
        "fleet.manage",
        "route.view",
        "route.view_own",
        "route.manage",
        "inventory.view",
        "inventory.manage",
        "sales.view",
        "sales.view_own",
        "sales.create",
        "sales.update",
        "sales.delete",
        "delivery.view",
        "delivery.view_own",
        "delivery.update",
        "delivery.update_own",
        "users.view",
        "users.manage"
      ]
    }
  }
}
```

#### Response: `401 Unauthorized` (Invalid Credentials)

```json
{
  "status": "fail",
  "message": "Invalid credentials"
}
```

---

### 2. User Logout

Invalidates the active server-side session in the database and clears the `mg_sid` cookie.

- **HTTP Method**: `POST`
- **URL**: `/api/users/logout`
- **Authentication**: Required (`mg_sid` cookie)

#### Response: `200 OK` (Success)

Clears `mg_sid` cookie (`Max-Age=0`).

```json
{
  "status": "success",
  "message": "Successfully logged out"
}
```

---

### 3. Change Password (Self)

Changes the authenticated user's password, sets `mustChangePassword = false`, and revokes all active sessions for security.

- **HTTP Method**: `POST`
- **URL**: `/api/users/change-password`
- **Authentication**: Required (`mg_sid` cookie)

#### Request Body (First Login / `mustChangePassword: true`)
When logging in for the first time with a temporary password, `currentPassword` is **not required**:
```json
{
  "newPassword": "NewSecurePassword456!"
}
```

#### Request Body (Voluntary Profile Change / `mustChangePassword: false`)
When an established user voluntarily changes their password:
```json
{
  "currentPassword": "OldPassword123!",
  "newPassword": "NewSecurePassword456!"
}
```

#### Response: `200 OK` (Success)

Clears current session cookie.

```json
{
  "status": "success",
  "message": "Password changed successfully. Please log in again."
}
```

---

## User Profile Endpoints

### 4. Get Current User Profile (`/me`)

Fetches profile details and permissions of the currently logged-in user.

- **HTTP Method**: `GET`
- **URL**: `/api/users/me`
- **Authentication**: Required (`mg_sid` cookie)

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
      "username": "superadmin",
      "firstName": "Super",
      "lastName": "Admin",
      "phone": "+639170000001",
      "birthdate": null,
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": false,
      "permissions": [...]
    }
  }
}
```

---

### 5. Update Current User Profile (`/me`)

Updates personal profile information of the currently authenticated user (`firstName`, `lastName`, `phone`, `birthdate`).

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/me`
- **Authentication**: Required (`mg_sid` cookie)

#### Request Body

```json
{
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "phone": "+639171234567",
  "birthdate": "1990-05-15"
}
```

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
      "username": "superadmin",
      "firstName": "Juan",
      "lastName": "Dela Cruz",
      "phone": "+639171234567",
      "birthdate": "1990-05-15T00:00:00.000Z",
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": false
    }
  }
}
```

---

## User Administration Endpoints (Admin)

### 6. List All Users

Returns a list of all user accounts.

- **HTTP Method**: `GET`
- **URL**: `/api/users`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.view` or `users.manage`

#### Response: `200 OK` (Success)

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

### 7. Register / Create User Account

Creates a new user account. **The system automatically generates the username (firstName[0] + lastName, e.g. jdoe) and temporary password.**

- **HTTP Method**: `POST`
- **URL**: `/api/users`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`

#### Request Body

```json
{
  "firstName": "Juan",
  "lastName": "Cruz",
  "phone": "+639171234567",
  "birthdate": "1995-10-20",
  "roleId": "98b3be70-2bd5-4a6d-be32-a9174cb1cb84"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `firstName` | String | Yes | User first name |
| `lastName` | String | Yes | User last name |
| `phone` | String | No | Contact phone number |
| `birthdate` | Date/String | No | User birthdate (YYYY-MM-DD or null) |
| `roleId` | UUID | Yes | Target role ID from roles table |

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

### 8. View User Profile by ID

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
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": true,
      "permissions": [...],
      "createdAt": "2026-08-25T16:30:00.000Z"
    }
  }
}
```

---

### 9. Update User Profile by ID

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
      "isActive": true,
      "isBlocked": false,
      "mustChangePassword": true
    }
  }
}
```

---

### 10. Change User Role (Admin)

> [!CAUTION]
> **Dangerous Operation**: Modifying user roles alters system access permissions and immediately revokes all active sessions for the target user. Requires administrator password confirmation.

Updates a user's system role and reconfigures their permissions. Revokes all active sessions for the user so updated permissions apply immediately.

- **HTTP Method**: `PATCH`
- **URL**: `/api/users/:id/role`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission**: `users.manage`
- **Dangerous Operation Guard**: Requires password confirmation (`confirmPassword` / `adminPassword` in body or `x-confirm-password` header)

#### Request Body

```json
{
  "roleId": "5f60e166-8de5-4dd9-bfdb-58e71ec5244b",
  "confirmPassword": "AdminPassword123!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `roleId` | UUID | **Yes** | Valid Role UUID to assign to the user |
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

### 11. Update User Credentials / Reset Password (Admin Reset)

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

### 12. Deactivate / Activate or Block / Unblock User Account

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

---

### 13. Get System Roles List

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

### 14. Get Single Role Details

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

### 15. Get System Permissions Catalog

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

### 16. Create System Role

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

### 17. Update System Role

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

### 18. Delete System Role

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

- **`400 Bad Request`**: Role is a protected system default role (`Super Admin`, `Admin`, `Fleet Manager`, `Sales Manager`, `Sales Person`, `Driver`) or has active assigned users.
- **`401 Unauthorized`**: Missing or incorrect confirmation password.
- **`404 Not Found`**: Role ID not found.

