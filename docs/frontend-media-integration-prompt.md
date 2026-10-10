# Frontend Integration Guide & Prompt: Media Subsystem & Work Order Receipts

> **Target Audience:** Frontend Engineers / AI Agent working on the MadayawGas Frontend  
> **Topic:** Resolving Image Display 404s, Eliminating Duplicate Supabase Uploads, and Integrating the Media Subsystem  
> **Status:** Backend updates deployed and verified (100% test coverage)

---

## 1. Executive Summary & Root Cause Analysis

During recent production testing on Vercel (`https://madayawgas.vercel.app`) connected to the Render backend and Supabase Storage, two issues occurred:

### Issue 1: Images do not show up on the page (404 Not Found)
* **What Happened:** When viewing a work order or attached receipts, images failed to render, or broken image placeholders appeared.
* **Root Cause:** Work order endpoints previously returned raw relative storage keys in the `fileUrl` field (e.g. `"maintenance/receipts/1791549646264-b9e397ab54b9.jpg"`). In the frontend JSX/HTML, passing this directly to `<img src={receipt.fileUrl} />` caused the browser to request `https://madayawgas.vercel.app/maintenance/receipts/...`, which 404'd on Vercel because the asset actually lives in the public Supabase bucket (`https://<project-ref>.supabase.co/storage/v1/object/public/madayawgas-media/maintenance/receipts/...`).

### Issue 2: Duplicate / Orphaned Files in Supabase Storage
* **What Happened:** Selecting a file created files in Supabase before clicking "Confirm" or "Save" on the work order. If the file was selected twice or modified, 2 separate duplicate files were stored.
* **Root Cause:** 
  1. The frontend executed `POST /api/media/upload` immediately on the `onChange` event of the `<input type="file">` element (eager upload).
  2. The backend previously generated storage keys using random timestamps (`{timestamp}-{randomHex}.jpg`), which meant uploading the same image twice generated two distinct filenames.
  3. No deletion mechanism was called if the user cancelled the modal or changed their mind before saving the work order.

---

## 2. Backend Changes & Features Added to Support You

The backend has implemented the following enhancements to solve these issues:

### 1. Auto-Resolved Public URLs
All endpoints returning receipts now automatically resolve `fileUrl` to the **fully qualified, publicly accessible URL**:
* In **Production** (`PRODUCTION=true`): Resolves to the public Supabase bucket URL:  
  `https://<project>.supabase.co/storage/v1/object/public/madayawgas-media/maintenance/receipts/...`
* In **Development** (`PRODUCTION=false`): Resolves to the backend static media URL:  
  `http://localhost:5000/media/maintenance/receipts/...`
* **Both fields are now returned**:
  * `fileUrl`: The ready-to-use public image URL for `src` or `href`.
  * `storageKey`: The canonical relative key (e.g. `maintenance/receipts/...`) if needed for reference.

### 2. Flexible URL Normalization
When submitting a receipt to `POST /api/fleet/maintenance/work-orders/:id/receipts` or finalizing a work order via `POST .../finalize`, you can send **either** the full URL (`uploadResponse.data.url`) **or** the relative storage key (`uploadResponse.data.storageKey`). The backend automatically parses and normalizes it to the canonical storage key before saving it to the database.

### 3. Content-Addressed Deduplication & Upsert
The backend `POST /api/media/upload` endpoint now generates storage keys using a **SHA-256 content-hash** of the file buffer:
* Formula: `{domain}/{sha256(buffer).slice(0, 16)}{extension}` (e.g., `maintenance/receipts/bbd42de30c5f1be8.jpg`).
* Uploading the identical receipt multiple times produces the exact same storage key.
* The Supabase Storage driver now runs with `upsert: true`, so repeated uploads safely overwrite the identical asset without creating orphaned duplicate files in your Supabase bucket.

### 4. Direct Asset Deletion Endpoint (`DELETE /api/media`)
A new endpoint has been deployed:
* **Endpoint:** `DELETE /api/media`
* **Headers:** `Content-Type: application/json`, Cookie / Bearer Token
* **Body:** `{ "storageKey": "maintenance/receipts/..." }` *(or query parameter `?storageKey=...`)*
* Accepts either the relative storage key or the full Supabase URL.
* If a receipt is deleted via `DELETE /api/fleet/maintenance/receipts/:receiptId`, the backend now **automatically deletes the physical asset from storage** as well!

---

## 3. Frontend Implementation Guide & Instructions

Copy and provide this section to the frontend developer or frontend AI agent:

