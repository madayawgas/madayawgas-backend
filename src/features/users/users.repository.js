const { query } = require('../../../database/connection');

/**
 * Repository layer for user, role, permission, audit, and session database operations.
 * Handles SQL queries using parameterized statements only.
 * Free of business logic.
 */
class UsersRepository {
  async findUserByUsername(username) {
    const res = await query(
      `SELECT u.id, u.username, u.password_hash, u.first_name, u.last_name, u.phone, u.birthdate, u.role_id,
              u.is_active, u.is_blocked, u.must_change_password, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1`,
      [username]
    );
    return res.rows[0] || null;
  }

  async findUsernamesLike(basePattern) {
    const res = await query(
      `SELECT username FROM users WHERE username LIKE $1`,
      [basePattern]
    );
    return res.rows.map((r) => r.username);
  }

  async findUserById(id) {
    const res = await query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.phone, u.birthdate, u.role_id,
              u.is_active, u.is_blocked, u.must_change_password, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findUserWithPasswordById(id) {
    const res = await query(
      `SELECT u.id, u.username, u.password_hash, u.first_name, u.last_name, u.phone, u.birthdate, u.role_id,
              u.is_active, u.is_blocked, u.must_change_password, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findAllUsers() {
    const res = await query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.phone, u.birthdate, u.role_id,
              u.is_active, u.is_blocked, u.must_change_password, u.created_at, r.name as role_name,
              COALESCE(
                JSON_AGG(
                  JSON_BUILD_OBJECT('id', r2.id, 'name', r2.name, 'isPrimary', ur.is_primary)
                  ORDER BY ur.is_primary DESC, r2.name ASC
                ) FILTER (WHERE r2.id IS NOT NULL),
                '[]'::json
              ) as roles
       FROM users u
       JOIN roles r ON u.role_id = r.id
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       LEFT JOIN roles r2 ON ur.role_id = r2.id
       GROUP BY u.id, r.name
       ORDER BY u.created_at DESC`
    );
    return res.rows;
  }

  async getUserRoles(userId) {
    const res = await query(
      `SELECT r.id, r.name, r.description, ur.is_primary, ur.assigned_at
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1
       ORDER BY ur.is_primary DESC, r.name ASC`,
      [userId]
    );
    if (res.rows.length > 0) {
      return res.rows;
    }

    // Resilient fallback for direct raw database inserts
    const fallback = await query(
      `SELECT r.id, r.name, r.description, TRUE as is_primary, NOW() as assigned_at
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
    return fallback.rows;
  }

  async setUserRoles(userId, roleIds = [], primaryRoleId = null) {
    if (!Array.isArray(roleIds) || roleIds.length === 0) {
      return this.getUserRoles(userId);
    }

    const primary = primaryRoleId && roleIds.includes(primaryRoleId) ? primaryRoleId : roleIds[0];

    // Delete existing roles
    await query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);

    // Insert new roles
    for (const rid of roleIds) {
      const isPrimary = rid === primary;
      await query(
        `INSERT INTO user_roles (user_id, role_id, is_primary)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
        [userId, rid, isPrimary]
      );
    }

    // Update users.role_id to primary role
    await query(`UPDATE users SET role_id = $1 WHERE id = $2`, [primary, userId]);

    return this.getUserRoles(userId);
  }

  async getPermissionsByUserId(userId) {
    const res = await query(
      `SELECT DISTINCT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id IN (
         SELECT role_id FROM user_roles WHERE user_id = $1
         UNION
         SELECT role_id FROM users WHERE id = $1
       )`,
      [userId]
    );
    return res.rows.map((row) => row.name);
  }

  async createUser({ username, passwordHash, firstName, lastName, phone = null, birthdate = null, roleId, roleIds = [], primaryRoleId = null, mustChangePassword = true }) {
    const effectiveRoleIds = Array.isArray(roleIds) && roleIds.length > 0 ? roleIds : [roleId].filter(Boolean);
    const primaryId = (primaryRoleId && effectiveRoleIds.includes(primaryRoleId))
      ? primaryRoleId
      : (roleId || effectiveRoleIds[0]);

    const res = await query(
      `INSERT INTO users (username, password_hash, first_name, last_name, phone, birthdate, role_id, is_active, is_blocked, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, FALSE, $8)
       RETURNING id, username, first_name, last_name, phone, birthdate, role_id, is_active, is_blocked, must_change_password, created_at`,
      [username, passwordHash, firstName, lastName, phone, birthdate, primaryId, mustChangePassword]
    );
    const createdUser = res.rows[0];

    // Populate user_roles
    for (const rid of effectiveRoleIds) {
      if (rid) {
        await query(
          `INSERT INTO user_roles (user_id, role_id, is_primary)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = EXCLUDED.is_primary`,
          [createdUser.id, rid, rid === primaryId]
        );
      }
    }

    return createdUser;
  }

