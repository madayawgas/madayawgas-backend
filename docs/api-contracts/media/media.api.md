# Media Subsystem API Specification

> **Base Path:** `/api/media`  
> **Subsystem:** Media & Document Storage  
> **Target Audience:** Frontend Engineers, Mobile Integrators, Operations Backend  

---

## 1. Overview & Architectural Principles

The MadayawGas Media Subsystem provides a unified, secure standard for ingesting, validating, storing, and resolving operational files and images across all business domains (maintenance work order receipts, vehicle safety inspections, fleet registrations, sales receipts, customer payments, and user profile avatars).

### Key Architectural Standards:
1. **Canonical Relative Storage Key (Zero Host Hardcoding):**
   - Database tables and API payloads persist and exchange **only the canonical relative storage key** (e.g. `maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg`).
   - Hostnames and absolute bucket URLs are never persisted in database columns, isolating persistent state from cloud infrastructure changes.
2. **In-Memory Streaming (Zero Ephemeral Disk Pollution):**
   - Uploads are processed via `multer.memoryStorage()`. Files exist as transient memory buffers during the request lifecycle and stream directly to destination storage.
3. **Dual Runtime Modes:**
   - **Local Mode (`PRODUCTION=false` or unset):** Buffers are saved to local filesystem under `./uploads` (or `LOCAL_MEDIA_PATH`) and served statically at `/media/*`.
   - **Production Mode (`PRODUCTION=true`):** Buffers are streamed to Supabase Storage bucket `madayawgas-media` via `@supabase/supabase-js`.
4. **Hard Security Ceiling & Whitelist:**
   - Maximum file size: **5 MB (`5 * 1024 * 1024` bytes)**.
   - Allowed MIME types: `image/jpeg`, `image/png`, `image/webp`, `application/pdf`.

---

## 2. Canonical Domain & MIME Catalog

### Whitelisted Domains
Upload requests must supply a valid `domain` string strictly matching one of the following canonical directories:

| Canonical Domain | Usage Description |
| :--- | :--- |
| `maintenance/receipts` | Invoices, repair bills, and purchase receipts for fleet work orders |
| `maintenance/inspections` | Photos of vehicle defects, tire wear, safety inspections |
| `fleet/vehicles` | Official vehicle photos, plate number captures, registration docs |
| `sales/receipts` | Counter receipts, signed customer delivery invoices |
| `sales/payments` | Bank transfer slips, GCash/check deposit payment proofs |
| `users/avatars` | User profile avatars and identification cards |

### Whitelisted MIME Types & Canonical Extensions

| MIME Type | Canonical Extension | Description |
| :--- | :--- | :--- |
| `image/jpeg` | `.jpg` | Joint Photographic Experts Group image |
| `image/png` | `.png` | Portable Network Graphics image |
| `image/webp` | `.webp` | Modern web image format |
| `application/pdf` | `.pdf` | Portable Document Format receipt/invoice |

---

## 3. Endpoints Matrix

| Method | Endpoint | Description | Auth Required | Request Format |
| :--- | :--- | :--- | :--- | :--- |
| `POST` | `/api/media/upload` | Upload file into canonical storage | Yes (Session/Bearer) | `multipart/form-data` |
| `POST` | `/api/media/resolve` | Resolve relative key to fully qualified URL | Yes (Session/Bearer) | `application/json` |
| `GET` | `/media/*` | Static delivery of local files (Local Mode only) | No (Public access) | URL path |

---

## 4. Endpoint Specifications

### 4.1 Upload Media (`POST /api/media/upload`)

Uploads a single file, validates MIME type and file size, generates a collision-resistant canonical relative key, streams it to storage, and returns metadata with access URL.

#### Headers
```http
Authorization: Bearer <session_token>
Cookie: mg_sid=<session_token>
Content-Type: multipart/form-data
```

#### Form Fields (`multipart/form-data`)
| Field Name | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `file` | Binary File | **Yes** | File binary stream (<= 5 MB; JPEG, PNG, WebP, PDF) |
| `domain` | String | **Yes** | Whitelisted target domain (e.g. `maintenance/receipts`) |

#### Success Response (`201 Created`)
```json
{
  "status": "success",
  "data": {
    "storageKey": "maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg",
    "url": "http://localhost:5000/media/maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 245192,
    "originalName": "repair-receipt.jpg"
  }
}
```

#### Error Responses

##### 400 Bad Request — Missing File
```json
{
  "status": "fail",
  "code": "FILE_REQUIRED",
  "message": "No file uploaded or file field missing"
}
```

##### 400 Bad Request — Missing or Invalid Domain
```json
{
  "status": "fail",
  "code": "DOMAIN_REQUIRED",
  "message": "Media domain is required (e.g. maintenance/receipts, fleet/vehicles)"
}
```
```json
{
  "status": "fail",
  "code": "INVALID_MEDIA_DOMAIN",
  "message": "Invalid media domain 'passwords'. Allowed domains are: maintenance/receipts, maintenance/inspections, fleet/vehicles, sales/receipts, sales/payments, users/avatars"
}
```

##### 400 Bad Request — Unsupported File Type
```json
{
  "status": "fail",
  "code": "UNSUPPORTED_MEDIA_TYPE",
  "message": "Unsupported media type 'text/plain'. Allowed types: image/jpeg, image/png, image/webp, application/pdf"
}
```

##### 413 Payload Too Large — Exceeds 5 MB Limit
```json
{
  "status": "fail",
  "code": "FILE_TOO_LARGE",
  "message": "File size exceeds maximum allowed limit of 5 MB"
}
```

##### 401 Unauthorized
```json
{
  "status": "fail",
  "message": "Unauthorized"
}
```

---

### 4.2 Resolve Media Key (`POST /api/media/resolve`)

Resolves a canonical relative storage key into a fully qualified access URL depending on the active environment (Supabase Storage in production, Local HTTP server in development).

#### Headers
```http
Authorization: Bearer <session_token>
Cookie: mg_sid=<session_token>
Content-Type: application/json
```

#### Request Body
```json
{
  "storageKey": "maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg"
}
```

#### Success Response (`200 OK`)
```json
{
  "status": "success",
  "data": {
    "storageKey": "maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg",
    "url": "http://localhost:5000/media/maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg"
  }
}
```

In production mode (`PRODUCTION=true`), the resolved URL reflects the public Supabase bucket:
```json
{
  "status": "success",
  "data": {
    "storageKey": "maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg",
    "url": "https://<supabase-project>.supabase.co/storage/v1/object/public/madayawgas-media/maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg"
  }
}
```

#### Error Responses

##### 400 Bad Request — Missing Key
```json
{
  "status": "fail",
  "code": "STORAGE_KEY_REQUIRED",
  "message": "storageKey must be provided as a non-empty string"
}
```

---

## 5. Storage Key Generation Standard

Canonical relative storage keys follow this deterministic formula:
```text
{domain}/{timestamp}-{randomHex}{extension}
```
- `{domain}`: One of the 6 whitelisted domain directories.
- `{timestamp}`: Unix timestamp in milliseconds (`Date.now()`).
- `{randomHex}`: 12 cryptographically random hexadecimal characters (`crypto.randomBytes(6).toString('hex')`).
- `{extension}`: Sanitized file extension matching the MIME type (`.jpg`, `.png`, `.webp`, `.pdf`).

**Example Keys:**
- `maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg`
- `maintenance/inspections/1775731200150-e8a71c2b9f34.png`
- `sales/receipts/1775731200300-9a8b7c6d5e4f.pdf`
