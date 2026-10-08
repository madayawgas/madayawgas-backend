const { Pool } = require("pg");
require("dotenv").config();
const { isProduction, isTest, getDatabaseUrl, shouldEnableSsl } = require("../src/config/env");

const connectionString = getDatabaseUrl();
const requiresSsl = shouldEnableSsl(connectionString, isProduction);

const pool = new Pool({
    connectionString,

    // Supabase and remote PostgreSQL cloud providers require SSL in production
    ssl: requiresSsl ? { rejectUnauthorized: false } : false,

    // Sized for direct / pooler connections (customizable via DB_POOL_MAX)
    max: process.env.DB_POOL_MAX ? parseInt(process.env.DB_POOL_MAX, 10) : (isProduction ? 20 : 50),
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

        let targetHost = "PostgreSQL";
        try {
            const parsed = new URL(connectionString);
            targetHost = `${parsed.hostname}:${parsed.port || 5432}${parsed.pathname}`;
        } catch {
            // fallback if URL parsing fails
        }

        const mode = isProduction
            ? "Production (Supabase)"
            : (isTest ? "Test Environment" : "Local Development");

        console.log(
            `✅ PostgreSQL connected successfully [${mode} -> ${targetHost}] at ${result.rows[0].now}`
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
    isProduction,
    getDatabaseUrl,
};