  async updateUserProfile(id, { firstName, lastName, phone, birthdate, roleId }) {
    const updates = [];
    const values = [];
    let idx = 1;

    if (firstName !== undefined) {
      updates.push(`first_name = $${idx++}`);
      values.push(firstName);
    }
    if (lastName !== undefined) {
      updates.push(`last_name = $${idx++}`);
      values.push(lastName);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (birthdate !== undefined) {
      updates.push(`birthdate = $${idx++}`);
      values.push(birthdate);
    }
    if (roleId !== undefined) {
      updates.push(`role_id = $${idx++}`);
      values.push(roleId);
    }

    if (updates.length === 0) {
      return this.findUserById(id);
    }

    values.push(id);
    await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${idx}`,
      values
    );

    return this.findUserById(id);
  }

  async updateUserCredentials(id, { username, passwordHash, mustChangePassword }) {
    const updates = [];
    const values = [];
    let idx = 1;

    if (username !== undefined) {
      updates.push(`username = $${idx++}`);
      values.push(username);
    }
    if (passwordHash !== undefined) {
      updates.push(`password_hash = $${idx++}`);
      values.push(passwordHash);
    }
    if (mustChangePassword !== undefined) {
      updates.push(`must_change_password = $${idx++}`);
      values.push(mustChangePassword);
    }

    if (updates.length === 0) {
      return this.findUserById(id);
    }

    values.push(id);
    await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${idx}`,
      values
    );

    return this.findUserById(id);
  }

  async updateUserStatus(id, { isActive, isBlocked }) {
    const updates = [];
    const values = [];
    let idx = 1;

    if (isActive !== undefined) {
      updates.push(`is_active = $${idx++}`);
      values.push(isActive);
    }
    if (isBlocked !== undefined) {
      updates.push(`is_blocked = $${idx++}`);
      values.push(isBlocked);
    }

    if (updates.length === 0) {
      return this.findUserById(id);
    }

    values.push(id);
    await query(
      `UPDATE users
       SET ${updates.join(', ')}
       WHERE id = $${idx}`,
      values
    );

    return this.findUserById(id);
  }

  async findRoles() {
    const res = await query(`SELECT id, name, description FROM roles ORDER BY name ASC`);
    return res.rows;
  }

