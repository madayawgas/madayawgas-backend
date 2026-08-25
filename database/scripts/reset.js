const { Client } = require("pg");
const { migrate } = require("./migrate");
const { seed } = require("./seed");
const { pool } = require("../connection");

require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not defined in .env");
  process.exit(1);
}

/**
 * Terminate active connections, drop the database,
 * and create a fresh one.
 */
async function dropAndRecreateDatabase() {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.slice(1));

  url.pathname = "/postgres";

  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();

    console.log(`→ Terminating active connections to "${databaseName}"...`);
    await client.query(
      `SELECT pg_terminate_backend(pid)
       FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [databaseName]
    );

    console.log(`→ Dropping database "${databaseName}"...`);
    const safeDatabaseName = databaseName.replace(/"/g, '""');
    await client.query(`DROP DATABASE IF EXISTS "${safeDatabaseName}"`);

    console.log(`→ Creating fresh database "${databaseName}"...`);
    await client.query(`CREATE DATABASE "${safeDatabaseName}"`);

    console.log(`✓ Database "${databaseName}" recreated successfully.\n`);
  } finally {
    await client.end();
  }
}

/**
 * Orchestrate complete database reset:
 * 1. Drop & Recreate DB
 * 2. Run all migrations
 * 3. Run all seeds
 */
async function reset() {
  try {
    console.log("==========================================");
    console.log("Resetting MadayawGas Database...");
    console.log("==========================================\n");

    await dropAndRecreateDatabase();

    await migrate();

    console.log("");

    await seed();

    console.log("\n==========================================");
    console.log("✓ Database reset, migrations, and seeds completed successfully.");
    console.log("==========================================");
  } catch (error) {
    console.error("\n✗ Database reset failed:");
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  reset();
}

module.exports = {
  reset,
};
