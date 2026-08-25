const fs = require('fs');
const path = require('path');
const { pool } = require('../connection');

require('dotenv').config();

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');

async function seed() {
  const client = await pool.connect();

  try {
    console.log('Seeding database...\n');

    const seedFiles = fs
      .readdirSync(SEEDS_DIR)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const filename of seedFiles) {
      const filePath = path.join(SEEDS_DIR, filename);
      const sql = fs.readFileSync(filePath, 'utf8');
      console.log(`→ Executing seed: ${filename}`);
      await client.query(sql);
      console.log(`✓ Seed applied: ${filename}`);
    }

    console.log('\n✓ Database seeding completed successfully.');
  } catch (error) {
    console.error('\n✗ Database seeding failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seed();
}

module.exports = { seed };
