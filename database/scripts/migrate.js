const fs = require("fs");
const path = require("path");
const { pool } = require("../connection");

require("dotenv").config();

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

/**
 * Ensure the migration tracking table exists.
 */
async function ensureMigrationTable(client) {
  await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id SERIAL PRIMARY KEY,
            filename TEXT NOT NULL UNIQUE,
            applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

/**
 * Get all SQL migration files.
 */
function getMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(`Migration directory not found: ${MIGRATIONS_DIR}`);
  }

  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

/**
 * Get filenames of migrations already applied.
 */
async function getAppliedMigrations(client) {
  const result = await client.query(`
        SELECT filename
        FROM schema_migrations
    `);

  return new Set(result.rows.map((row) => row.filename));
}

/**
 * Apply a single migration using a transaction.
 */
async function applyMigration(client, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);

  const sql = fs.readFileSync(filePath, "utf8");

  console.log(`→ Applying ${filename}`);

  await client.query("BEGIN");

  try {
    await client.query(sql);

    await client.query(
      `
            INSERT INTO schema_migrations (filename)
            VALUES ($1)
            `,
      [filename],
    );

    await client.query("COMMIT");

    console.log(`✓ Applied ${filename}`);
  } catch (error) {
    await client.query("ROLLBACK");

    throw new Error(`Migration failed: ${filename}\n${error.message}`);
  }
}

/**
 * Run all pending migrations.
 */
async function migrate() {
  const client = await pool.connect();

  try {
    console.log("Running database migrations...\n");

    await ensureMigrationTable(client);

    const migrationFiles = getMigrationFiles();
    const appliedMigrations = await getAppliedMigrations(client);

    const pendingMigrations = migrationFiles.filter(
      (file) => !appliedMigrations.has(file),
    );

    if (pendingMigrations.length === 0) {
      console.log("✓ Database is already up to date.");
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s).\n`);

    for (const filename of pendingMigrations) {
      await applyMigration(client, filename);
    }

    console.log("\n✓ Database migration completed.");
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await migrate();
  } catch (error) {
    console.error("\n✗ Migration failed.");
    console.error(error.message);

    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

module.exports = {
  migrate,
};

if (require.main === module) {
  main();
}
