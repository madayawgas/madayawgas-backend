# MadayawGas API Contract: User & Authentication Endpoints

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, and response schemas for user authentication and session management in the MadayawGas Backend API.

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
| `username` | String | Yes | Unique system-generated username |
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
      "birthdate": null,
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
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

#### Request Body

None (empty body).

#### Response: `200 OK` (Success)

Clears `mg_sid` cookie (`Max-Age=0`).

```json
{
  "status": "success",
  "message": "Successfully logged out"
}
```

---

### 3. Get Current User Profile (`/me`)

Fetches details and permissions of the currently logged-in user.

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
      "birthdate": null,
      "role": "Super Admin",
      "roleId": "d710521e-2549-43dd-a890-470fc0988ef8",
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

#### Response: `401 Unauthorized` (Missing/Expired Session)

```json
{
  "status": "fail",
  "message": "Unauthorized"
}
```

---

### 4. Change Password

Changes the authenticated user's password and revokes all active sessions for security.

- **HTTP Method**: `POST`
- **URL**: `/api/users/change-password`
- **Authentication**: Required (`mg_sid` cookie)

#### Request Body

```json
{
  "currentPassword": "Superadmin123!",
  "newPassword": "NewSecurePassword456!"
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `currentPassword` | String | Yes | User's existing password |
| `newPassword` | String | Yes | New password (minimum 8 characters) |

#### Response: `200 OK` (Success)

Clears current session cookie.

```json
{
  "status": "success",
  "message": "Password changed successfully. Please log in again."
}
```

#### Response: `400 Bad Request` (Invalid Password Input)

```json
{
  "status": "fail",
  "message": "Current password is incorrect"
}
```

---

## Authorization & Response Status Codes

| Status Code | Meaning | Cause |
| :--- | :--- | :--- |
| **`200 OK`** | Success | Request succeeded |
| **`400 Bad Request`** | Validation Error | Missing required request body parameters or invalid format |
| **`401 Unauthorized`** | Authentication Failure | Invalid credentials, missing session cookie, or expired session |
| **`403 Forbidden`** | Permission Denied | Authenticated user lacks required RBAC permission |
| **`500 Internal Server Error`** | Server Error | Uncaught server error |
