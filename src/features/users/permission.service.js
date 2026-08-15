const usersRepository = require('./users.repository');

/**
 * Service dedicated strictly to permission evaluation and authorization logic.
 * Usable by middleware and domain services across subsystems (Sales, Fleet, Inventory, etc.).
 */
class PermissionService {
  /**
   * Fetches permission string list for a role ID.
   */
  async getPermissionsForRole(roleId) {
    if (!roleId) return [];
    return usersRepository.getPermissionsByRoleId(roleId);
  }

  /**
   * Helper to extract permission list from either a user context object or permissions array.
   */
  _extractPermissions(userOrPermissions) {
    if (!userOrPermissions) return [];
    if (Array.isArray(userOrPermissions)) return userOrPermissions;
    if (Array.isArray(userOrPermissions.permissions)) return userOrPermissions.permissions;
    return [];
  }

  /**
   * Evaluates whether a user has a specific permission string (e.g. 'sales.create').
   */
  can(userOrPermissions, permission) {
    if (!permission) return false;
    const permissions = this._extractPermissions(userOrPermissions);
    return permissions.includes(permission);
  }

  /**
   * Evaluates whether a user has ALL of the specified permissions.
   */
  canAll(userOrPermissions, permissionsList = []) {
    if (!Array.isArray(permissionsList) || permissionsList.length === 0) return false;
    return permissionsList.every((perm) => this.can(userOrPermissions, perm));
  }

  /**
   * Evaluates whether a user has AT LEAST ONE of the specified permissions.
   */
  canAny(userOrPermissions, permissionsList = []) {
    if (!Array.isArray(permissionsList) || permissionsList.length === 0) return false;
    return permissionsList.some((perm) => this.can(userOrPermissions, perm));
  }

  /**
   * Determines if a user's access for a specific domain is restricted to their own records.
   * e.g., returns true if user has 'sales.view_own' but lacks global 'sales.view' / 'sales.manage'.
   */
  isScopedToOwn(userOrPermissions, domain) {
    if (!domain) return false;
    const hasGlobal =
      this.can(userOrPermissions, `${domain}.view`) ||
      this.can(userOrPermissions, `${domain}.manage`);
    const hasOwn =
      this.can(userOrPermissions, `${domain}.view_own`) ||
      this.can(userOrPermissions, `${domain}.update_own`);

    return hasOwn && !hasGlobal;
  }
}

module.exports = new PermissionService();
