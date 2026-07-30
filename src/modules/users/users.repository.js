const db = require('../../config/database');

class UserRepository {
  async findAll() {
    const queryText = 'SELECT id, name, email, role, created_at, updated_at FROM users ORDER BY created_at DESC';
    const result = await db.query(queryText);
    return result.rows;
  }

  async findById(id) {
    const queryText = 'SELECT id, name, email, role, created_at, updated_at FROM users WHERE id = $1';
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }

  async update(id, updateFields) {
    const keys = Object.keys(updateFields);
    if (keys.length === 0) return this.findById(id);

    const setClause = keys
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const queryText = `
      UPDATE users
      SET ${setClause}, updated_at = NOW()
      WHERE id = $1
      RETURNING id, name, email, role, updated_at
    `;

    const values = [id, ...Object.values(updateFields)];
    const result = await db.query(queryText, values);
    return result.rows[0] || null;
  }

  async delete(id) {
    const queryText = 'DELETE FROM users WHERE id = $1 RETURNING id, name, email';
    const result = await db.query(queryText, [id]);
    return result.rows[0] || null;
  }
}

module.exports = new UserRepository();
