const { isProduction } = require('./env');

/**
 * Centralized Cookie Configuration
 * Enforces cross-origin cookie security standards (SameSite=None; Secure; HttpOnly)
 * across controllers and authentication middleware.
 */

const COOKIE_NAME = 'mg_sid';

/**
 * Determines whether cookie Secure flag and SameSite=None should be applied.
 * In production or behind an HTTPS reverse proxy, Secure=true and SameSite=None are enforced.
 * If explicitly disabled via COOKIE_SECURE=false for local unencrypted HTTP mobile testing,
 * Secure is set to false and SameSite to 'lax' to prevent mobile browsers from discarding the cookie.
 */
function resolveCookieSecurity(req) {
  if (process.env.COOKIE_SECURE === 'false') {
    return false;
  }
  // Default to secure=true for cross-origin production (Render/Vercel) and test suite
  return true;
}

const getCookieOptions = (req) => {
  const isSecure = resolveCookieSecurity(req);
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
  };
};

const getClearCookieOptions = (req) => {
  const isSecure = resolveCookieSecurity(req);
  return {
    httpOnly: true,
    secure: isSecure,
    sameSite: isSecure ? 'none' : 'lax',
    path: '/',
  };
};

module.exports = {
  COOKIE_NAME,
  getCookieOptions,
  getClearCookieOptions,
};

