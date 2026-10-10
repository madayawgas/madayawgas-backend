const crypto = require('crypto');
const path = require('path');
const mediaStorage = require('./media.storage');

/**
 * Canonical domain whitelist dictionary.
 * Prevents path traversal and unstructured uploads.
 */
const ALLOWED_DOMAINS = Object.freeze([
  'maintenance/receipts',
  'maintenance/inspections',
  'fleet/vehicles',
  'sales/receipts',
  'sales/payments',
  'users/avatars',
]);

/**
 * Standard MIME to canonical file extension mapping.
 */
const MIME_EXTENSIONS = Object.freeze({
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
});

/**
 * Validates domain string against canonical whitelist.
 *
 * @param {string} domain
 */
function validateDomain(domain) {
  if (!domain || typeof domain !== 'string' || !ALLOWED_DOMAINS.includes(domain.trim())) {
    const error = new Error(
      `Invalid media domain '${domain}'. Allowed domains are: ${ALLOWED_DOMAINS.join(', ')}`
    );
    error.statusCode = 400;
    error.code = 'INVALID_MEDIA_DOMAIN';
    throw error;
  }
  return domain.trim();
}

/**
 * Resolves a safe, sanitized file extension based on MIME type and original file name.
 *
 * @param {string} originalName
 * @param {string} mimeType
 * @returns {string} - e.g. '.jpg', '.png', '.webp', '.pdf'
 */
function resolveSanitizedExtension(originalName, mimeType) {
  const mimeExt = MIME_EXTENSIONS[mimeType];

  if (!originalName || typeof originalName !== 'string') {
    return mimeExt || '.bin';
  }

  const rawExt = path.extname(originalName).toLowerCase();

  // Normalize common JPEG variations
  if (rawExt === '.jpeg' || rawExt === '.jpe' || rawExt === '.jpg') {
    return '.jpg';
  }

  if (rawExt === '.png' && mimeType === 'image/png') {
    return '.png';
  }

  if (rawExt === '.webp' && mimeType === 'image/webp') {
    return '.webp';
  }

  if (rawExt === '.pdf' && mimeType === 'application/pdf') {
    return '.pdf';
  }

  // Default to the authoritative extension for the validated MIME type
  return mimeExt || rawExt || '.bin';
}

/**
 * Normalizes and extracts the canonical relative storage key from any input,
 * whether it is a fully qualified Supabase storage URL, a local /media/ URL,
 * or already a relative storage key.
 *
 * @param {string} input - Full URL or relative key
 * @returns {string|null} Canonical relative storage key or null
 */
function extractStorageKey(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Pattern 1: Supabase Public Storage URL
  // e.g. https://<project>.supabase.co/storage/v1/object/public/<bucket>/maintenance/receipts/abc.jpg
  const supabaseMatch = trimmed.match(/\/storage\/v1\/object\/public\/[^/]+\/(.+)$/i);
  if (supabaseMatch) {
    return supabaseMatch[1].replace(/^\/+/, '');
  }

  // Pattern 2: Local static media URL
  // e.g. http://localhost:5000/media/maintenance/receipts/abc.jpg
  const localMatch = trimmed.match(/\/media\/(.+)$/i);
  if (localMatch) {
    return localMatch[1].replace(/^\/+/, '');
  }

  // Pattern 3: If an external http/https URL that is not part of this system
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Strip leading ./uploads/ or uploads/
  const strippedUploads = trimmed.replace(/^(\.\/)?uploads\//i, '');

  // Pattern 4: Already a relative storage key
  return strippedUploads.replace(/^\/+/, '');
}

/**
 * Generates a deterministic, content-addressed canonical relative storage key.
 * If a buffer is provided, computes a SHA-256 hash to deduplicate identical files.
 * Format: {domain}/{contentHash}{extension}
 * Example: maintenance/receipts/bbd42de30c5f1be8.jpg
 *
 * @param {string} domain - Whitelisted domain directory
 * @param {string} originalName - Original uploaded filename
 * @param {string} mimeType - Validated MIME type
 * @param {Buffer} [buffer] - Optional file binary buffer for content-hashing
 * @returns {string} Canonical relative storage key
 */
function generateStorageKey(domain, originalName, mimeType, buffer) {
  const validDomain = validateDomain(domain);
  const extension = resolveSanitizedExtension(originalName, mimeType);

  let fileIdentifier;
  if (buffer && Buffer.isBuffer(buffer)) {
    // 16 hex chars (64-bit cryptographic hash) providing collision-free content addressing
    fileIdentifier = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  } else {
    const timestamp = Date.now();
    const randomHex = crypto.randomBytes(6).toString('hex');
    fileIdentifier = `${timestamp}-${randomHex}`;
  }

  return `${validDomain}/${fileIdentifier}${extension}`;
}

/**
 * Ingests, validates, stores, and resolves an uploaded file.
 *
 * @param {object} params
 * @param {Express.Multer.File} params.file
 * @param {string} params.domain
 * @param {import('express').Request} [params.req]
 * @returns {Promise<{ storageKey: string, url: string, mimeType: string, sizeBytes: number, originalName: string }>}
 */
async function uploadMedia({ file, domain, req }) {
  if (!file || !file.buffer) {
    const error = new Error('No file uploaded or file buffer is empty');
    error.statusCode = 400;
    error.code = 'FILE_REQUIRED';
    throw error;
  }

  const validDomain = validateDomain(domain);
  const storageKey = generateStorageKey(validDomain, file.originalname, file.mimetype, file.buffer);

  await mediaStorage.uploadToStorage(file.buffer, storageKey, file.mimetype);
  const url = mediaStorage.resolveMediaUrl(storageKey, req);

  return {
    storageKey,
    url,
    mimeType: file.mimetype,
    sizeBytes: file.size || file.buffer.length,
    originalName: file.originalname,
  };
}

/**
 * Resolves a canonical relative storage key into a public URL.
 *
 * @param {string} storageKey
 * @param {import('express').Request} [req]
 * @returns {{ storageKey: string, url: string|null }}
 */
function resolveMedia(storageKey, req) {
  if (!storageKey || typeof storageKey !== 'string') {
    const error = new Error('storageKey must be a valid non-empty string');
    error.statusCode = 400;
    error.code = 'STORAGE_KEY_REQUIRED';
    throw error;
  }

  const cleanKey = extractStorageKey(storageKey.trim());
  const url = mediaStorage.resolveMediaUrl(cleanKey, req);
  return {
    storageKey: cleanKey,
    url,
  };
}

/**
 * Safely removes a media asset from active storage.
 *
 * @param {string} storageKey - Relative key or full URL
 * @returns {Promise<{ success: boolean, storageKey: string }>}
 */
async function deleteMedia(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    const error = new Error('storageKey must be a valid non-empty string');
    error.statusCode = 400;
    error.code = 'STORAGE_KEY_REQUIRED';
    throw error;
  }

  const cleanKey = extractStorageKey(storageKey.trim());
  if (!cleanKey) {
    return { success: false, storageKey };
  }

  const success = await mediaStorage.deleteFromStorage(cleanKey);
  return {
    success,
    storageKey: cleanKey,
  };
}

module.exports = {
  ALLOWED_DOMAINS,
  MIME_EXTENSIONS,
  validateDomain,
  resolveSanitizedExtension,
  generateStorageKey,
  extractStorageKey,
  uploadMedia,
  resolveMedia,
  deleteMedia,
};
