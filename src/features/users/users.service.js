const crypto = require('crypto');
const bcrypt = require('bcrypt');
const usersRepository = require('./users.repository');

const IDLE_TIMEOUT_MS = 8 * 60 * 60 * 1000; // 8 hours
const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Service layer containing core business logic for authentication,
 * session management, password hashing, and authorization data assembly.
 */
class UsersService {
  /**
   * Authenticates user credentials and generates a server-side session.
   */
  async login(username, password) {
    if (!username || !password) {
      throw new Error('Invalid credentials');
    }

    const user = await usersRepository.findUserByUsername(username);

    // Generic response to avoid leaking username existence or state
    if (!user || !user.is_active || user.is_blocked) {
      throw new Error('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new Error('Invalid credentials');
    }

    // Cryptographically secure session token
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + IDLE_TIMEOUT_MS);

    await usersRepository.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    const permissions = await usersRepository.getPermissionsByRoleId(user.role_id);

    const userSummary = {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      birthdate: user.birthdate,
      role: user.role_name,
      roleId: user.role_id,
      permissions,
    };

    return {
      token: rawToken,
      user: userSummary,
    };
  }

  /**
   * Validates server-side session token.
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

    // Check account status
    if (!sessionData.is_active || sessionData.is_blocked) {
      await usersRepository.revokeSession(sessionData.session_id);
      return null;
    }

    const now = Date.now();
    const idleExpiresAt = new Date(sessionData.expires_at).getTime();
    const createdAt = new Date(sessionData.created_at).getTime();
    const absoluteExpiresAt = createdAt + ABSOLUTE_LIFETIME_MS;

    // Validate Rule: current_time < idle_expires_at AND current_time < absolute_expires_at
    if (now >= idleExpiresAt || now >= absoluteExpiresAt) {
      await usersRepository.revokeSession(sessionData.session_id);
      return null;
    }

    // Refresh Idle Expiration (capped at absolute_expires_at)
    let newExpiresAtMs = now + IDLE_TIMEOUT_MS;
    if (newExpiresAtMs > absoluteExpiresAt) {
      newExpiresAtMs = absoluteExpiresAt;
    }

    const newExpiresAt = new Date(newExpiresAtMs);
    await usersRepository.updateSessionExpiration(sessionData.session_id, newExpiresAt);

    const permissions = await usersRepository.getPermissionsByRoleId(sessionData.role_id);

    return {
      user: {
        id: sessionData.user_id,
        username: sessionData.username,
        firstName: sessionData.first_name,
        lastName: sessionData.last_name,
        birthdate: sessionData.birthdate,
        role: sessionData.role_name,
        roleId: sessionData.role_id,
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
   * Invalidates server-side session and logs out user.
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
   * Updates user password after verifying current password.
   * Revokes all active user sessions upon completion.
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
    await usersRepository.updatePasswordHash(userId, newPasswordHash);

    // Invalidate existing sessions for security
    await usersRepository.revokeAllUserSessions(userId);

    return { message: 'Password changed successfully' };
  }
}

module.exports = new UsersService();
