const { Server } = require('socket.io');
const corsOptions = require('./config/cors');
const { isProduction } = require('./config/env');
const authService = require('./features/users/auth.service');
const { COOKIE_NAME } = require('./config/cookie');

let io = null;

/**
 * Extracts session cookie value from a raw Cookie header string.
 *
 * @param {string} cookieHeader - Raw cookie header string
 * @param {string} [name=COOKIE_NAME] - Cookie name to extract
 * @returns {string|null} Cookie value or null
 */
function extractCookieToken(cookieHeader, name = COOKIE_NAME) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null;
  const match = cookieHeader.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Initializes the Socket.IO server and binds it to the provided HTTP server.
 *
 * @param {import('node:http').Server} httpServer - Node.js HTTP server instance
 * @param {object} [customOptions={}] - Optional configuration overrides (e.g. skipAuth: true for tests)
 * @returns {Server} Initialized Socket.IO server instance
 */
function initializeSocket(httpServer, customOptions = {}) {
  if (io) {
    if (!isProduction && process.env.NODE_ENV !== 'production') {
      console.warn('[Socket.IO] Warning: initializeSocket called when already initialized. Returning existing instance.');
    }
    return io;
  }

  if (!httpServer) {
    throw new Error('initializeSocket requires an HTTP server instance');
  }

  const defaultOptions = {
    cors: {
      origin: (origin, callback) => {
        // Socket.IO long-polling requests pass the Origin header.
        // For tools, native mobile apps, or same-origin requests, origin may be undefined.
        // corsOptions.isOriginAllowed treats undefined origin as allowed by default.
        if (corsOptions.isOriginAllowed(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`CORS error: Origin ${origin} is not allowed`));
      },
      credentials: true,
      methods: ['GET', 'POST'],
    },
    transports: ['websocket', 'polling'],
  };

  const mergedOptions = {
    ...defaultOptions,
    ...customOptions,
    cors: {
      ...defaultOptions.cors,
      ...(customOptions.cors || {}),
    },
  };

  io = new Server(httpServer, mergedOptions);

  // Handshake Authentication Middleware
  if (!customOptions.skipAuth) {
    io.use(async (socket, next) => {
      try {
        const cookieHeader = socket.handshake.headers?.cookie || '';
        const cookieToken = extractCookieToken(cookieHeader);
        const authToken = socket.handshake.auth?.token;
        const authHeader = socket.handshake.headers?.authorization;
        const bearerToken = authHeader && /^Bearer\s+/i.test(authHeader)
          ? authHeader.replace(/^Bearer\s+/i, '').trim()
          : null;
        const customHeaderToken =
          (typeof socket.handshake.headers?.['x-access-token'] === 'string' && socket.handshake.headers['x-access-token'].trim()) ||
          (typeof socket.handshake.headers?.['x-auth-token'] === 'string' && socket.handshake.headers['x-auth-token'].trim()) ||
          null;

        const rawToken = cookieToken || authToken || bearerToken || customHeaderToken;

        if (!rawToken) {
          return next(new Error('Authentication error: Unauthorized'));
        }

        const authResult = await authService.validateSession(rawToken);
        if (!authResult || !authResult.user) {
          return next(new Error('Authentication error: Unauthorized'));
        }

        socket.user = authResult.user;
        socket.session = authResult.session;
        next();
      } catch (err) {
        next(new Error('Authentication error: Unauthorized'));
      }
    });
  }

  // Connection Lifecycle & Automatic Room Assignment
  io.on('connection', (socket) => {
    if (!isProduction && process.env.NODE_ENV !== 'production') {
      console.log(`[Socket.IO] Client connected: ${socket.id} (User: ${socket.user?.username || 'unauthenticated'})`);
    }

    // Server-Side Automatic Room Assignment based on RBAC Permissions
    if (socket.user) {
      const permissions = socket.user.permissions || [];

      // Driver Emergency Alerts Room
      if (permissions.includes('alerts.view') || permissions.includes('alerts.manage')) {
        socket.join('room:alerts');
      }

      // Fleet Readiness & Maintenance Room
      if (
        permissions.includes('fleet.view') ||
        permissions.includes('fleet.manage') ||
        permissions.includes('route.manage')
      ) {
        socket.join('room:fleet');
      }

      // Inventory & Plant Stock Room
      if (
        permissions.includes('inventory.view') ||
        permissions.includes('inventory.plant.manage') ||
        permissions.includes('inventory.vehicle.manage')
      ) {
        socket.join('room:inventory');
      }

      // Sales & Delivery Shift Room
      if (permissions.includes('sales.view') || permissions.includes('dashboard.view')) {
        socket.join('room:sales');
      }

      // User Private Room
      if (socket.user.id) {
        socket.join(`user:${socket.user.id}`);
      }
    }

    socket.on('disconnect', (reason) => {
      if (!isProduction && process.env.NODE_ENV !== 'production') {
        console.log(`[Socket.IO] Client disconnected: ${socket.id} (reason: ${reason})`);
      }
    });
  });

  return io;
}

/**
 * Retrieves the active Socket.IO server instance.
 *
 * @returns {Server} Active Socket.IO server instance
 * @throws {Error} If called before initializeSocket()
 */
function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized. Call initializeSocket(httpServer) first.');
  }
  return io;
}

/**
 * Checks whether the Socket.IO server instance is currently initialized.
 *
 * @returns {boolean}
 */
function isSocketInitialized() {
  return io !== null;
}

/**
 * Emits an application-level event using the standardized event envelope.
 *
 * @param {string} eventName - The event name to emit
 * @param {any} [data={}] - Caller-supplied event payload
 * @param {string|null} [room=null] - Target room name for scoped broadcasts
 * @returns {object} The emitted envelope payload
 */
function emitSocketEvent(eventName, data = {}, room = null) {
  if (!eventName || typeof eventName !== 'string') {
    throw new Error('emitSocketEvent requires a valid string eventName');
  }

  const activeIO = getIO();

  const payload = {
    event: eventName,
    data: data !== undefined && data !== null ? data : {},
    meta: {
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  };

  if (room) {
    activeIO.to(room).emit(eventName, payload);
  } else {
    activeIO.emit(eventName, payload);
  }

  return payload;
}

/**
 * Safely emits an application-level event if Socket.IO is initialized.
 * Avoids throwing in headless test environments where Socket.IO is not running.
 *
 * @param {string} eventName - The event name to emit
 * @param {any} [data={}] - Caller-supplied event payload
 * @param {string|null} [room=null] - Target room name for scoped broadcasts
 * @returns {object|null} The emitted payload, or null if Socket.IO is uninitialized
 */
function safeEmitSocketEvent(eventName, data = {}, room = null) {
  if (!isSocketInitialized()) {
    return null;
  }
  try {
    return emitSocketEvent(eventName, data, room);
  } catch (err) {
    if (!isProduction && process.env.NODE_ENV !== 'production') {
      console.warn(`[Socket.IO] Warning: safeEmitSocketEvent failed for '${eventName}':`, err.message);
    }
    return null;
  }
}

/**
 * Closes the active Socket.IO server and resets the singleton instance.
 * Useful for test teardowns and graceful server shutdown.
 *
 * @returns {Promise<void>}
 */
async function closeSocket() {
  if (io) {
    const currentIO = io;
    io = null;
    await new Promise((resolve) => {
      currentIO.close(() => resolve());
    });
  }
}

module.exports = {
  initializeSocket,
  getIO,
  isSocketInitialized,
  emitSocketEvent,
  safeEmitSocketEvent,
  closeSocket,
};
