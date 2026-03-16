import { MongoClient } from 'mongodb';

let db = null;
let client = null;

export async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
  const dbName = process.env.MONGODB_DB || 'tickethub';

  client = new MongoClient(uri);
  await client.connect();
  db = client.db(dbName);

  // Create indexes
  await db.collection('events').createIndex({ id: 1 }, { unique: true });
  await db.collection('listings').createIndex({ id: 1 }, { unique: true });
  await db.collection('listings').createIndex({ eventId: 1 });
  await db.collection('experiments').createIndex({ id: 1 }, { unique: true });
  await db.collection('experiments').createIndex({ status: 1 });
  await db.collection('config').createIndex({ key: 1 }, { unique: true });
  await db.collection('listingOverrides').createIndex({ key: 1 }, { unique: true });
  await db.collection('scenarios').createIndex({ name: 1 }, { unique: true });

  console.log(`Connected to MongoDB: ${dbName}`);
  return db;
}

export function getDB() {
  if (!db) throw new Error('Database not connected. Call connectDB() first.');
  return db;
}

export async function closeDB() {
  if (client) await client.close();
}
