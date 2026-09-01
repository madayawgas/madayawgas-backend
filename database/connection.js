const { Pool } = require("pg");
require("dotenv").config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    // PostgreSQL providers such as Supabase may require SSL in production
    ssl:
        process.env.NODE_ENV === "production"
            ? { rejectUnauthorized: false }
            : false,

    max: 50,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
});

// Handle unexpected errors from idle clients
pool.on("error", (error) => {
    console.error(
        "Unexpected PostgreSQL pool error:",
        error
    );
});

// Execute a query
const query = (text, params) => {
    return pool.query(text, params);
};

// Test database connectivity
const testConnection = async () => {
    try {
        const result = await pool.query("SELECT NOW()");

        console.log(
            `✅ PostgreSQL connected successfully at ${result.rows[0].now}`
        );

        return true;
    } catch (error) {
        console.error(
            "❌ PostgreSQL connection failed:",
            error.message
        );

        throw error;
    }
};

module.exports = {
    pool,
    query,
    testConnection,
};
