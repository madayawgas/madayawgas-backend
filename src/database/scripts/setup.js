const { Client } = require("pg");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("DATABASE_URL is not defined in .env");
  process.exit(1);
}

async function createDatabaseIfNotExists() {
  const url = new URL(databaseUrl);

  const databaseName = url.pathname.slice(1);

  // Connect to PostgreSQL's default database instead of the project database.
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
      await client.query(`CREATE DATABASE "${databaseName}"`);
      console.log(`✓ Database "${databaseName}" created.`);
    } else {
      console.log(`✓ Database "${databaseName}" already exists.`);
    }
  } finally {
    await client.end();
  }
}

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

    console.log("✓ Database setup complete.");
  } finally {
    await client.end();
  }
}

async function setup() {
  try {
    console.log("Setting up database...\n");

    await createDatabaseIfNotExists();
    await runMigrations();

    console.log("\n✓ Setup finished successfully.");
  } catch (error) {
    console.error("\n✗ Database setup failed:");
    console.error(error.message);
    process.exit(1);
  }
}

setup();
