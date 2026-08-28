const bcrypt = require('bcrypt');
const usersRepository = require('./users.repository');
const authService = require('./auth.service');
const profileService = require('./profile.service');
const { historyService } = require('../history');
const { generateBaseUsername, resolveUniqueUsername } = require('../../utils/usernameGenerator');
const { generateTemporaryPassword } = require('../../utils/passwordGenerator');

/**
 * Management Service
 * Handles user administration, automatic account creation with auto-generated username
 * and temporary password, credential resets, account deactivation/blocking, and role assignments.
 */
class ManagementService {
  /**
   * Helper to verify the acting admin's password before performing dangerous actions.
   */
  async verifyAdminPassword(actorUserId, adminPassword) {
    if (!adminPassword || typeof adminPassword !== 'string' || adminPassword.trim().length === 0) {
      throw new Error('Admin password confirmation is required for this action');
    }

    const actor = await usersRepository.findUserWithPasswordById(actorUserId);
    if (!actor) {
      throw new Error('Unauthorized');
    }

    const isValid = await bcrypt.compare(adminPassword, actor.password_hash);
    if (!isValid) {
      throw new Error('Invalid admin password confirmation');
    }
  }

  /**
   * Registers/Creates a new user account (Admin operation).
   * Automatically generates the username (firstName[0] + lastName, e.g. jdoe)
   * and generates a cryptographically random temporary password.
   */
  async createUser(actorUser, { firstName, lastName, phone = null, birthdate = null, roleId }) {
    if (!firstName || typeof firstName !== 'string' || firstName.trim().length === 0) {
      throw new Error('First name is required');
    }

    if (!lastName || typeof lastName !== 'string' || lastName.trim().length === 0) {
      throw new Error('Last name is required');
    }

    if (!roleId) {
      throw new Error('Role ID is required');
    }

    // Validate role exists
    const role = await usersRepository.findRoleById(roleId);
    if (!role) {
      throw new Error('Invalid role ID');
    }

    // Auto-generate username strictly from firstName and lastName (e.g. John Doe -> jdoe)
    const baseUsername = generateBaseUsername(firstName, lastName);
    const existingUsernames = await usersRepository.findUsernamesLike(`${baseUsername}%`);
    const finalUsername = resolveUniqueUsername(baseUsername, existingUsernames);

    // Auto-generate randomized temporary password
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await bcrypt.hash(temporaryPassword, 10);

    const createdUser = await usersRepository.createUser({
      username: finalUsername,
      passwordHash,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      phone: phone !== null && typeof phone === 'string' ? phone.trim() : null,
      birthdate,
      roleId,
      mustChangePassword: true,
    });

    if (actorUser) {
      await usersRepository.createAuditLog({
        userId: actorUser.id,
        targetUserId: createdUser.id,
        action: 'USER_CREATED',
        description: `Created user ${createdUser.username} with role ${role.name}`,
      });
    }

    await historyService.logEvent({
      actorUser,
      userId: actorUser?.id,
      actionType: 'Created',
      module: 'User Management',
      action: 'USER_CREATED',
      details: `Created new user account for '${createdUser.first_name} ${createdUser.last_name}'`,
      targetId: createdUser.id,
      targetType: 'user',
      metadata: { username: createdUser.username, role: role.name },
    });

    return {
      user: {
        id: createdUser.id,
        username: createdUser.username,
        firstName: createdUser.first_name,
        lastName: createdUser.last_name,
        phone: createdUser.phone,
        birthdate: createdUser.birthdate,
        role: role.name,
        roleId: createdUser.role_id,
        isActive: createdUser.is_active,
        isBlocked: createdUser.is_blocked,
        mustChangePassword: createdUser.must_change_password,
        createdAt: createdUser.created_at,
      },
      temporaryPassword,
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
      phone: u.phone,
      birthdate: u.birthdate,
      role: u.role_name,
      roleId: u.role_id,
      isActive: u.is_active,
      isBlocked: u.is_blocked,
      mustChangePassword: u.must_change_password,
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
   * Revokes all active sessions for the target user so updated permissions apply immediately.
   */
  async updateUserRole(actorUser, targetUserId, roleId) {
    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    if (target.username === 'superadmin' || target.role_name === 'Super Admin') {
      throw new Error('Cannot change the role of a Super Admin account');
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

    await historyService.logEvent({
      actorUser,
      userId: actorUser.id,
      actionType: 'Updated',
      module: 'User Management',
      action: 'USER_ROLE_UPDATED',
      details: `Updated role for user '${target.username}' to '${role.name}'`,
      targetId: targetUserId,
      targetType: 'user',
      metadata: { previousRole: target.role_name, newRole: role.name },
    });

    const permissions = await usersRepository.getPermissionsByRoleId(updated.role_id);

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      birthdate: updated.birthdate,
      role: updated.role_name,
      roleId: updated.role_id,
      isActive: updated.is_active,
      isBlocked: updated.is_blocked,
      mustChangePassword: updated.must_change_password,
      permissions,
      createdAt: updated.created_at,
    };
  }

  /**
   * Updates user credentials (username and/or triggers password reset) as an Administrator.
   * Requires admin password confirmation.
   * If resetPassword is true (or password requested), generates a new temporary password,
   * sets must_change_password = true, and revokes all active sessions for the target user.
   */
  async updateCredentials(actorUser, targetUserId, { username, resetPassword = false, password, adminPassword }) {
    await this.verifyAdminPassword(actorUser.id, adminPassword);

    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    const updatePayload = {};
    let generatedTemporaryPassword = null;

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

    if (resetPassword || password !== undefined) {
      const tempPass = password && typeof password === 'string' && password.length >= 8
        ? password
        : generateTemporaryPassword();

      generatedTemporaryPassword = tempPass;
      updatePayload.passwordHash = await bcrypt.hash(tempPass, 10);
      updatePayload.mustChangePassword = true;
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
      description: `Admin confirmed and updated credentials for user ${target.username}`,
    });

    await historyService.logEvent({
      actorUser,
      userId: actorUser.id,
      actionType: 'Updated',
      module: 'User Management',
      action: 'USER_CREDENTIALS_UPDATED',
      details: generatedTemporaryPassword
        ? `Admin reset temporary password for user '${target.username}'`
        : `Admin updated username for user '${target.username}'`,
      targetId: targetUserId,
      targetType: 'user',
    });

    const response = {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      role: updated.role_name,
      roleId: updated.role_id,
      mustChangePassword: updated.must_change_password,
      message: 'User credentials updated successfully. Target user must log in again.',
    };

    if (generatedTemporaryPassword) {
      response.temporaryPassword = generatedTemporaryPassword;
      response.message = 'Temporary password generated. Target user must log in and change their password.';
    }

    return response;
  }

  /**
   * Deactivates/Activates or Blocks/Unblocks a user account (Admin operation).
   * Requires admin password confirmation.
   * Super Admin accounts cannot be deactivated or blocked.
   */
  async setUserStatus(actorUser, targetUserId, { isActive, isBlocked, adminPassword }) {
    await this.verifyAdminPassword(actorUser.id, adminPassword);

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
      description: `Admin confirmed and updated status for ${target.username}: active=${updated.is_active}, blocked=${updated.is_blocked}`,
    });

    const histActionType = updatePayload.isActive === false || updatePayload.isBlocked === true ? 'Deactivated' : 'Updated';
    const histDetails = updatePayload.isActive === false
      ? `Deactivated account access for '${target.username}'`
      : updatePayload.isBlocked === true
      ? `Blocked account access for '${target.username}'`
      : `Activated account access for '${target.username}'`;

    await historyService.logEvent({
      actorUser,
      userId: actorUser.id,
      actionType: histActionType,
      module: 'User Management',
      action,
      details: histDetails,
      targetId: targetUserId,
      targetType: 'user',
      metadata: { isActive: updated.is_active, isBlocked: updated.is_blocked },
    });

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      role: updated.role_name,
      isActive: updated.is_active,
      isBlocked: updated.is_blocked,
      mustChangePassword: updated.must_change_password,
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
