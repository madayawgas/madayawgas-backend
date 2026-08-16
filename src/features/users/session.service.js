const crypto = require('crypto');
const usersRepository = require('./users.repository');

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Service dedicated strictly to session lifecycle management:
 * token generation, hashing, 8-hour idle timeout & 30-day absolute expiration
 * enforcement, idle refresh, and revocation.
 */
class SessionService {
  /**
   * Creates a new server-side session for a user.
   */
  async createSession(userId) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + IDLE_TIMEOUT_MS);

    const sessionRecord = await usersRepository.createSession({
      userId,
      tokenHash,
      expiresAt,
    });

    return {
      token: rawToken,
      session: sessionRecord,
    };
  }

  /**
   * Validates raw session token from HTTP cookie.
   * Enforces 8-hour idle timeout and 30-day absolute lifetime.
   * Refreshes idle expiration if session is valid.
   */
  async validateSession(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return null;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    const sessionData = await usersRepository.findSessionByTokenHash(tokenHash);

    if (!sessionData || sessionData.revoked_at) {
      return null;
    }

    if (!sessionData.is_active || sessionData.is_blocked) {
      await usersRepository.revokeSession(sessionData.session_id);
      return null;
    }

    const now = Date.now();
    const idleExpiresAt = new Date(sessionData.expires_at).getTime();
    const createdAt = new Date(sessionData.created_at).getTime();
    const absoluteExpiresAt = createdAt + ABSOLUTE_LIFETIME_MS;

    // Check expiration rule: current_time < idle_expires_at AND current_time < absolute_expires_at
    if (now >= idleExpiresAt || now >= absoluteExpiresAt) {
      await usersRepository.revokeSession(sessionData.session_id);
      return null;
    }

    // Refresh Idle Expiration (capped at 30-day absolute expiration limit)
    let newExpiresAtMs = now + IDLE_TIMEOUT_MS;
    if (newExpiresAtMs > absoluteExpiresAt) {
      newExpiresAtMs = absoluteExpiresAt;
    }

    const newExpiresAt = new Date(newExpiresAtMs);
    await usersRepository.updateSessionExpiration(sessionData.session_id, newExpiresAt);

    return {
      sessionData,
      newExpiresAt,
    };
  }

  /**
   * Revokes a session by raw token.
   */
  async revokeSession(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return true;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await usersRepository.revokeSessionByTokenHash(tokenHash);
    return true;
  }

  /**
   * Revokes all active sessions for a user ID (e.g. after password change).
   */
  async revokeAllUserSessions(userId) {
    if (!userId) return;
    await usersRepository.revokeAllUserSessions(userId);
  }
}

module.exports = new SessionService();