  async getAllRolesWithDetails() {
    const sql = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COUNT(DISTINCT ur.user_id)::int AS user_count,
        COALESCE(
          ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
          '{}'
        ) AS permissions
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      GROUP BY r.id, r.name, r.description, r.created_at
      ORDER BY r.name ASC
    `;
    const res = await query(sql);
    return res.rows;
  }

  async getRoleByIdWithDetails(roleId) {
    const sql = `
      SELECT 
        r.id,
        r.name,
        r.description,
        r.created_at,
        COUNT(DISTINCT ur.user_id)::int AS user_count,
        COALESCE(
          ARRAY_AGG(DISTINCT p.name) FILTER (WHERE p.name IS NOT NULL),
          '{}'
        ) AS permissions
      FROM roles r
      LEFT JOIN user_roles ur ON ur.role_id = r.id
      LEFT JOIN role_permissions rp ON rp.role_id = r.id
      LEFT JOIN permissions p ON rp.permission_id = p.id
      WHERE r.id = $1
      GROUP BY r.id, r.name, r.description, r.created_at
    `;
    const res = await query(sql, [roleId]);
    return res.rows[0] || null;
  }

  async findRoleById(roleId) {
    const res = await query(`SELECT id, name, description FROM roles WHERE id = $1`, [roleId]);
    return res.rows[0] || null;
  }

  async findRoleByName(roleName) {
    const res = await query(`SELECT id, name, description FROM roles WHERE LOWER(name) = LOWER($1)`, [roleName]);
    return res.rows[0] || null;
  }

  async getAllPermissions() {
    const res = await query(`SELECT id, name, description FROM permissions ORDER BY name ASC`);
    return res.rows;
  }

  async createRole({ name, description = null }) {
    const res = await query(
      `INSERT INTO roles (name, description)
       VALUES ($1, $2)
       RETURNING id, name, description, created_at`,
      [name, description]
    );
    return res.rows[0];
  }

  async updateRole(roleId, { name, description }) {
    const updates = [];
    const values = [];
    let idx = 1;

    if (name !== undefined) {
      updates.push(`name = $${idx++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`);
      values.push(description);
    }

    if (updates.length === 0) {
      return this.findRoleById(roleId);
    }

    values.push(roleId);
    const sql = `
      UPDATE roles
      SET ${updates.join(', ')}
      WHERE id = $${idx}
      RETURNING id, name, description, created_at
    `;
    const res = await query(sql, values);
    return res.rows[0] || null;
  }

  async setRolePermissions(roleId, permissionNames = []) {
    await query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);

    if (permissionNames && permissionNames.length > 0) {
      await query(
        `INSERT INTO role_permissions (role_id, permission_id)
         SELECT $1, p.id
         FROM permissions p
         WHERE p.name = ANY($2::text[])`,
        [roleId, permissionNames]
      );
    }

    return this.getPermissionsByRoleId(roleId);
  }

  async countUsersByRoleId(roleId) {
    const res = await query(
      `SELECT COUNT(DISTINCT user_id)::int AS count
       FROM user_roles
       WHERE role_id = $1`,
      [roleId]
    );
    return res.rows[0]?.count || 0;
  }

  async deleteRole(roleId) {
    await query(`DELETE FROM role_permissions WHERE role_id = $1`, [roleId]);
    const res = await query(`DELETE FROM roles WHERE id = $1 RETURNING id, name`, [roleId]);
    return res.rows[0] || null;
  }

  async revokeAllSessionsByRoleId(roleId) {
    await query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE user_id IN (SELECT user_id FROM user_roles WHERE role_id = $1)
         AND revoked_at IS NULL`,
      [roleId]
    );
  }

  async getPermissionsByRoleId(roleId) {
    const res = await query(
      `SELECT p.name
       FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       WHERE rp.role_id = $1`,
      [roleId]
    );
    return res.rows.map((row) => row.name);
  }

  async createAuditLog({ userId, targetUserId = null, action, description = null }) {
    const res = await query(
      `INSERT INTO audit_logs (user_id, target_user_id, action, description)
       VALUES ($1, $2, $3, $4)
       RETURNING id, user_id, target_user_id, action, description, created_at`,
      [userId, targetUserId, action, description]
    );
    return res.rows[0];
  }

  async createSession({ userId, tokenHash, expiresAt }) {
    const res = await query(
      `INSERT INTO sessions (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)
       RETURNING id, user_id, token_hash, created_at, expires_at, revoked_at`,
      [userId, tokenHash, expiresAt]
    );
    return res.rows[0];
  }

  async findSessionByTokenHash(tokenHash) {
    const res = await query(
      `SELECT s.id as session_id, s.user_id, s.token_hash, s.created_at, s.expires_at, s.revoked_at,
              u.username, u.first_name, u.last_name, u.phone, u.birthdate, u.role_id, u.is_active, u.is_blocked,
              u.must_change_password, r.name as role_name
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       JOIN roles r ON u.role_id = r.id
       WHERE s.token_hash = $1`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async updateSessionExpiration(sessionId, newExpiresAt) {
    const res = await query(
      `UPDATE sessions
       SET expires_at = $1
       WHERE id = $2
       RETURNING id, expires_at`,
      [newExpiresAt, sessionId]
    );
    return res.rows[0] || null;
  }

  async revokeSession(sessionId) {
    const res = await query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE id = $1
       RETURNING id, revoked_at`,
      [sessionId]
    );
    return res.rows[0] || null;
  }

  async revokeSessionByTokenHash(tokenHash) {
    const res = await query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id, revoked_at`,
      [tokenHash]
    );
    return res.rows[0] || null;
  }

  async revokeAllUserSessions(userId) {
    await query(
      `UPDATE sessions
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  }

  async updatePasswordHash(userId, passwordHash, mustChangePassword = false) {
    await query(
      `UPDATE users
       SET password_hash = $1, must_change_password = $2
       WHERE id = $3`,
      [passwordHash, mustChangePassword, userId]
    );
  }
}

module.exports = new UsersRepository();
