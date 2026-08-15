/**
 * Lightweight cookie parsing middleware (zero external dependencies)
 */
const cookieParser = (req, res, next) => {
  const cookieHeader = req.headers.cookie;
  const cookies = {};

  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      const name = parts.shift().trim();
      const value = parts.join('=').trim();
      if (name) {
        try {
          cookies[name] = decodeURIComponent(value);
        } catch {
          cookies[name] = value;
        }
      }
    });
  }

  req.cookies = cookies;
  next();
};

module.exports = cookieParser;
