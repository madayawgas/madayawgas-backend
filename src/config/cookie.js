/**
 * Centralized Cookie Configuration
 * Enforces cross-origin cookie security standards (SameSite=None; Secure; HttpOnly)
 * across controllers and authentication middleware.
 */

const COOKIE_NAME = 'mg_sid';

const getCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
  maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in ms
});

const getClearCookieOptions = () => ({
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  path: '/',
});

module.exports = {
  COOKIE_NAME,
  getCookieOptions,
  getClearCookieOptions,
};
