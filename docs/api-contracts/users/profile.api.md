# MadayawGas API Contract: User Profile

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, and response schemas for user self-service profile inspection and personal updates in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/users`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).

---

## Endpoints

### 1. Get Current User Profile (`/me`)

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

---

### 2. Update Current User Profile (`/me`)

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

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `firstName` | String | No | User first name |
| `lastName` | String | No | User last name |
| `phone` | String | No | Contact phone number (e.g. `+639171234567`) |
| `birthdate` | String | No | ISO Date string (`YYYY-MM-DD`) |

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
      "mustChangePassword": false
    }
  }
}
```
