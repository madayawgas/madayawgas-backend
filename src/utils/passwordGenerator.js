const crypto = require('crypto');

/**
 * Generates a cryptographically strong, user-friendly temporary password.
 * Format: Mg# + 8 alphanumeric random characters + ! (e.g. Mg#8xK9pL2!)
 */
function generateTemporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const randomBytes = crypto.randomBytes(8);
  let randomString = '';
  for (let i = 0; i < 8; i++) {
    randomString += chars[randomBytes[i] % chars.length];
  }
  return `Mg#${randomString}!`;
}

module.exports = {
  generateTemporaryPassword,
};
