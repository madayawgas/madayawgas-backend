# MadayawGas API Contract: Inventory Item/Product CRUD (Item Profile)

This document specifies the HTTP endpoints, payload structures, headers, authentication mechanics, RBAC permissions, and response schemas for Item Profile and Product management in the MadayawGas Backend API.

---

## General Information

- **Base URL Path**: `/api/inventory`
- **Request / Response Format**: `application/json`
- **Authentication**: Server-side session via HTTP-Only cookie (`mg_sid`).
- **Authorization**: Role-Based Access Control (RBAC).

---

## Permissions Summary

| Permission | Description | Allowed Roles (Default) |
| :--- | :--- | :--- |
| `inventory.view` | View inventory items, product listings, and item profiles | Super Admin, Admin, Fleet Manager |
| `inventory.manage` | Register new products, update item profiles, and deactivate products | Super Admin, Admin |

---

## Product Catalog & Data Model

### Company Standard Products
MadayawGas distributes three standard product lines:
1. **Butane Canister 250g** (*Main Product*): Container type `CANISTER`, Net weight `0.250` kg, Category `Canister`.
2. **11kg LPG Cylinder**: Container type `CYLINDER`, Net weight `11.000` kg, Category `LPG Cylinder`.
3. **22kg LPG Cylinder**: Container type `CYLINDER`, Net weight `22.000` kg, Category `LPG Cylinder`.

### `products` Table Schema

