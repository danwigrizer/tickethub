import { Router } from 'express';
import { getDB } from './db.js';

const router = Router();

const OVERRIDEABLE_FIELDS = new Set([
  'pricePerTicket', 'fees', 'serviceFee', 'fulfillmentFee', 'platformFee',
  'quantity', 'sellerName', 'sellerRating', 'sellerVerified',
  'sellerTransactionCount', 'demandLevel', 'viewCount', 'viewsLast24h',
  'soldCount', 'soldRecently', 'priceTrend', 'deliveryMethod',
  'transferMethod', 'refundPolicy', 'notes'
]);

function sanitizeOverrides(fields) {
  const clean = {};
  for (const [key, value] of Object.entries(fields)) {
    if (OVERRIDEABLE_FIELDS.has(key)) {
      clean[key] = value;
    }
  }
  return clean;
}

// ========== DB Access with TTL Cache ==========

let cachedOverrides = null;
let cacheTime = 0;
const CACHE_TTL = 5000;

export async function getGlobalListingOverrides() {
  if (cachedOverrides && Date.now() - cacheTime < CACHE_TTL) {
    return cachedOverrides;
  }
  try {
    const db = getDB();
    const doc = await db.collection('listingOverrides').findOne({ key: 'global' });
    cachedOverrides = doc?.overrides || {};
  } catch (error) {
    console.error('Error loading listing overrides from DB:', error);
    cachedOverrides = cachedOverrides || {};
  }
  cacheTime = Date.now();
  return cachedOverrides;
}

async function saveOverrides(overrides) {
  const db = getDB();
  await db.collection('listingOverrides').updateOne(
    { key: 'global' },
    { $set: { key: 'global', overrides, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  cachedOverrides = overrides;
  cacheTime = Date.now();
}

// ========== Public API ==========

export function applyListingOverrides(listing, listingOverrides) {
  const fo = listingOverrides[listing.id] || listingOverrides[String(listing.id)];
  if (!fo || Object.keys(fo).length === 0) return listing;
  return { ...listing, ...fo };
}

// ========== Routes ==========

// Get all overrides
router.get('/api/listing-overrides', async (req, res) => {
  const overrides = await getGlobalListingOverrides();
  res.json(overrides);
});

// Set/merge overrides for a listing
router.put('/api/listing-overrides/:id', async (req, res) => {
  const listingId = parseInt(req.params.id);

  // Validate listing exists
  const db = getDB();
  const listing = await db.collection('listings').findOne({ id: listingId });
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const clean = sanitizeOverrides(req.body);
  if (Object.keys(clean).length === 0) {
    return res.status(400).json({ error: 'No valid override fields provided', allowedFields: [...OVERRIDEABLE_FIELDS] });
  }

  const overrides = await getGlobalListingOverrides();
  overrides[listingId] = { ...(overrides[listingId] || {}), ...clean };
  await saveOverrides(overrides);
  res.json({ listingId, overrides: overrides[listingId] });
});

// Delete overrides for a listing
router.delete('/api/listing-overrides/:id', async (req, res) => {
  const listingId = req.params.id;
  const overrides = await getGlobalListingOverrides();
  delete overrides[listingId];
  await saveOverrides(overrides);
  res.json({ success: true });
});

// Clear all overrides
router.delete('/api/listing-overrides', async (req, res) => {
  await saveOverrides({});
  res.json({ success: true });
});

// Get allowed override fields
router.get('/api/listing-overrides/fields', (req, res) => {
  res.json([...OVERRIDEABLE_FIELDS]);
});

// ========== Init ==========

export function initListingOverrides() {
  // No-op — DB connection is already established
}

export default router;
