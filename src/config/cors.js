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

/**
 * Validates if incoming Origin header is permitted.
 * Supports:
 * - Direct matches in whitelist or CORS_ORIGIN
 * - Any localhost or 127.0.0.1 origin across arbitrary development ports
 * - Any Vercel branch / preview deployments for madayawgas
 * - Origin-less requests (curl, server-to-server, mobile native)
 */
function isOriginAllowed(origin) {
  if (!origin) return true;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // 1. Explicitly whitelisted
  if (allowedOriginsSet.has(cleanOrigin)) {
    return true;
  }

  // 2. Local development on any port (HTTP or HTTPS)
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin)) {
    return true;
  }

  // 3. Vercel deployment and preview URLs for madayawgas
  if (/^https:\/\/(madayawgas|[\w-]+-madayawgas|madayawgas-[\w-]+)\.vercel\.app$/.test(cleanOrigin)) {
    return true;
  }

  return false;
}

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Confirm-Password',
    'x-confirm-password',
  ],
  exposedHeaders: ['Set-Cookie'],
  optionsSuccessStatus: 200,
};

module.exports = corsOptions;
