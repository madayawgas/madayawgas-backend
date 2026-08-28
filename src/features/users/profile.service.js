const usersRepository = require('./users.repository');
const permissionService = require('./permission.service');
const { historyService } = require('../history');

/**
 * Profile Service
 * Handles user profile retrieval and personal details updates (first name, last name, phone, birthdate).
 */
class ProfileService {
  /**
   * Retrieves profile information and permissions for a user ID.
   */
  async getProfile(userId) {
    if (!userId) {
      throw new Error('User ID is required');
    }

    const user = await usersRepository.findUserById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const permissions = await permissionService.getPermissionsForRole(user.role_id);

    return {
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
      createdAt: user.created_at,
    };
  }

  /**
   * Updates personal profile information (firstName, lastName, phone, birthdate).
   * Enforces self-update vs admin management authorization.
   */
  async updateProfile(actorUser, targetUserId, { firstName, lastName, phone, birthdate }) {
    if (!targetUserId) {
      throw new Error('Target user ID is required');
    }

    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      throw new Error('User not found');
    }

    const isSelf = actorUser.id === targetUserId;
    const canManage = permissionService.can(actorUser, 'users.manage');

    if (!isSelf && !canManage) {
      throw new Error('Forbidden: You do not have permission to update this profile');
    }

    const updatePayload = {};

    if (firstName !== undefined) {
      if (typeof firstName !== 'string' || firstName.trim().length === 0) {
        throw new Error('First name cannot be empty');
      }
      updatePayload.firstName = firstName.trim();
    }

    if (lastName !== undefined) {
      if (typeof lastName !== 'string' || lastName.trim().length === 0) {
        throw new Error('Last name cannot be empty');
      }
      updatePayload.lastName = lastName.trim();
    }

    if (phone !== undefined) {
      updatePayload.phone = phone !== null && typeof phone === 'string' ? phone.trim() : null;
    }

    if (birthdate !== undefined) {
      updatePayload.birthdate = birthdate;
    }

    if (Object.keys(updatePayload).length === 0) {
      return this.getProfile(targetUserId);
    }

    const updated = await usersRepository.updateUserProfile(targetUserId, updatePayload);

    if (actorUser.id !== targetUserId) {
      await usersRepository.createAuditLog({
        userId: actorUser.id,
        targetUserId,
        action: 'USER_PROFILE_UPDATED',
        description: `Updated profile for user ${target.username}`,
      });
    }

    await historyService.logEvent({
      actorUser,
      userId: actorUser?.id,
      actionType: 'Updated',
      module: 'User Management',
      action: 'USER_PROFILE_UPDATED',
      details: isSelf
        ? `Updated personal profile details`
        : `Updated profile details for '${target.username}'`,
      targetId: targetUserId,
      targetType: 'user',
    });

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
      createdAt: updated.created_at,
    };
  }
}

module.exports = new ProfileService();
