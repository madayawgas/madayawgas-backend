# MadayawGas API Contract: User Authentication & Sessions

This document specifies the HTTP endpoints, payload structures, cookie specifications, authentication mechanics, and response schemas for user authentication and session management in the MadayawGas Backend API.

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
- **First-Login Gatekeeper**:
  - Accounts with `mustChangePassword: true` are blocked from accessing operational endpoints with `403 Forbidden` (`code: MUST_CHANGE_PASSWORD`).
  - Permitted endpoints while in first-login state: `POST /api/users/change-password`, `GET /api/users/me`, and `POST /api/users/logout`.

---

## Endpoints

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
      "roles": [
        {
          "id": "d710521e-2549-43dd-a890-470fc0988ef8",
          "name": "Super Admin",
          "isPrimary": true
        }
      ],
      "roleNames": [
        "Super Admin"
      ],
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

#### Response: `400 Bad Request` (Invalid Password)

```json
{
  "status": "fail",
  "message": "Current password is incorrect"
}
```
