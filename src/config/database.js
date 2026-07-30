const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'madayawgas_db',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

const pool = new Pool(poolConfig);

// Log pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

/**
 * Execute SQL query helper function
 * @param {string} text - SQL Query String
 * @param {Array} params - Parameters array
 */
const query = (text, params) => pool.query(text, params);

/**
 * Test database connectivity
 */
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT NOW()');
    client.release();
    console.log(`[Database] PostgreSQL connected successfully at ${res.rows[0].now}`);
    return true;
  } catch (err) {
    console.error('[Database] Connection failed:', err.message);
    console.warn('[Database] Running without active DB connection. Ensure PostgreSQL is configured in .env');
    return false;
  }
};

module.exports = {
  pool,
  query,
  testConnection,
};