| Column | Type | Nullable | Constraints & Defaults | Description |
| :--- | :--- | :--- | :--- | :--- |
| `id` | `UUID` | No | `PRIMARY KEY DEFAULT gen_random_uuid()` | Unique product identifier |
| `name` | `VARCHAR(255)` | No | Non-empty | Product item name |
| `category` | `VARCHAR(100)` | No | Non-empty | Product classification / category |
| `container_type` | `container_type_enum` | No | `'CYLINDER'` \| `'CANISTER'` | Container type category |
| `net_weight_kg` | `NUMERIC(6, 3)` | No | `CHECK (net_weight_kg > 0)` | Net gas capacity in kilograms |
| `is_active` | `BOOLEAN` | No | `DEFAULT true` | Active operational status indicator |
| `created_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record creation timestamp |
| `updated_at` | `TIMESTAMPTZ` | No | `DEFAULT CURRENT_TIMESTAMP` | Record last updated timestamp |

---

## Endpoints

### 1. Register Item / Product

Registers a new product item into the inventory system.

- **HTTP Method**: `POST`
- **URL**: `/api/inventory/products`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `inventory.manage`

#### Request Headers

```http
Content-Type: application/json
```

#### Request Body

```json
{
  "name": "Butane Canister 250g",
  "category": "Canister",
  "containerType": "CANISTER",
  "netWeightKg": 0.250,
  "isActive": true
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | Yes | Name of the product item (1-255 characters) |
| `category` | String | Yes | Product category (1-100 characters) |
| `containerType` | String | Yes | Container type (`CYLINDER` or `CANISTER`) |
| `netWeightKg` | Number | Yes | Positive numeric weight in kg (`> 0`, max `999.999`) |
| `isActive` | Boolean | No | Optional initial status (defaults to `true`) |

#### Response: `201 Created` (Success)

```json
{
  "status": "success",
  "data": {
    "product": {
      "id": "33333333-3333-3333-3333-000000000001",
      "name": "Butane Canister 250g",
      "category": "Canister",
      "containerType": "CANISTER",
      "netWeightKg": 0.25,
      "isActive": true,
      "createdAt": "2026-08-28T12:20:00.000Z",
      "updatedAt": "2026-08-28T12:20:00.000Z"
    }
  }
}
```

#### Error Responses

- **`400 Bad Request`**: Missing required fields, invalid container type, or invalid net weight.
  ```json
  {
    "status": "fail",
    "message": "Net weight (kg) must be a positive number greater than 0"
  }
  ```
- **`401 Unauthorized`**: Missing or invalid session cookie (`mg_sid`).
- **`403 Forbidden`**: Insufficient permissions (requires `inventory.manage`).

---

### 2. View Item Profiles (List & Search)

Retrieves a list of product items with optional filtering by status, container type, category, or search term.

- **HTTP Method**: `GET`
- **URL**: `/api/inventory/products`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `inventory.view`

#### Query Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `isActive` | Boolean / String | No | Filter by active flag (`true` / `false`) |
| `status` | String | No | Filter by status string (`ACTIVE` / `INACTIVE`) |
| `containerType` | String | No | Filter by container type (`CYLINDER` / `CANISTER`) |
| `category` | String | No | Filter by category (case-insensitive substring match) |
| `search` | String | No | Search across product `name` or `category` |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "count": 3,
    "products": [
      {
        "id": "33333333-3333-3333-3333-000000000001",
        "name": "Butane Canister 250g",
        "category": "Canister",
        "containerType": "CANISTER",
        "netWeightKg": 0.25,
        "isActive": true,
        "createdAt": "2026-08-28T12:20:00.000Z",
        "updatedAt": "2026-08-28T12:20:00.000Z"
      },
      {
        "id": "33333333-3333-3333-3333-000000000002",
        "name": "11kg LPG Cylinder",
        "category": "LPG Cylinder",
        "containerType": "CYLINDER",
        "netWeightKg": 11,
        "isActive": true,
        "createdAt": "2026-08-28T12:20:00.000Z",
        "updatedAt": "2026-08-28T12:20:00.000Z"
      },
      {
        "id": "33333333-3333-3333-3333-000000000003",
        "name": "22kg LPG Cylinder",
        "category": "LPG Cylinder",
        "containerType": "CYLINDER",
        "netWeightKg": 22,
        "isActive": true,
        "createdAt": "2026-08-28T12:20:00.000Z",
        "updatedAt": "2026-08-28T12:20:00.000Z"
      }
    ]
  }
}
```

---

### 3. View Single Item Profile

Retrieves the complete profile information of a single product item by UUID.

- **HTTP Method**: `GET`
- **URL**: `/api/inventory/products/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `inventory.view`

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the product |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "product": {
      "id": "33333333-3333-3333-3333-000000000001",
      "name": "Butane Canister 250g",
      "category": "Canister",
      "containerType": "CANISTER",
      "netWeightKg": 0.25,
      "isActive": true,
      "createdAt": "2026-08-28T12:20:00.000Z",
      "updatedAt": "2026-08-28T12:20:00.000Z"
    }
  }
}
```

#### Error Responses

- **`404 Not Found`**: Product with specified UUID does not exist.
  ```json
  {
    "status": "fail",
    "message": "Product not found"
  }
  ```

---

### 4. Update Item Profile

Updates one or more attributes of an existing product item.

- **HTTP Method**: `PATCH`
- **URL**: `/api/inventory/products/:id`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `inventory.manage`

#### Request Headers

```http
Content-Type: application/json
```

#### Request Body (Partial updates supported)

```json
{
  "name": "11kg Premium LPG Cylinder",
  "category": "LPG Cylinder",
  "containerType": "CYLINDER",
  "netWeightKg": 11.000,
  "isActive": true
}
```

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `name` | String | No | Updated product name (non-empty, max 255 chars) |
| `category` | String | No | Updated category (non-empty, max 100 chars) |
| `containerType` | String | No | Updated container type (`CYLINDER` or `CANISTER`) |
| `netWeightKg` | Number | No | Updated net weight (> 0, max 999.999) |
| `isActive` | Boolean | No | Updated active status |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "data": {
    "product": {
      "id": "33333333-3333-3333-3333-000000000002",
      "name": "11kg Premium LPG Cylinder",
      "category": "LPG Cylinder",
      "containerType": "CYLINDER",
      "netWeightKg": 11,
      "isActive": true,
      "createdAt": "2026-08-28T12:20:00.000Z",
      "updatedAt": "2026-08-28T12:25:00.000Z"
    }
  }
}
```

#### Error Responses

- **`400 Bad Request`**: Validation error on supplied values.
- **`404 Not Found`**: Product ID not found.

---

### 5. Deactivate Item

Deactivates a product item so it is no longer treated as active (`is_active = false`).

- **HTTP Method**: `PATCH`
- **URL**: `/api/inventory/products/:id/deactivate`
- **Authentication**: Required (`mg_sid` cookie)
- **Permission Required**: `inventory.manage`

#### URL Parameters

| Parameter | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `id` | UUID | Yes | Unique identifier of the product |

#### Response: `200 OK` (Success)

```json
{
  "status": "success",
  "message": "Product successfully deactivated",
  "data": {
    "product": {
      "id": "33333333-3333-3333-3333-000000000003",
      "name": "22kg LPG Cylinder",
      "category": "LPG Cylinder",
      "containerType": "CYLINDER",
      "netWeightKg": 22,
      "isActive": false,
      "createdAt": "2026-08-28T12:20:00.000Z",
      "updatedAt": "2026-08-28T12:30:00.000Z"
    }
  }
}
```

#### Error Responses

- **`404 Not Found`**: Product ID not found.
  ```json
  {
    "status": "fail",
    "message": "Product not found"
  }
  ```
