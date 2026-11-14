const usersRepository = require('./users.repository');
const permissionService = require('./permission.service');
const { historyService, EVENTS } = require('../history');
const { parsePhoneNumber } = require('../../utils/phoneParser');
const mediaService = require('../media/media.service');
const mediaStorage = require('../media/media.storage');
const { extractStorageKey } = require('../media/media.service');

/**
 * Profile Service
 * Handles user profile retrieval and personal details updates (first name, last name, phone, birthdate).
 */
class ProfileService {
  /**
   * Checks whether a target user account holds the Super Admin role
   * (by username, primary role, or secondary user_roles assignment).
   */
  async _isSuperAdminUser(targetUser) {
    if (!targetUser) return false;
    if (targetUser.username === 'superadmin' || targetUser.role_name === 'Super Admin') {
      return true;
    }
    const userRoles = await usersRepository.getUserRoles(targetUser.id);
    return userRoles.some((r) => r.name === 'Super Admin');
  }

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

    const permissions = await permissionService.getPermissionsForUser(userId);
    const userRoles = await usersRepository.getUserRoles(userId);
    const primaryRole = userRoles.find((r) => r.is_primary) || userRoles[0];

    return {
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      lastName: user.last_name,
      phone: user.phone,
      birthdate: user.birthdate,
      role: primaryRole ? primaryRole.name : user.role_name,
      roleId: primaryRole ? primaryRole.id : user.role_id,
      roles: userRoles.map((r) => ({ id: r.id, name: r.name, isPrimary: r.is_primary })),
      roleNames: userRoles.map((r) => r.name),
      isActive: user.is_active,
      isBlocked: user.is_blocked,
      mustChangePassword: user.must_change_password,
      avatarMediaKey: user.avatar_media_key || null,
      avatarUrl: user.avatar_media_key ? mediaStorage.resolveMediaUrl(user.avatar_media_key) : null,
      permissions,
      createdAt: user.created_at,
    };
  }

  /**
   * Updates personal profile information (firstName, lastName, phone, birthdate, avatarMediaKey).
   * Enforces self-update vs admin management authorization.
   */
  async updateProfile(actorUser, targetUserId, { firstName, lastName, phone, birthdate, avatarMediaKey }) {
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

    if (!isSelf && (await this._isSuperAdminUser(target))) {
      const err = new Error('Forbidden: Super Admin profile can only be modified by the Super Admin account itself');
      err.statusCode = 403;
      throw err;
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
      updatePayload.phone = parsePhoneNumber(phone, { required: false });
    }

    if (birthdate !== undefined) {
      updatePayload.birthdate = birthdate;
    }

    if (avatarMediaKey !== undefined) {
      if (avatarMediaKey === null || (typeof avatarMediaKey === 'string' && avatarMediaKey.trim() === '')) {
        // Clearing avatar: delete old asset if not shared
        if (target.avatar_media_key) {
          try {
            const count = await usersRepository.countUsersWithAvatarKey(target.avatar_media_key, targetUserId);
            if (count === 0) {
              await mediaService.deleteMedia(target.avatar_media_key);
            }
          } catch (cleanupErr) {
            console.warn('Failed to delete old avatar asset:', cleanupErr.message);
          }
        }
        updatePayload.avatarMediaKey = null;
      } else {
        const cleanKey = extractStorageKey(String(avatarMediaKey).trim()) || String(avatarMediaKey).trim();
        if (target.avatar_media_key && target.avatar_media_key !== cleanKey) {
          try {
            const count = await usersRepository.countUsersWithAvatarKey(target.avatar_media_key, targetUserId);
            if (count === 0) {
              await mediaService.deleteMedia(target.avatar_media_key);
            }
          } catch (cleanupErr) {
            console.warn('Failed to delete old avatar asset:', cleanupErr.message);
          }
        }
        updatePayload.avatarMediaKey = cleanKey;
      }
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

    await historyService.log(EVENTS.USER_PROFILE_UPDATED, {
      actorUser,
      targetId: targetUserId,
      payload: { isSelf, username: target.username },
    });

    const userRoles = await usersRepository.getUserRoles(targetUserId);
    const primaryRole = userRoles.find((r) => r.is_primary) || userRoles[0];

    return {
      id: updated.id,
      username: updated.username,
      firstName: updated.first_name,
      lastName: updated.last_name,
      phone: updated.phone,
      birthdate: updated.birthdate,
      role: primaryRole ? primaryRole.name : updated.role_name,
      roleId: primaryRole ? primaryRole.id : updated.role_id,
      roles: userRoles.map((r) => ({ id: r.id, name: r.name, isPrimary: r.is_primary })),
      roleNames: userRoles.map((r) => r.name),
      isActive: updated.is_active,
      isBlocked: updated.is_blocked,
      mustChangePassword: updated.must_change_password,
      avatarMediaKey: updated.avatar_media_key || null,
      avatarUrl: updated.avatar_media_key ? mediaStorage.resolveMediaUrl(updated.avatar_media_key) : null,
      createdAt: updated.created_at,
    };
  }

  /**
   * Uploads and attaches a new profile photo for a user.
   * Purges previous avatar photo from active storage if present and not referenced by another user.
   *
   * @param {object} actorUser - Authenticated user performing the upload
   * @param {string} targetUserId - Target user receiving the new avatar
   * @param {Express.Multer.File} file - Uploaded image binary buffer
   * @param {import('express').Request} [req] - Express request for URL resolution
   * @returns {Promise<object>} Updated user profile
   */
  async uploadAvatar(actorUser, targetUserId, file, req) {
    if (!targetUserId) {
      const err = new Error('Target user ID is required');
      err.statusCode = 400;
      throw err;
    }

    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const isSelf = actorUser.id === targetUserId;
    const canManage = permissionService.can(actorUser, 'users.manage');

    if (!isSelf && !canManage) {
      const err = new Error('Forbidden: You do not have permission to update this profile picture');
      err.statusCode = 403;
      throw err;
    }

    if (!isSelf && (await this._isSuperAdminUser(target))) {
      const err = new Error('Forbidden: Super Admin profile picture can only be modified by the Super Admin account itself');
      err.statusCode = 403;
      throw err;
    }

    if (!file || !file.buffer) {
      const err = new Error('No avatar image uploaded or file buffer is empty');
      err.statusCode = 400;
      err.code = 'FILE_REQUIRED';
      throw err;
    }

    // Ingest into unified media subsystem under canonical 'users/avatars' domain
    const uploadRes = await mediaService.uploadMedia({
      file,
      domain: 'users/avatars',
      req,
    });
    const newKey = uploadRes.storageKey;

    // Purge old avatar from storage if different and not referenced by another user
    if (target.avatar_media_key && target.avatar_media_key !== newKey) {
      try {
        const count = await usersRepository.countUsersWithAvatarKey(target.avatar_media_key, targetUserId);
        if (count === 0) {
          await mediaService.deleteMedia(target.avatar_media_key);
        }
      } catch (cleanupErr) {
        console.warn('Failed to delete old avatar asset:', cleanupErr.message);
      }
    }

    // Persist new avatar relative key in users table
    await usersRepository.updateUserProfile(targetUserId, { avatarMediaKey: newKey });

    if (actorUser.id !== targetUserId) {
      await usersRepository.createAuditLog({
        userId: actorUser.id,
        targetUserId,
        action: 'USER_AVATAR_UPDATED',
        description: `Updated profile picture for user ${target.username}`,
      });
    }

    await historyService.log(EVENTS.USER_AVATAR_UPDATED, {
      actorUser,
      targetId: targetUserId,
      payload: { isSelf, username: target.username },
    });

    return this.getProfile(targetUserId);
  }

  /**
   * Removes profile photo for a user.
   * Purges previous avatar photo from active storage if present and not referenced by another user.
   *
   * @param {object} actorUser - Authenticated user performing the removal
   * @param {string} targetUserId - Target user losing their avatar
   * @returns {Promise<object>} Updated user profile
   */
  async removeAvatar(actorUser, targetUserId) {
    if (!targetUserId) {
      const err = new Error('Target user ID is required');
      err.statusCode = 400;
      throw err;
    }

    const target = await usersRepository.findUserById(targetUserId);
    if (!target) {
      const err = new Error('User not found');
      err.statusCode = 404;
      throw err;
    }

    const isSelf = actorUser.id === targetUserId;
    const canManage = permissionService.can(actorUser, 'users.manage');

    if (!isSelf && !canManage) {
      const err = new Error('Forbidden: You do not have permission to remove this profile picture');
      err.statusCode = 403;
      throw err;
    }

    if (!isSelf && (await this._isSuperAdminUser(target))) {
      const err = new Error('Forbidden: Super Admin profile picture can only be modified by the Super Admin account itself');
      err.statusCode = 403;
      throw err;
    }

    if (target.avatar_media_key) {
      try {
        const count = await usersRepository.countUsersWithAvatarKey(target.avatar_media_key, targetUserId);
        if (count === 0) {
          await mediaService.deleteMedia(target.avatar_media_key);
        }
      } catch (cleanupErr) {
        console.warn('Failed to delete avatar asset during removal:', cleanupErr.message);
      }
      await usersRepository.updateUserProfile(targetUserId, { avatarMediaKey: null });
    }

    if (actorUser.id !== targetUserId) {
      await usersRepository.createAuditLog({
        userId: actorUser.id,
        targetUserId,
        action: 'USER_AVATAR_REMOVED',
        description: `Removed profile picture for user ${target.username}`,
      });
    }

    await historyService.log(EVENTS.USER_AVATAR_REMOVED, {
      actorUser,
      targetId: targetUserId,
      payload: { isSelf, username: target.username },
    });

    return this.getProfile(targetUserId);
  }
}

module.exports = new ProfileService();