```markdown
### FRONTEND INSTRUCTIONS: Fixing Media Display & Upload Workflow

#### 1. Rendering Receipts / Images in UI Components
In your Work Order Details modal, Receipt Gallery, or Table views:
- Use `receipt.fileUrl` directly as the `src` attribute of your `<img>` tag or download `<a>` tag.
- DO NOT prepend your API host, Vercel host, or Supabase URL manually.
- The backend already supplies the complete, environment-aware public URL.

```tsx
// Example Receipt Item Component
interface ReceiptItem {
  id: string;
  receiptNumber?: string;
  vendorName?: string;
  amount: number;
  receiptType: 'PARTS' | 'LABOR' | 'MISC';
  fileUrl: string;    // Already fully qualified public URL
  storageKey: string; // Canonical relative key
}

export function WorkOrderReceiptCard({ receipt }: { receipt: ReceiptItem }) {
  const isPdf = receipt.fileUrl.toLowerCase().endsWith('.pdf');

  return (
    <div className="receipt-card border rounded p-3">
      {isPdf ? (
        <a 
          href={receipt.fileUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-600 underline"
        >
          View PDF Invoice ({receipt.receiptNumber || 'No OR #'})
        </a>
      ) : (
        <img
          src={receipt.fileUrl}
          alt={`Receipt ${receipt.receiptNumber || receipt.id}`}
          className="w-full h-48 object-cover rounded"
          loading="lazy"
        />
      )}
      <div className="mt-2 text-sm">
        <p className="font-semibold">{receipt.vendorName || 'Independent Vendor'}</p>
        <p className="text-gray-600">₱{receipt.amount.toLocaleString()}</p>
      </div>
    </div>
  );
}
```

---

#### 2. Managing the Upload Lifecycle (Preventing Orphaned Files)

You have two recommended patterns for handling file uploads in modals/forms:

##### Recommended Pattern A: Deferred Upload on Form Submit (Cleanest)
Instead of uploading immediately when the user selects a file in `<input type="file">`, hold the `File` object in local component state. Only perform the upload when the user clicks "Save" / "Confirm":

```tsx
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const [isSubmitting, setIsSubmitting] = useState(false);

const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  if (e.target.files && e.target.files[0]) {
    setSelectedFile(e.target.files[0]);
  }
};

const handleSubmit = async () => {
  if (!selectedFile) return;
  setIsSubmitting(true);

  try {
    // 1. Upload file to media subsystem
    const formData = new FormData();
    formData.append('domain', 'maintenance/receipts');
    formData.append('file', selectedFile);

    const uploadRes = await api.post('/api/media/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const { storageKey, url } = uploadRes.data.data;

    // 2. Attach receipt to work order
    await api.post(`/api/fleet/maintenance/work-orders/${workOrderId}/receipts`, {
      fileUrl: storageKey, // or url (both work!)
      receiptNumber,
      vendorName,
      amount: Number(amount),
      receiptType,
    });

    onSuccess();
  } catch (error) {
    console.error('Failed to attach receipt:', error);
  } finally {
    setIsSubmitting(false);
  }
};
```

##### Pattern B: Eager Upload with Cleanup on Modal Cancel
If you prefer showing an instant uploaded image preview immediately after selection:
1. Call `POST /api/media/upload` when the file is chosen and store `uploadedStorageKey` in state.
2. If the user clicks **Cancel** or closes the modal **without submitting**, send a cleanup request:

```tsx
const handleCancel = async () => {
  if (stagedStorageKey && !isSaved) {
    try {
      await api.delete('/api/media', {
        data: { storageKey: stagedStorageKey },
      });
    } catch (err) {
      console.warn('Failed to clean up cancelled staged media:', err);
    }
  }
  onClose();
};
```

---

#### 3. API Contract Reference Summary

1. **Upload File:**
   - `POST /api/media/upload`
   - Header: `Content-Type: multipart/form-data`
   - Body fields:
     - `domain`: `"maintenance/receipts"` *(or `fleet/vehicles`, `maintenance/inspections`, `sales/receipts`, `sales/payments`, `users/avatars`)*
     - `file`: `<binary>` (Max 5MB; JPEG, PNG, WebP, PDF)
   - Response (`201 Created`):
     ```json
     {
       "status": "success",
       "data": {
         "storageKey": "maintenance/receipts/bbd42de30c5f1be8.jpg",
         "url": "https://<supabase>.supabase.co/storage/v1/object/public/madayawgas-media/maintenance/receipts/bbd42de30c5f1be8.jpg",
         "mimeType": "image/jpeg",
         "sizeBytes": 245192,
         "originalName": "receipt.jpg"
       }
     }
     ```

2. **Attach Receipt to Work Order:**
   - `POST /api/fleet/maintenance/work-orders/:id/receipts`
   - Body:
     ```json
     {
       "fileUrl": "maintenance/receipts/bbd42de30c5f1be8.jpg",
       "receiptNumber": "OR-10023",
       "vendorName": "Bunawan Parts Depot",
       "amount": 3500.00,
       "receiptType": "PARTS"
     }
     ```

3. **Delete Media (Cancelation Cleanup):**
   - `DELETE /api/media`
   - Body: `{ "storageKey": "maintenance/receipts/bbd42de30c5f1be8.jpg" }`
```
