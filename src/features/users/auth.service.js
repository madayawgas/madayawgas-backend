const crypto = require('crypto');
const bcrypt = require('bcrypt');
const usersRepository = require('./users.repository');
const permissionService = require('./permission.service');

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Authentication Service
 * Handles user login verification, server-side session lifecycle (token generation,
 * SHA-256 hashing, 8-hour idle timeout & 30-day absolute expiration enforcement),
 * logout, and self password change.
 */
class AuthService {
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

    const permissions = await permissionService.getPermissionsForRole(sessionData.role_id);

    return {
      user: {
        id: sessionData.user_id,
        username: sessionData.username,
        firstName: sessionData.first_name,
        lastName: sessionData.last_name,
        phone: sessionData.phone,
        birthdate: sessionData.birthdate,
        role: sessionData.role_name,
        roleId: sessionData.role_id,
        isActive: sessionData.is_active,
        isBlocked: sessionData.is_blocked,
        mustChangePassword: sessionData.must_change_password,
        permissions,
      },
      session: {
        id: sessionData.session_id,
        createdAt: sessionData.created_at,
        expiresAt: newExpiresAt,
      },
    };
  }

  /**
   * Authenticates user credentials and generates a new session.
   */
  async login(username, password) {
    if (!username || !password) {
      throw new Error('Invalid credentials');
    }

    const user = await usersRepository.findUserByUsername(username);

    // Generic error response to avoid leaking username existence
    if (!user || !user.is_active || user.is_blocked) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    const { token } = await this.createSession(user.id);
    const permissions = await permissionService.getPermissionsForRole(user.role_id);

    const userSummary = {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      birthdate: user.birthdate,
      role: user.role_name,
      roleId: user.role_id,
      isActive: user.is_active,
      isBlocked: user.is_blocked,
      mustChangePassword: user.must_change_password,
      permissions,
    };

    return {
      token,
      user: userSummary,
    };
  }

  /**
   * Logs out user by revoking session in DB.
   */
  async logout(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      return true;
    }

    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
    await usersRepository.revokeSessionByTokenHash(tokenHash);
    return true;
  }

  /**
   * Changes current authenticated user's password, sets must_change_password to FALSE,
   * and revokes all active sessions.
   */
  async changePassword(userId, currentPassword, newPassword) {
    if (!currentPassword || !newPassword) {
      throw new Error('Current password and new password are required');
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters long');
    }

    const user = await usersRepository.findUserWithPasswordById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      throw new Error('Current password is incorrect');
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    // Sets must_change_password = false
    await usersRepository.updatePasswordHash(userId, newPasswordHash, false);

    // Invalidate all active sessions for security
    await this.revokeAllUserSessions(userId);

    return { message: 'Password changed successfully. Please log in again.' };
  }

  /**
   * Helper to revoke all active sessions for a user.
   */
  async revokeAllUserSessions(userId) {
    if (!userId) return;
    await usersRepository.revokeAllUserSessions(userId);
  }
}

module.exports = new AuthService();
