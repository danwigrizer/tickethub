import { connectDB, getDB, closeDB } from './db.js';
import { DEFAULT_CONFIG, EVENT_DEFINITIONS, generateEvents, generateAllListings } from './data/generators.js';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const force = process.argv.includes('--force');
const eventsOnly = process.argv.includes('--events-only');

async function seed() {
  console.log('Connecting to MongoDB...');
  await connectDB();
  const db = getDB();

  // Check if data already exists
  const eventCount = await db.collection('events').countDocuments();
  if (eventCount > 0 && !force) {
    console.log(`Database already has ${eventCount} events. Use --force to re-seed.`);
    await closeDB();
    return;
  }

  if (force) {
    console.log('Force mode: dropping existing data...');
    await db.collection('events').deleteMany({});
    await db.collection('listings').deleteMany({});
    if (!eventsOnly) {
      await db.collection('config').deleteMany({});
      await db.collection('scenarios').deleteMany({});
      await db.collection('experiments').deleteMany({});
      await db.collection('listingOverrides').deleteMany({});
    }
  }

  // Seed events
  console.log('Generating events...');
  const events = generateEvents();
  await db.collection('events').insertMany(events);
  console.log(`  Inserted ${events.length} events`);

  // Seed listings
  console.log('Generating listings...');
  const listings = generateAllListings();
  await db.collection('listings').insertMany(listings);
  console.log(`  Inserted ${listings.length} listings`);

  if (!eventsOnly) {
    // Seed default config
    console.log('Seeding default config...');
    await db.collection('config').updateOne(
      { key: 'active' },
      { $set: { key: 'active', ...DEFAULT_CONFIG, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );

    // Seed scenarios from JSON files (check both local and parent paths)
    let scenariosDir = join(__dirname, 'config/scenarios');
    if (!existsSync(scenariosDir)) {
      scenariosDir = join(__dirname, '../config/scenarios');
    }
    if (existsSync(scenariosDir)) {
      const files = readdirSync(scenariosDir).filter(f => f.endsWith('.json'));
      console.log(`Seeding ${files.length} scenarios...`);
      for (const file of files) {
        const content = JSON.parse(readFileSync(join(scenariosDir, file), 'utf8'));
        await db.collection('scenarios').updateOne(
          { name: content.name },
          { $set: content },
          { upsert: true }
        );
      }
    }

    // Seed empty listing overrides
    await db.collection('listingOverrides').updateOne(
      { key: 'global' },
      { $set: { key: 'global', overrides: {}, updatedAt: new Date().toISOString() } },
      { upsert: true }
    );
  }

  console.log('Seed complete!');
  await closeDB();
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
