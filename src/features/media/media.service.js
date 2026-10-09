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
 * Generates a deterministic, collision-resistant canonical relative storage key.
 * Format: {domain}/{timestamp}-{randomHex}{extension}
 * Example: maintenance/receipts/1775731200000-4b2a8f9c1d0e.jpg
 *
 * @param {string} domain - Whitelisted domain directory
 * @param {string} originalName - Original uploaded filename
 * @param {string} mimeType - Validated MIME type
 * @returns {string} Canonical relative storage key
 */
function generateStorageKey(domain, originalName, mimeType) {
  const validDomain = validateDomain(domain);
  const extension = resolveSanitizedExtension(originalName, mimeType);
  const timestamp = Date.now();
  const randomHex = crypto.randomBytes(6).toString('hex'); // 12 random hex characters

  return `${validDomain}/${timestamp}-${randomHex}${extension}`;
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
  const storageKey = generateStorageKey(validDomain, file.originalname, file.mimetype);

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

  const url = mediaStorage.resolveMediaUrl(storageKey.trim(), req);
  return {
    storageKey: storageKey.trim(),
    url,
  };
}

/**
 * Safely removes a media asset from active storage.
 *
 * @param {string} storageKey
 * @returns {Promise<{ success: boolean, storageKey: string }>}
 */
async function deleteMedia(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    const error = new Error('storageKey must be a valid non-empty string');
    error.statusCode = 400;
    error.code = 'STORAGE_KEY_REQUIRED';
    throw error;
  }

  const success = await mediaStorage.deleteFromStorage(storageKey.trim());
  return {
    success,
    storageKey: storageKey.trim(),
  };
}

module.exports = {
  ALLOWED_DOMAINS,
  MIME_EXTENSIONS,
  validateDomain,
  resolveSanitizedExtension,
  generateStorageKey,
  uploadMedia,
  resolveMedia,
  deleteMedia,
};
