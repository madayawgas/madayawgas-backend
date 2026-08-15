const bcrypt = require('bcrypt');
const usersRepository = require('./users.repository');
const sessionService = require('./session.service');
const permissionService = require('./permission.service');

/**
 * Service layer focused strictly on user authentication credentials,
 * user profile assembly, and password management.
 * Delegates session lifecycle to sessionService and RBAC to permissionService.
 */
class UsersService {
  /**
   * Authenticates user credentials and delegates session creation.
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

    // Delegate session creation to session.service
    const { token } = await sessionService.createSession(user.id);

    // Delegate permission loading to permission.service
    const permissions = await permissionService.getPermissionsForRole(user.role_id);

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
      token,
      user: userSummary,
    };
  }

  /**
   * Validates server-side session token and constructs user context.
   */
  async validateSession(rawToken) {
    const validSession = await sessionService.validateSession(rawToken);
    if (!validSession) {
      return null;
    }

    const { sessionData, newExpiresAt } = validSession;

    // Delegate permission loading to permission.service
    const permissions = await permissionService.getPermissionsForRole(sessionData.role_id);

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
   * Delegates logout session revocation.
   */
  async logout(rawToken) {
    return sessionService.revokeSession(rawToken);
  }

  /**
   * Updates user password and revokes all active user sessions.
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

    // Revoke all active sessions for security via sessionService
    await sessionService.revokeAllUserSessions(userId);

    return { message: 'Password changed successfully' };
  }
}

module.exports = new UsersService();
