import { Router } from 'express';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const router = Router();

// In-memory store: { [listingId]: { pricePerTicket, fees, ... } }
let overrides = {};
let overridesFile = null;
let mockListings = null;

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

// ========== Persistence ==========

function loadOverrides() {
  if (existsSync(overridesFile)) {
    try {
      overrides = JSON.parse(readFileSync(overridesFile, 'utf8'));
    } catch (error) {
      console.error('Error loading listing overrides:', error);
      overrides = {};
    }
  }
}

let persistTimer = null;
function persistOverrides() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      writeFileSync(overridesFile, JSON.stringify(overrides, null, 2));
    } catch (error) {
      console.error('Error persisting listing overrides:', error);
    }
  }, 2000);
}

// ========== Public API ==========

export function getGlobalListingOverrides() {
  return overrides;
}

export function applyListingOverrides(listing, listingOverrides) {
  const fo = listingOverrides[listing.id] || listingOverrides[String(listing.id)];
  if (!fo || Object.keys(fo).length === 0) return listing;
  return { ...listing, ...fo };
}

// ========== Routes ==========

// Get all overrides
router.get('/api/listing-overrides', (req, res) => {
  res.json(overrides);
});

// Set/merge overrides for a listing
router.put('/api/listing-overrides/:id', (req, res) => {
  const listingId = parseInt(req.params.id);
  if (mockListings && !mockListings.find(l => l.id === listingId)) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  const clean = sanitizeOverrides(req.body);
  if (Object.keys(clean).length === 0) {
    return res.status(400).json({ error: 'No valid override fields provided', allowedFields: [...OVERRIDEABLE_FIELDS] });
  }

  overrides[listingId] = { ...(overrides[listingId] || {}), ...clean };
  persistOverrides();
  res.json({ listingId, overrides: overrides[listingId] });
});

// Delete overrides for a listing
router.delete('/api/listing-overrides/:id', (req, res) => {
  const listingId = req.params.id;
  delete overrides[listingId];
  persistOverrides();
  res.json({ success: true });
});

// Clear all overrides
router.delete('/api/listing-overrides', (req, res) => {
  overrides = {};
  persistOverrides();
  res.json({ success: true });
});

// Get allowed override fields
router.get('/api/listing-overrides/fields', (req, res) => {
  res.json([...OVERRIDEABLE_FIELDS]);
});

// ========== Init ==========

export function initListingOverrides({ logsDir, listings }) {
  overridesFile = join(logsDir, 'listing-overrides.json');
  mockListings = listings;
  loadOverrides();
}

export default router;
