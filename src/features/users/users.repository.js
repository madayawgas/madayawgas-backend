const { query } = require('../../../database/connection');

/**
 * Repository layer for user and session database operations.
 * Handles SQL queries using parameterized statements only.
 * Free of business logic.
 */
class UsersRepository {
  async findUserByUsername(username) {
    const res = await query(
      `SELECT u.id, u.username, u.password_hash, u.first_name, u.last_name, u.birthdate, u.role_id, u.is_active, u.is_blocked, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.username = $1`,
      [username]
    );
    return res.rows[0] || null;
  }

  async findUserById(id) {
    const res = await query(
      `SELECT u.id, u.username, u.first_name, u.last_name, u.birthdate, u.role_id, u.is_active, u.is_blocked, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    return res.rows[0] || null;
  }

  async findUserWithPasswordById(id) {
    const res = await query(
      `SELECT u.id, u.username, u.password_hash, u.first_name, u.last_name, u.birthdate, u.role_id, u.is_active, u.is_blocked, u.created_at, r.name as role_name
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [id]
    );
    return res.rows[0] || null;
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
              u.username, u.first_name, u.last_name, u.birthdate, u.role_id, u.is_active, u.is_blocked, r.name as role_name
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

  async updatePasswordHash(userId, passwordHash) {
    await query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2`,
      [passwordHash, userId]
    );
  }
}

module.exports = new UsersRepository();
