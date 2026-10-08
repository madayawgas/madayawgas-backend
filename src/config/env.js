require('dotenv').config();

/**
 * Single source of truth for runtime environment flags.
 * Primary toggle: `PRODUCTION=true` (or `NODE_ENV=production`).
 */
const isProduction =
  String(process.env.PRODUCTION).trim().toLowerCase() === 'true' ||
  process.env.NODE_ENV === 'production';

/**
 * Detects if the current process is executing a test suite.
 */
const isTest =
  process.env.NODE_ENV === 'test' ||
  process.env.npm_lifecycle_event === 'test' ||
  (Array.isArray(process.execArgv) && process.execArgv.some((arg) => arg.includes('--test'))) ||
  (Array.isArray(process.argv) &&
    process.argv.some((arg) => arg.includes('.test.js') || arg.includes('node:test')));

/**
 * Sanitize PostgreSQL connection URL:
 * - Automatically cleans outer brackets from copy-pasted Supabase template passwords (e.g. `:[YOUR-PASSWORD]@`)
 * - Gracefully URL-encodes special characters in passwords
 */
function sanitizeDatabaseUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;

  const url = rawUrl.trim();
  const schemeEnd = url.indexOf('://');
  if (schemeEnd === -1) return url;

  const firstColonAfterScheme = url.indexOf(':', schemeEnd + 3);
  const lastAtIndex = url.lastIndexOf('@');

  if (firstColonAfterScheme !== -1 && lastAtIndex !== -1 && firstColonAfterScheme < lastAtIndex) {
    const prefix = url.slice(0, firstColonAfterScheme + 1);
    let pass = url.slice(firstColonAfterScheme + 1, lastAtIndex);
    const suffix = url.slice(lastAtIndex);

    // Strip outer brackets from Supabase template copy-paste `[YOUR-PASSWORD]`
    if (pass.startsWith('[') && pass.endsWith(']')) {
      pass = pass.slice(1, -1);
    }

    try {
      pass = decodeURIComponent(pass);
    } catch {
      // In case of non-encoded percent characters
    }

    return prefix + encodeURIComponent(pass) + suffix;
  }

  return url;
}

/**
 * Resolves the active database connection string based on environment:
 * - In test mode: prioritizes `DATABASE_URL_TEST` (local) to avoid mutating production Supabase data.
 * - In production (`PRODUCTION=true`): uses `DATABASE_URL` (Supabase).
 * - In development (`PRODUCTION=false` or default): uses `DATABASE_URL_TEST` (local).
 */
function getDatabaseUrl() {
  // Test safety: test runs prioritize local test database unless explicitly overridden
  if (isTest && process.env.DATABASE_URL_TEST && process.env.TEST_USE_PROD !== 'true') {
    return sanitizeDatabaseUrl(process.env.DATABASE_URL_TEST);
  }

  if (isProduction) {
    const url = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;
    if (!url) {
      throw new Error(
        'Production database configuration error: Neither DATABASE_URL nor DATABASE_URL_TEST is set in .env'
      );
    }
    return sanitizeDatabaseUrl(url);
  }

  // Local / Development mode
  const url = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'Database configuration error: Neither DATABASE_URL_TEST nor DATABASE_URL is set in .env'
    );
  }
  return sanitizeDatabaseUrl(url);
}

/**
 * Determines if SSL encryption is required for the connection.
 * Supabase hosts and remote cloud PostgreSQL providers require SSL.
 */
function shouldEnableSsl(connectionUrl, isProd) {
  if (process.env.DATABASE_SSL === 'true') return true;
  if (process.env.DATABASE_SSL === 'false') return false;

  if (!connectionUrl) return false;

  // Supabase hosts always require SSL
  if (connectionUrl.includes('supabase.co') || connectionUrl.includes('pooler.supabase.com')) {
    return true;
  }

  // Explicit query param
  if (connectionUrl.includes('sslmode=require') || connectionUrl.includes('ssl=true')) {
    return true;
  }

  // In production, enable SSL unless connecting to local host
  if (isProd) {
    try {
      const parsed = new URL(connectionUrl);
      if (
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1' ||
        parsed.hostname === '::1'
      ) {
        return false;
      }
    } catch {
      // Default to SSL if URL parsing fails in production
    }
    return true;
  }

  return false;
}

/**
 * Resolves the public base URL for the server.
 * Supports:
 * - Explicit `BASE_URL` or `PUBLIC_URL` (user/platform configured)
 * - Render cloud platform (`RENDER_EXTERNAL_URL` or `RENDER_EXTERNAL_HOSTNAME`)
 * - Common cloud environments (e.g., `RAILWAY_STATIC_URL`)
 * - Local development fallback (`http://localhost:${port}`)
 */
function getBaseUrl(port = process.env.PORT || 5000) {
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_URL) {
    return process.env.RENDER_EXTERNAL_URL.replace(/\/+$/, '');
  }
  if (process.env.RENDER_EXTERNAL_HOSTNAME) {
    return `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  }
  if (process.env.RAILWAY_STATIC_URL) {
    return `https://${process.env.RAILWAY_STATIC_URL}`;
  }
  if (process.env.PUBLIC_URL) {
    return process.env.PUBLIC_URL.replace(/\/+$/, '');
  }
  return `http://localhost:${port}`;
}

module.exports = {
  isProduction,
  isTest,
  sanitizeDatabaseUrl,
  getDatabaseUrl,
  shouldEnableSsl,
  getBaseUrl,
};
