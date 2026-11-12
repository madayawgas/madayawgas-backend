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
      "avatarMediaKey": "users/avatars/b4e6a8c1f0d2394e.jpg",
      "avatarUrl": "http://localhost:5000/media/users/avatars/b4e6a8c1f0d2394e.jpg",
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
| `avatarMediaKey` | String \| null | No | Canonical storage key or full URL to set avatar; pass `null` to clear avatar |

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
      "mustChangePassword": false,
      "avatarMediaKey": "users/avatars/b4e6a8c1f0d2394e.jpg",
      "avatarUrl": "http://localhost:5000/media/users/avatars/b4e6a8c1f0d2394e.jpg"
    }
  }
}
```

---

### 3. Upload / Replace Own Profile Picture (`/me/avatar`)

Uploads a new avatar image for the currently authenticated user. Automatically deletes the previous avatar photo from active storage (local disk / Supabase bucket) to preserve space.

- **HTTP Method**: `POST`
- **URL**: `/api/users/me/avatar`
- **Authentication**: Required (`mg_sid` cookie or Bearer token)
- **Request Format**: `multipart/form-data`

#### Form Fields
| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `avatar` (or `file`) | Binary File | **Yes** | Image binary stream (<= 5 MB; JPEG, PNG, WebP) |

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
      "avatarMediaKey": "users/avatars/b4e6a8c1f0d2394e.jpg",
      "avatarUrl": "http://localhost:5000/media/users/avatars/b4e6a8c1f0d2394e.jpg"
    },
    "avatarUrl": "http://localhost:5000/media/users/avatars/b4e6a8c1f0d2394e.jpg",
    "avatarMediaKey": "users/avatars/b4e6a8c1f0d2394e.jpg"
  }
}
```

#### Error Responses
- `400 Bad Request` (`FILE_REQUIRED`): No file uploaded.
- `400 Bad Request` (`UNSUPPORTED_MEDIA_TYPE`): Non-image file uploaded (e.g. PDF or plain text).
- `413 Payload Too Large` (`FILE_TOO_LARGE`): File size exceeds 5 MB.

---

### 4. Remove Own Profile Picture (`DELETE /me/avatar`)

Removes the current user's profile picture, setting `avatar_media_key = NULL` and permanently unlinking the file asset from storage.

- **HTTP Method**: `DELETE`
- **URL**: `/api/users/me/avatar`
- **Authentication**: Required (`mg_sid` cookie or Bearer token)

#### Response: `200 OK` (Success)
```json
{
  "status": "success",
  "data": {
    "user": {
      "id": "08df2719-0473-4a31-8b5c-dc977d6006c5",
      "username": "superadmin",
      "avatarMediaKey": null,
      "avatarUrl": null
    }
  }
}
```

---

### 5. Admin Upload / Replace Avatar (`POST /:id/avatar`)

Uploads or replaces the avatar for any target user. Requires `users.manage` permission (or user uploading for themselves). Automatically deletes the previous avatar photo from active storage.

- **HTTP Method**: `POST`
- **URL**: `/api/users/:id/avatar`
- **Authentication**: Required (`users.manage` permission)
- **Request Format**: `multipart/form-data` (`avatar` or `file`)

---

### 6. Admin Remove Avatar (`DELETE /:id/avatar`)

Removes the avatar for any target user and purges the file from active storage. Requires `users.manage` permission (or self).

- **HTTP Method**: `DELETE`
- **URL**: `/api/users/:id/avatar`
- **Authentication**: Required (`users.manage` permission)

