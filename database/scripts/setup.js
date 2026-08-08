const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
require("dotenv").config();

const REQUIRED_POSTGRES_MAJOR = 18;

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("✗ DATABASE_URL is not defined in .env");
  process.exit(1);
}

/**
 * Find pg_dump without requiring the user to add PostgreSQL
 * to their system PATH.
 */
function findPgDump() {
  // First, try pg_dump from PATH.
  try {
    execFileSync("pg_dump", ["--version"], {
      stdio: "ignore",
    });

    return "pg_dump";
  } catch {
    // Not in PATH. Continue searching.
  }

  // Windows PostgreSQL installation directory.
  const postgresDir = "C:\\Program Files\\PostgreSQL";

  if (!fs.existsSync(postgresDir)) {
    return null;
  }

  const versions = fs
    .readdirSync(postgresDir, { withFileTypes: true })
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
 * Check whether the installed PostgreSQL version
 * matches the project's required major version.
 */
function checkPostgresVersion() {
  const pgDump = findPgDump();

  if (!pgDump) {
    console.error("✗ pg_dump could not be found.");
    console.error("Please make sure PostgreSQL 18 is installed.");
    process.exit(1);
  }

  let output;

  try {
    output = execFileSync(pgDump, ["--version"], {
      encoding: "utf8",
    }).trim();
  } catch (error) {
    console.error("✗ Failed to run pg_dump.");
    console.error(error.message);
    process.exit(1);
  }

  const match = output.match(/PostgreSQL\)?\s+(\d+)\./);

  if (!match) {
    console.error("✗ Could not determine PostgreSQL version.");
    console.error(`pg_dump returned: ${output}`);
    process.exit(1);
  }

  const majorVersion = Number(match[1]);

  console.log(`PostgreSQL version detected: ${majorVersion}.x`);

  if (majorVersion !== REQUIRED_POSTGRES_MAJOR) {
    console.error(`✗ PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is required.`);
    console.error(`You have PostgreSQL ${majorVersion}.x installed.`);
    process.exit(1);
  }

  console.log(`✓ PostgreSQL ${REQUIRED_POSTGRES_MAJOR}.x is supported.`);

  return pgDump;
}

/**
 * Create the project database if it doesn't exist.
 */
async function createDatabaseIfNotExists() {
  const url = new URL(databaseUrl);

  const databaseName = decodeURIComponent(url.pathname.slice(1));

  // Connect to the default PostgreSQL database.
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
      // Database names cannot be parameterized,
      // so we safely quote the identifier.
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

/**
 * Run all pending migrations.
 */
async function runMigrations() {
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    await client.connect();

    await client.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                id SERIAL PRIMARY KEY,
                filename TEXT UNIQUE NOT NULL,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
        `);

    const migrationsDir = path.join(__dirname, "..", "migrations");

    if (!fs.existsSync(migrationsDir)) {
      console.log("No migrations directory found.");
      return;
    }

    const files = fs
      .readdirSync(migrationsDir)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const alreadyApplied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [file],
      );

      if (alreadyApplied.rowCount > 0) {
        continue;
      }

      console.log(`Running migration: ${file}`);

      const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");

      await client.query("BEGIN");

      try {
        await client.query(sql);

        await client.query(
          "INSERT INTO schema_migrations (filename) VALUES ($1)",
          [file],
        );

        await client.query("COMMIT");

        console.log(`✓ ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }

    console.log("✓ Migrations complete.");
  } finally {
    await client.end();
  }
}

async function setup() {
  try {
    console.log("Setting up MadayawGas database...\n");

    checkPostgresVersion();

    await createDatabaseIfNotExists();

    await runMigrations();

    console.log("\n✓ Database setup complete.");
  } catch (error) {
    console.error("\n✗ Database setup failed:");
    console.error(error.message);

    process.exit(1);
  }
}

setup();
