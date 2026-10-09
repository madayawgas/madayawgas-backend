require('dotenv').config();

const defaultAllowedOrigins = [
  'https://madayawgas.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
];

const envAllowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',')
      .map((origin) => origin.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  : [];

const allowedOriginsSet = new Set([
  ...defaultAllowedOrigins.map((origin) => origin.replace(/\/+$/, '')),
  ...envAllowedOrigins,
]);

// Localhost, IPv4 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16),
// Carrier-Grade NAT (100.64.0.0/10), link-local (169.254.0.0/16), and IPv6 loopback [::1] on arbitrary ports
const LOCAL_AND_PRIVATE_NETWORK_REGEX =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}|169\.254\.\d{1,3}\.\d{1,3})(:\d+)?$/;

// Mobile hybrid webview schemes (Capacitor, Ionic)
const MOBILE_HYBRID_REGEX = /^(capacitor|ionic):\/\/localhost$/;

// Mobile development tunnels (ngrok, localtunnel, Cloudflare tunnels)
const DEV_TUNNEL_REGEX =
  /^https:\/\/[a-zA-Z0-9-]+\.(ngrok-free\.app|ngrok\.io|localtunnel\.me|trycloudflare\.com)$/;

// Vercel deployment and preview URLs for madayawgas
const VERCEL_PREVIEW_REGEX =
  /^https:\/\/(madayawgas|[\w-]+-madayawgas|madayawgas-[\w-]+)\.vercel\.app$/;

/**
 * Standard allowed headers for web, mobile browsers, and mobile WebViews
 */
const defaultAllowedHeaders = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Cache-Control',
  'Pragma',
  'X-Confirm-Password',
  'x-confirm-password',
  'X-Access-Token',
  'x-access-token',
  'X-Auth-Token',
  'x-auth-token',
  'Range',
  'Access-Control-Request-Private-Network',
  'Sec-CH-UA',
  'Sec-CH-UA-Mobile',
  'Sec-CH-UA-Platform',
];

/**
 * Validates if incoming Origin header is permitted.
 * Supports:
 * - Direct matches in whitelist or CORS_ORIGIN
 * - Local development and private LAN networks (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 100.64-127.x.x)
 * - Mobile hybrid app schemes (capacitor://localhost, ionic://localhost)
 * - Mobile development tunnels (ngrok, localtunnel, Cloudflare tunnels)
 * - Any Vercel branch / preview deployments for madayawgas
 * - Origin-less requests (curl, server-to-server, mobile native apps)
 */
function isOriginAllowed(origin) {
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // 1. Explicitly whitelisted
  if (allowedOriginsSet.has(cleanOrigin)) {
    return true;
  }

  // 2. Localhost or private LAN network on any port (HTTP or HTTPS)
  if (LOCAL_AND_PRIVATE_NETWORK_REGEX.test(cleanOrigin)) {
    return true;
  }

  // 3. Mobile hybrid app runtimes
  if (MOBILE_HYBRID_REGEX.test(cleanOrigin)) {
    return true;
  }

  // 4. Development tunnels for mobile testing
  if (DEV_TUNNEL_REGEX.test(cleanOrigin)) {
    return true;
  }

  // 5. Vercel deployment and preview URLs for madayawgas
  if (VERCEL_PREVIEW_REGEX.test(cleanOrigin)) {
    return true;
  }

  return false;
}

/**
 * Dynamic CORS options generator.
 * Allows custom header reflection so mobile Safari (Cache-Control, Pragma)
 * and mobile Chrome preflights are never rejected due to unlisted headers.
 */
const corsOptions = (req, callback) => {
  const origin = req.headers?.origin;
  const isAllowed = isOriginAllowed(origin);

  // Extract requested headers from preflight and union with default allowed headers
  const requestedHeaders = req.headers?.['access-control-request-headers']
    ? req.headers['access-control-request-headers']
        .split(',')
        .map((h) => h.trim())
        .filter(Boolean)
    : [];

  const mergedHeaders = Array.from(new Set([...defaultAllowedHeaders, ...requestedHeaders]));

  const options = {
    origin: isAllowed ? origin || true : false,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: mergedHeaders,
    exposedHeaders: ['Set-Cookie', 'Authorization', 'Content-Disposition'],
    optionsSuccessStatus: 200, // Legacy mobile browser / Smart TV compatibility
    maxAge: 86400, // 24 hours preflight cache to minimize mobile network round-trips
  };

  callback(null, options);
};

// Attach helpers and defaults for backward compatibility and test inspections
corsOptions.isOriginAllowed = isOriginAllowed;
corsOptions.defaultAllowedOrigins = defaultAllowedOrigins;
corsOptions.defaultAllowedHeaders = defaultAllowedHeaders;
corsOptions.origin = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
};
corsOptions.credentials = true;
corsOptions.methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'];
corsOptions.allowedHeaders = defaultAllowedHeaders;
corsOptions.exposedHeaders = ['Set-Cookie', 'Authorization', 'Content-Disposition'];
corsOptions.optionsSuccessStatus = 200;
corsOptions.maxAge = 86400;

module.exports = corsOptions;
