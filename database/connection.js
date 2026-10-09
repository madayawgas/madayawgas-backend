const { Pool } = require("pg");
require("dotenv").config();
const {
  isProduction,
  isTest,
  getDatabaseUrl,
  getDatabaseUrlSource,
  maskDatabaseUrl,
  shouldEnableSsl,
} = require("../src/config/env");

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

// Retrieve structured connection diagnostic details
const getConnectionInfo = () => {
    let targetHost = "PostgreSQL";
    let targetDatabase = "unknown";
    try {
        const parsed = new URL(connectionString);
        targetHost = `${parsed.hostname}:${parsed.port || 5432}`;
        targetDatabase = parsed.pathname.replace(/^\/+/, '') || 'postgres';
    } catch {
        // fallback if URL parsing fails
    }

    const mode = isProduction
        ? "Production (Supabase)"
        : (isTest ? "Test Environment" : "Local Development");

    const sourceEnv = getDatabaseUrlSource();
    const maskedUrl = maskDatabaseUrl(connectionString);

    return {
        mode,
        sourceEnv,
        targetHost,
        targetDatabase,
        maskedUrl,
        requiresSsl,
        isProduction,
        isTest,
        connectionString,
    };
};

// Test database connectivity
const testConnection = async () => {
    try {
        const result = await pool.query(
            "SELECT NOW() as now, current_database() as db_name, current_user as db_user"
        );
        const { now, db_name, db_user } = result.rows[0];
        const info = getConnectionInfo();

        console.log("==================================================");
        console.log(`✅ PostgreSQL Connected [${info.mode}]`);
        console.log(`   Database : ${db_name} (User: ${db_user})`);
        console.log(`   Host     : ${info.targetHost}`);
        console.log(`   Source   : ${info.sourceEnv}`);
        console.log(`   Target   : ${info.maskedUrl}`);
        console.log(`   SSL      : ${info.requiresSsl ? 'Enabled' : 'Disabled'}`);
        console.log(`   Time     : ${now}`);
        console.log("==================================================");

        return true;
    } catch (error) {
        console.error("==================================================");
        console.error("❌ PostgreSQL connection failed:");
        console.error(`   Error    : ${error.message}`);
        console.error("==================================================");

        throw error;
    }
};

module.exports = {
    pool,
    query,
    testConnection,
    isProduction,
    getDatabaseUrl,
    getConnectionInfo,
    maskDatabaseUrl,
};

