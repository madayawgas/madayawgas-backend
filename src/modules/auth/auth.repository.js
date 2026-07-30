const db = require('../../config/database');

class AuthRepository {
  async findByEmail(email) {
    const queryText = 'SELECT * FROM users WHERE email = $1';
    const result = await db.query(queryText, [email]);
    return result.rows[0] || null;
  }

  async createUser({ name, email, passwordHash, role }) {
    const queryText = `
      INSERT INTO users (name, email, password, role, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id, name, email, role, created_at
    `;
    const result = await db.query(queryText, [name, email, passwordHash, role]);
    return result.rows[0];
  }
}

module.exports = new AuthRepository();
