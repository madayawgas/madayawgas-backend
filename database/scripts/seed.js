const fs = require('fs');
const path = require('path');
const { pool } = require('../connection');

require('dotenv').config();

const SEEDS_DIR = path.join(__dirname, '..', 'seeds');
const SOURCE_SEED_MEDIA_DIR = path.resolve(__dirname, '..', '..', 'docs', 'temp', 'temp_seed_receipts');

function syncSeedMedia() {
  if (!fs.existsSync(SOURCE_SEED_MEDIA_DIR)) {
    return;
  }

  const localRoot = path.resolve(process.env.LOCAL_MEDIA_PATH || './uploads');
  const targetDir = path.join(localRoot, 'seed');
  fs.mkdirSync(targetDir, { recursive: true });

  const files = fs
    .readdirSync(SOURCE_SEED_MEDIA_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f));

  for (const file of files) {
    fs.copyFileSync(
      path.join(SOURCE_SEED_MEDIA_DIR, file),
      path.join(targetDir, file)
    );
  }

  console.log(`\n✓ Synced ${files.length} seed media file(s) to ${targetDir}`);
}

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

    syncSeedMedia();
    console.log('\n✓ Database seeding completed successfully.');
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await seed();
  } catch (error) {
    console.error('\n✗ Database seeding failed:');
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main();
}

module.exports = { seed };
