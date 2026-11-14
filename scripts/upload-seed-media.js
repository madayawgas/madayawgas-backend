require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const TEMP_SEED_MEDIA_DIR = path.resolve(__dirname, '..', 'docs', 'temp', 'temp_seed_receipts');
const UPLOADS_SEED_MEDIA_DIR = path.resolve(__dirname, '..', 'uploads', 'seed');
const SEED_MEDIA_DIR = fs.existsSync(TEMP_SEED_MEDIA_DIR) ? TEMP_SEED_MEDIA_DIR : UPLOADS_SEED_MEDIA_DIR;

const MIME_BY_EXT = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function uploadSeedMedia() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_MEDIA_BUCKET || 'madayawgas-media';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment (.env).'
    );
  }

  if (!fs.existsSync(SEED_MEDIA_DIR)) {
    throw new Error(`Seed media directory not found: ${SEED_MEDIA_DIR}`);
  }

  const files = fs
    .readdirSync(SEED_MEDIA_DIR)
    .filter((f) => Object.prototype.hasOwnProperty.call(MIME_BY_EXT, path.extname(f).toLowerCase()))
    .sort();

  if (files.length === 0) {
    console.log('No image files found in uploads/seed/.');
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Uploading ${files.length} seed media files to Supabase bucket '${bucket}'...\n`);

  for (const filename of files) {
    const ext = path.extname(filename).toLowerCase();
    const mimeType = MIME_BY_EXT[ext];
    const storageKey = `seed/${filename}`;
    const fileBuffer = fs.readFileSync(path.join(SEED_MEDIA_DIR, filename));

    const { error } = await supabase.storage
      .from(bucket)
      .upload(storageKey, fileBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (error) {
      throw new Error(`Failed to upload ${storageKey}: ${error.message}`);
    }

    console.log(`✓ Uploaded ${storageKey} (${mimeType})`);
  }

  console.log('\n✓ All seed media files uploaded successfully.');
}

uploadSeedMedia().catch((err) => {
  console.error('\n✗ Seed media upload failed:', err.message);
  process.exitCode = 1;
});
