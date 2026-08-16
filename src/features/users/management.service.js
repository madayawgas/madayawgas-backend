const bcrypt = require('bcrypt');
const usersRepository = require('./users.repository');
const authService = require('./auth.service');
const profileService = require('./profile.service');

/**
 * Management Service
 * Handles user administration, account registration, credential updates,
 * status activation/deactivation, account blocking/unblocking, and role assignments.
 */
class ManagementService {
  /**
   * Registers/Creates a new user account (Admin operation).
   */
  async createUser(actorUser, { username, password, firstName, lastName, birthdate = null, roleId }) {
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      throw new Error('Username must be at least 3 characters long');
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (!firstName || !lastName) {
      throw new Error('First name and last name are required');
    }

    if (!roleId) {
      throw new Error('Role ID is required');
    }

    const trimmedUsername = username.trim();

    // Check username uniqueness
    const existing = await usersRepository.findUserByUsername(trimmedUsername);
    if (existing) {
      throw new Error('Username is already in use');
    }

    // Validate role exists
    const role = await usersRepository.findRoleById(roleId);
    if (!role) {
      throw new Error('Invalid role ID');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const createdUser = await usersRepository.createUser({
      username: trimmedUsername,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthdate,
      roleId,
    });

    if (actorUser) {
      await usersRepository.createAuditLog({
        userId: actorUser.id,
        targetUserId: createdUser.id,
        action: 'USER_CREATED',
        description: `Created user ${createdUser.username} with role ${role.name}`,
      });
    }

    return {
      id: createdUser.id,
      username: createdUser.username,
      firstName: createdUser.first_name,
      lastName: createdUser.last_name,
      birthdate: createdUser.birthdate,
      role: role.name,
      roleId: createdUser.role_id,
      isActive: createdUser.is_active,
      isBlocked: createdUser.is_blocked,
      createdAt: createdUser.created_at,
    };
  }

  /**
   * Returns list of all user accounts.
   */
  async getAllUsers() {
    const users = await usersRepository.findAllUsers();
    return users.map((u) => ({
      id: u.id,
      username: u.username,
      firstName: u.first_name,
      lastName: u.last_name,
      birthdate: u.birthdate,
      role: u.role_name,
      roleId: u.role_id,
      isActive: u.is_active,
      isBlocked: u.is_blocked,
      createdAt: u.created_at,
    }));
  }

  /**
   * Returns user details and permissions by user ID.
   */
  async getUserById(targetId) {
    return profileService.getProfile(targetId);
  }

  /**
   * Updates user role as an Administrator.
   * Revokes all active sessions for the target user.
   */
  async updateUserRole(actorUser, targetUserId, roleId) {
    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    const role = await usersRepository.findRoleById(roleId);
    if (!role) {
      throw new Error('Invalid role ID');
    }

    const updated = await usersRepository.updateUserProfile(targetUserId, { roleId });

    // Revoke all active sessions so target user gets new permissions upon next login
    await authService.revokeAllUserSessions(targetUserId);

    await usersRepository.createAuditLog({
      userId: actorUser.id,
      targetUserId,
      action: 'USER_ROLE_UPDATED',
      description: `Updated role for user ${target.username} to ${role.name}`,
    });

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      birthdate: updated.birthdate,
      role: updated.role_name,
      roleId: updated.role_id,
      isActive: updated.is_active,
      isBlocked: updated.is_blocked,
      createdAt: updated.created_at,
    };
  }

  /**
   * Updates user credentials (username and/or password) as an Administrator.
   * Revokes all active sessions for the target user.
   */
  async updateCredentials(actorUser, targetUserId, { username, password }) {
    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    const updatePayload = {};

    if (username !== undefined) {
      if (typeof username !== 'string' || username.trim().length < 3) {
        throw new Error('Username must be at least 3 characters long');
      }
      const trimmed = username.trim();
      if (trimmed !== target.username) {
        const existing = await usersRepository.findUserByUsername(trimmed);
        if (existing) {
          throw new Error('Username is already in use');
        }
        updatePayload.username = trimmed;
      }
    }

    if (password !== undefined) {
      if (typeof password !== 'string' || password.length < 8) {
        throw new Error('Password must be at least 8 characters long');
      }
      updatePayload.passwordHash = await bcrypt.hash(password, 10);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No credential updates provided');
    }

    const updated = await usersRepository.updateUserCredentials(targetUserId, updatePayload);

    // Revoke all existing sessions for target user
    await authService.revokeAllUserSessions(targetUserId);

    await usersRepository.createAuditLog({
      userId: actorUser.id,
      targetUserId,
      action: 'USER_CREDENTIALS_UPDATED',
      description: `Admin updated credentials for user ${target.username}`,
    });

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      role: updated.role_name,
      roleId: updated.role_id,
      message: 'User credentials updated successfully. Target user must log in again.',
    };
  }

  /**
   * Deactivates/Activates or Blocks/Unblocks a user account (Admin operation).
   * Super Admin accounts cannot be deactivated or blocked.
   */
  async setUserStatus(actorUser, targetUserId, { isActive, isBlocked }) {
    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    // Protect Super Admin accounts from deactivation or blocking
    if (target.role_name === 'Super Admin') {
      if (isActive === false || isBlocked === true) {
        throw new Error('Super Admin account cannot be deactivated or blocked');
      }
    }

    const updatePayload = {};

    if (isActive !== undefined) {
      updatePayload.isActive = Boolean(isActive);
    }

    if (isBlocked !== undefined) {
      updatePayload.isBlocked = Boolean(isBlocked);
    }

    if (Object.keys(updatePayload).length === 0) {
      throw new Error('No status updates provided');
    }

    const updated = await usersRepository.updateUserStatus(targetUserId, updatePayload);

    // If deactivated or blocked, instantly revoke active sessions
    if (updatePayload.isActive === false || updatePayload.isBlocked === true) {
      await authService.revokeAllUserSessions(targetUserId);
    }

    const action =
      updatePayload.isActive === false
        ? 'USER_DEACTIVATED'
        : updatePayload.isBlocked === true
        ? 'USER_BLOCKED'
        : updatePayload.isBlocked === false
        ? 'USER_UNBLOCKED'
        : 'USER_ACTIVATED';

    await usersRepository.createAuditLog({
      userId: actorUser.id,
      targetUserId,
      action,
      description: `Updated status for ${target.username}: active=${updated.is_active}, blocked=${updated.is_blocked}`,
    });

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      role: updated.role_name,
      isActive: updated.is_active,
      isBlocked: updated.is_blocked,
    };
  }

  /**
   * Returns available roles for role selection.
   */
  async getRoles() {
    return usersRepository.findRoles();
  }
}

module.exports = new ManagementService();
