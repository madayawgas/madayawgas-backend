const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { migrate } = require("./migrate");
const { pool } = require("../connection");

require("dotenv").config();

const REQUIRED_POSTGRES_MAJOR = 18;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not defined in .env");
  process.exit(1);
}

/**
 * Find pg_dump without requiring the user
 * to add PostgreSQL to PATH.
 */
function findPgDump() {
  try {
    execFileSync("pg_dump", ["--version"], {
      stdio: "ignore",
    });

    return "pg_dump";
  } catch {
    // Continue searching.
  }

  const postgresDir = "C:\\Program Files\\PostgreSQL";

  if (!fs.existsSync(postgresDir)) {
    return null;
  }

  const versions = fs
    .readdirSync(postgresDir, {
      withFileTypes: true,
    })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => /^\d+$/.test(name))
    .sort((a, b) => Number(b) - Number(a));

  for (const version of versions) {
    const pgDumpPath = path.join(postgresDir, version, "bin", "pg_dump.exe");

    if (fs.existsSync(pgDumpPath)) {
      return pgDumpPath;
    }
  }

  return null;
}

/**
 * Check PostgreSQL version.
 */
function checkPostgresVersion() {
  const pgDump = findPgDump();

  if (!pgDump) {
    throw new Error(
      "pg_dump could not be found. Please make sure PostgreSQL 18 is installed.",
    );
  }

  const output = execFileSync(pgDump, ["--version"], {
    encoding: "utf8",
  }).trim();

  const match = output.match(/(\d+)\.(\d+)(?:\.\d+)?/);

  if (!match) {
    throw new Error(
      `Could not determine PostgreSQL version.\npg_dump returned: ${output}`,
    );
  }

  const majorVersion = Number(match[1]);

  console.log(`PostgreSQL version detected: ${majorVersion}.x`);

  if (majorVersion !== REQUIRED_POSTGRES_MAJOR) {
    throw new Error(
      `PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is required. You have PostgreSQL ${majorVersion}.x installed.`,
    );
  }

  console.log(`✓ PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is supported.`);
}

/**
 * Create the project database if it doesn't exist.
 */
async function createDatabaseIfNotExists() {
  const url = new URL(databaseUrl);

  const databaseName = decodeURIComponent(url.pathname.slice(1));

  url.pathname = "/postgres";

  const client = new Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();

    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [databaseName],
    );

    if (result.rowCount === 0) {
      const safeDatabaseName = databaseName.replace(/"/g, '""');

      await client.query(`CREATE DATABASE "${safeDatabaseName}"`);

      console.log(`✓ Database "${databaseName}" created.`);
    } else {
      console.log(`✓ Database "${databaseName}" already exists.`);
    }
  } finally {
    await client.end();
  }
}

async function setup() {
  try {
    console.log("Setting up MadayawGas database...\n");

    checkPostgresVersion();

    await createDatabaseIfNotExists();

    await migrate();

    console.log("\n✓ Database setup complete.");
  } catch (error) {
    console.error("\n✗ Database setup failed:");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

setup();
