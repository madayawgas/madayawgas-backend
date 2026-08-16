const authService = require('./auth.service');
const profileService = require('./profile.service');
const managementService = require('./management.service');
const permissionService = require('./permission.service');

/**
 * Users Service (Facade)
 * Delegates to domain-specific services:
 * - authService (authentication, session lifecycle, login, logout, password change)
 * - profileService (user profile retrieval, personal info updates)
 * - managementService (admin user creation, credentials reset, status deactivation/blocking, roles)
 * - permissionService (RBAC evaluation)
 */
class UsersService {
  // --- Auth Delegation ---
  login(username, password) {
    return authService.login(username, password);
  }

  validateSession(rawToken) {
    return authService.validateSession(rawToken);
  }

  logout(rawToken) {
    return authService.logout(rawToken);
  }

  changePassword(userId, currentPassword, newPassword) {
    return authService.changePassword(userId, currentPassword, newPassword);
  }

  // --- Profile Delegation ---
  getProfile(userId) {
    return profileService.getProfile(userId);
  }

  updateProfile(actorUser, targetUserId, updateData) {
    return profileService.updateProfile(actorUser, targetUserId, updateData);
  }

  // --- Management Delegation ---
  createUser(actorUser, userData) {
    return managementService.createUser(actorUser, userData);
  }

  getAllUsers() {
    return managementService.getAllUsers();
  }

  getUserById(targetId) {
    return managementService.getUserById(targetId);
  }

  updateUserRole(actorUser, targetUserId, roleId) {
    return managementService.updateUserRole(actorUser, targetUserId, roleId);
  }

  updateCredentials(actorUser, targetUserId, credentials) {
    return managementService.updateCredentials(actorUser, targetUserId, credentials);
  }

  setUserStatus(actorUser, targetUserId, status) {
    return managementService.setUserStatus(actorUser, targetUserId, status);
  }

  getRoles() {
    return managementService.getRoles();
  }

  // --- Permission Delegation ---
  can(userOrPermissions, permission) {
    return permissionService.can(userOrPermissions, permission);
  }

  canAll(userOrPermissions, permissionsList) {
    return permissionService.canAll(userOrPermissions, permissionsList);
  }

  canAny(userOrPermissions, permissionsList) {
    return permissionService.canAny(userOrPermissions, permissionsList);
  }

  isScopedToOwn(userOrPermissions, domain) {
    return permissionService.isScopedToOwn(userOrPermissions, domain);
  }
}

module.exports = new UsersService();
