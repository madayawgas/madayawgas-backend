const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { getBaseUrl } = require('../../config/env');

let cachedSupabaseClient = null;

/**
 * Checks if the runtime environment is configured for production cloud storage.
 * Evaluates dynamically to support test runtime mode switching.
 */
function isProductionMode() {
  return (
    String(process.env.PRODUCTION).trim().toLowerCase() === 'true' ||
    process.env.NODE_ENV === 'production'
  );
}

/**
 * Resolves the configured Supabase client instance using service role credentials.
 */
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'Supabase Storage configuration error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in production mode'
    );
  }

  if (!cachedSupabaseClient) {
    cachedSupabaseClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return cachedSupabaseClient;
}

/**
 * Resolves the configured bucket name (defaults to 'madayawgas-media').
 */
function getMediaBucket() {
  return process.env.SUPABASE_MEDIA_BUCKET || 'madayawgas-media';
}

/**
 * Resolves the root directory path for local media files.
 */
function getLocalMediaPath() {
  return path.resolve(process.env.LOCAL_MEDIA_PATH || './uploads');
}

/**
 * Validates and resolves local target file path, strictly guarding against directory traversal.
 */
function resolveSafeLocalPath(storageKey) {
  const rootDir = getLocalMediaPath();
  const normalizedKey = storageKey.replace(/^(\.\.(\/|\\|$))+/, '');
  const targetPath = path.resolve(rootDir, normalizedKey);

  const rootWithSep = rootDir.endsWith(path.sep) ? rootDir : rootDir + path.sep;
  if (!targetPath.startsWith(rootWithSep) && targetPath !== rootDir) {
    const error = new Error('Invalid storage key: directory traversal attempt detected');
    error.statusCode = 400;
    error.code = 'INVALID_STORAGE_KEY';
    throw error;
  }

  return targetPath;
}

/**
 * Uploads media buffer to the configured storage backend (Supabase Storage in prod, Local Disk in dev).
 *
 * @param {Buffer} buffer - File binary buffer from in-memory stream
 * @param {string} storageKey - Relative canonical storage key
 * @param {string} mimeType - Standard MIME type
 * @returns {Promise<{ storageKey: string }>}
 */
async function uploadToStorage(buffer, storageKey, mimeType) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('uploadToStorage expects a valid Buffer instance');
  }

  if (isProductionMode()) {
    const supabase = getSupabaseClient();
    const bucket = getMediaBucket();

    const { data, error } = await supabase.storage
      .from(bucket)
      .upload(storageKey, buffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Supabase storage upload failed: ${error.message}`);
    }

    return { storageKey };
  }

  // Local filesystem mode
  const targetPath = resolveSafeLocalPath(storageKey);
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.promises.writeFile(targetPath, buffer);

  return { storageKey };
}

/**
 * Resolves the canonical relative storage key into a fully qualified access URL.
 *
 * @param {string} storageKey - Canonical relative storage key (e.g. maintenance/receipts/1728...-abc.jpg)
 * @param {import('express').Request} [req] - Optional Express request for local host reflection
 * @returns {string|null}
 */
function resolveMediaUrl(storageKey, req) {
  if (!storageKey || typeof storageKey !== 'string' || storageKey.trim() === '') {
    return null;
  }

  const trimmedKey = storageKey.trim();

  // If already an absolute HTTP/HTTPS URL, return as is
  if (/^https?:\/\//i.test(trimmedKey)) {
    return trimmedKey;
  }

  const cleanKey = trimmedKey.replace(/^(\.\/)?uploads\//i, '').replace(/^\/+/, '');

  if (isProductionMode()) {
    const supabaseUrl = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
    const bucket = getMediaBucket();
    return `${supabaseUrl}/storage/v1/object/public/${bucket}/${cleanKey}`;
  }

  // Local / Development mode
  let baseUrl;
  if (req && typeof req.get === 'function' && req.get('host')) {
    const protocol = req.protocol || 'http';
    baseUrl = `${protocol}://${req.get('host')}`;
  } else {
    baseUrl = getBaseUrl();
  }

  return `${baseUrl.replace(/\/+$/, '')}/media/${cleanKey}`;
}

/**
 * Safely deletes media from Supabase Storage or local filesystem.
 *
 * @param {string} storageKey - Canonical relative storage key
 * @returns {Promise<boolean>} - True if deletion was attempted/succeeded, false if nonexistent
 */
async function deleteFromStorage(storageKey) {
  if (!storageKey || typeof storageKey !== 'string') {
    return false;
  }

  if (isProductionMode()) {
    const supabase = getSupabaseClient();
    const bucket = getMediaBucket();
    const { error } = await supabase.storage.from(bucket).remove([storageKey]);
    if (error) {
      throw new Error(`Supabase storage deletion failed: ${error.message}`);
    }
    return true;
  }

  // Local filesystem mode
  try {
    const targetPath = resolveSafeLocalPath(storageKey);
    await fs.promises.unlink(targetPath);
    return true;
  } catch (err) {
    if (err.code === 'ENOENT') {
      return false;
    }
    throw err;
  }
}

module.exports = {
  isProductionMode,
  uploadToStorage,
  resolveMediaUrl,
  deleteFromStorage,
  getLocalMediaPath,
  getMediaBucket,
};
