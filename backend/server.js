import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { connectDB, getDB } from './db.js';
import { DEFAULT_CONFIG, EVENT_DEFINITIONS, generateListingsForEvent } from './data/generators.js';
import experimentsRouter, { initExperiments, resolveExperimentConfig, getActiveExperiment } from './experiments.js';
import listingOverridesRouter, { initListingOverrides, getGlobalListingOverrides, applyListingOverrides } from './listingOverrides.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;
const NODE_ENV = process.env.NODE_ENV || 'development';

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN 
    ? (process.env.CORS_ORIGIN === '*' ? '*' : process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()))
    : (NODE_ENV === 'production' ? false : '*'),
  credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Request logging setup
// In Docker, server.js is at /app/server.js, so use /app/logs (not ../logs)
const LOGS_DIR = join(__dirname, 'logs');
const LOG_FILE = join(LOGS_DIR, 'requests.jsonl');
const MAX_LOG_ENTRIES = parseInt(process.env.MAX_LOG_ENTRIES || '1000', 10);

// Ensure logs directory exists
if (!existsSync(LOGS_DIR)) {
  try {
    mkdirSync(LOGS_DIR, { recursive: true });
  } catch (e) {
    // Directory might already exist or error creating
    console.error('Error creating logs directory:', e);
  }
}

// In-memory log store (for quick access)
let requestLogs = [];

// Load recent logs from file on startup
function loadRecentLogs() {
  if (existsSync(LOG_FILE)) {
    try {
      const lines = readFileSync(LOG_FILE, 'utf8').split('\n').filter(line => line.trim());
      const recent = lines.slice(-MAX_LOG_ENTRIES);
      requestLogs = recent.map(line => JSON.parse(line));
    } catch (error) {
      console.error('Error loading logs:', error);
      requestLogs = [];
    }
  }
}

// Save log entry to file
function saveLogEntry(entry) {
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch (error) {
    console.error('Error saving log entry:', error);
  }
}

// ========== Session Tracking ==========
const SESSIONS_FILE = join(LOGS_DIR, 'sessions.json');
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_SESSIONS = parseInt(process.env.MAX_SESSIONS || '500', 10);
let sessions = new Map(); // sessionId -> session object

function generateSessionId() {
  return `sess_${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function loadSessions() {
  if (existsSync(SESSIONS_FILE)) {
    try {
      const data = JSON.parse(readFileSync(SESSIONS_FILE, 'utf8'));
      for (const session of data) {
        sessions.set(session.id, session);
      }
      // Enforce max
      if (sessions.size > MAX_SESSIONS) {
        const sorted = [...sessions.values()].sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity));
        const toRemove = sorted.slice(0, sessions.size - MAX_SESSIONS);
        for (const s of toRemove) sessions.delete(s.id);
      }
    } catch (error) {
      console.error('Error loading sessions:', error);
    }
  }
}

let persistSessionsTimer = null;
function persistSessions() {
  if (persistSessionsTimer) clearTimeout(persistSessionsTimer);
  persistSessionsTimer = setTimeout(() => {
    try {
      writeFileSync(SESSIONS_FILE, JSON.stringify([...sessions.values()], null, 2));
    } catch (error) {
      console.error('Error persisting sessions:', error);
    }
  }, 2000);
}

function resolveSession(req, res) {
  // Priority: explicit header > cookie > fingerprint
  let sessionId = req.headers['x-session-id'] || req.cookies?.tickethub_session_id || null;

  // Validate session exists and is not expired
  if (sessionId && sessions.has(sessionId)) {
    const session = sessions.get(sessionId);
    const elapsed = Date.now() - new Date(session.lastActivity).getTime();
    if (elapsed > SESSION_TIMEOUT_MS) {
      sessionId = null; // expired
    }
  } else if (sessionId) {
    sessionId = null; // unknown session
  }

  // Fallback: fingerprint from IP + user-agent
  if (!sessionId) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const ua = req.get('user-agent') || 'unknown';
    const fingerprint = `fp_${Buffer.from(ip + '||' + ua).toString('base64url').substr(0, 20)}`;

    // Check if there's an active session with this fingerprint
    for (const [id, s] of sessions) {
      if (s.fingerprint === fingerprint) {
        const elapsed = Date.now() - new Date(s.lastActivity).getTime();
        if (elapsed <= SESSION_TIMEOUT_MS) {
          sessionId = id;
          break;
        }
      }
    }

    // Create new session if none found
    if (!sessionId) {
      sessionId = generateSessionId();
      const isAgent = isAgentRequest(req);
      sessions.set(sessionId, {
        id: sessionId,
        fingerprint,
        startTime: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        requestCount: 0,
        isAgent,
        userAgent: req.get('user-agent') || 'unknown',
        ip: req.ip || req.connection?.remoteAddress || 'unknown',
        pagesVisited: [],
        requestIds: []
      });

      // Enforce max sessions
      if (sessions.size > MAX_SESSIONS) {
        const oldest = [...sessions.values()].sort((a, b) => new Date(a.lastActivity) - new Date(b.lastActivity))[0];
        if (oldest) sessions.delete(oldest.id);
      }
    }
  }

  // Set cookie and response header
  res.cookie('tickethub_session_id', sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TIMEOUT_MS
  });
  res.setHeader('X-Session-Id', sessionId);

  return sessionId;
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [id, session] of sessions) {
    if (now - new Date(session.lastActivity).getTime() > SESSION_TIMEOUT_MS) {
      sessions.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    persistSessions();
  }
}, 5 * 60 * 1000);

// Detect if request is from an agent/bot
function isAgentRequest(req) {
  const userAgent = (req.get('user-agent') || '').toLowerCase();
  const referer = req.get('referer') || '';
  
  // Common agent indicators
  const agentPatterns = [
    'bot', 'crawler', 'spider', 'scraper', 'agent',
    'curl', 'wget', 'python', 'node', 'axios', 'fetch',
    'postman', 'insomnia', 'httpie', 'go-http-client',
    'googlebot', 'bingbot', 'slurp', 'duckduckbot',
    'baiduspider', 'yandexbot', 'facebookexternalhit',
    'twitterbot', 'linkedinbot', 'whatsapp', 'telegram',
    'discordbot', 'slackbot', 'anthropic', 'openai',
    'claude', 'gpt', 'chatgpt', 'perplexity', 'bard',
    'gemini', 'copilot', 'bingchat'
  ];
  
  // Check user agent
  if (agentPatterns.some(pattern => userAgent.includes(pattern))) {
    return true;
  }
  
  // Check for common API client headers
  if (req.get('x-api-key') || req.get('authorization')) {
    // Might be an API client, but not necessarily an agent
  }
  
  // Check if it's a programmatic request (no typical browser headers)
  const hasBrowserHeaders = req.get('accept')?.includes('text/html') || 
                           req.get('accept-language') ||
                           req.get('sec-fetch-mode');
  
  if (!hasBrowserHeaders && userAgent) {
    return true; // Likely programmatic
  }
  
  return false;
}

// Session resolution middleware
app.use((req, res, next) => {
  req.sessionId = resolveSession(req, res);
  next();
});

// Request logging middleware
app.use((req, res, next) => {
  const startTime = Date.now();
  const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Capture request body (for POST/PUT requests)
  let requestBody = null;
  if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
    requestBody = req.body;
  }
  
  // Capture original response methods
  const originalSend = res.send;
  const originalJson = res.json;
  let responseBody = null;
  
  // Override res.send
  res.send = function(body) {
    responseBody = body;
    return originalSend.call(this, body);
  };
  
  // Override res.json
  res.json = function(body) {
    responseBody = body; // Store as object, not string
    return originalJson.call(this, body);
  };
  
  // Log when response finishes
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const userAgent = req.get('user-agent') || 'unknown';
    const isAgent = isAgentRequest(req);
    
    // Parse response body if it's a string
    let parsedResponseBody = null;
    let responseBodyString = null;
    let responseSize = 0;
    
    if (responseBody) {
      if (typeof responseBody === 'string') {
        responseBodyString = responseBody;
        responseSize = responseBody.length;
        // Try to parse as JSON
        try {
          parsedResponseBody = JSON.parse(responseBody);
          responseBodyString = JSON.stringify(parsedResponseBody, null, 2); // Pretty print
        } catch (e) {
          // Not JSON, keep as string
          parsedResponseBody = responseBody;
        }
      } else {
        // Already an object
        parsedResponseBody = responseBody;
        responseBodyString = JSON.stringify(responseBody, null, 2);
        responseSize = responseBodyString.length;
      }
    }
    
    // Limit response size for storage (keep full version in memory, truncated in file)
    const MAX_RESPONSE_SIZE = 50000; // 50KB limit
    const truncatedResponse = responseSize > MAX_RESPONSE_SIZE 
      ? responseBodyString?.substring(0, MAX_RESPONSE_SIZE) + `\n... (truncated, ${responseSize} total bytes)`
      : responseBodyString;
    
    // Extract summary info from response
    let responseSummary = null;
    if (parsedResponseBody) {
      if (Array.isArray(parsedResponseBody)) {
        responseSummary = {
          type: 'array',
          length: parsedResponseBody.length,
          firstItemKeys: parsedResponseBody[0] ? Object.keys(parsedResponseBody[0]) : []
        };
      } else if (typeof parsedResponseBody === 'object' && parsedResponseBody !== null) {
        responseSummary = {
          type: 'object',
          keys: Object.keys(parsedResponseBody),
          hasNestedData: Object.values(parsedResponseBody).some(v => Array.isArray(v) || (typeof v === 'object' && v !== null))
        };
      }
    }
    
    const logEntry = {
      id: requestId,
      sessionId: req.sessionId,
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      fullPath: req.originalUrl || req.path,
      query: req.query,
      params: req.params,
      body: requestBody,
      headers: {
        'user-agent': userAgent,
        'referer': req.get('referer') || null,
        'origin': req.get('origin') || null,
        'accept': req.get('accept') || null,
        'content-type': req.get('content-type') || null,
      },
      ip: req.ip || req.connection.remoteAddress,
      statusCode: res.statusCode,
      responseBody: parsedResponseBody, // Store parsed object
      responseBodyString: truncatedResponse, // Store formatted string for display
      responseSize: responseSize,
      responseSummary: responseSummary,
      duration: duration,
      durationFormatted: `${duration}ms`,
      isAgent: isAgent,
      experimentId: req.experimentId || null,
      variantId: req.variantId || null
    };

    // Add to in-memory store
    requestLogs.push(logEntry);
    if (requestLogs.length > MAX_LOG_ENTRIES) {
      requestLogs.shift(); // Remove oldest entry
    }

    // Save to file
    saveLogEntry(logEntry);

    // Update session
    if (req.sessionId && sessions.has(req.sessionId)) {
      const session = sessions.get(req.sessionId);
      session.lastActivity = new Date().toISOString();
      session.requestCount++;
      if (!session.pagesVisited.length || session.pagesVisited[session.pagesVisited.length - 1] !== req.path) {
        session.pagesVisited.push(req.path);
      }
      session.requestIds.push(requestId);
      // Update agent status if detected on any request
      if (isAgent) session.isAgent = true;
      // Track experiment assignment on session
      if (req.experimentId) {
        session.experimentId = req.experimentId;
        session.variantId = req.variantId;
      }
      persistSessions();
    }

    // Console log for agent requests
    if (isAgent) {
      console.log(`[AGENT REQUEST] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${userAgent}`);
    }
  });
  
  next();
});

// Load recent logs and sessions on startup
loadRecentLogs();
loadSessions();

// Configuration management — backed by MongoDB with TTL cache
let configCache = null;
let configCacheTime = 0;
const CONFIG_CACHE_TTL = 5000;

async function loadConfig() {
  if (configCache && Date.now() - configCacheTime < CONFIG_CACHE_TTL) {
    return configCache;
  }
  try {
    const db = getDB();
    const doc = await db.collection('config').findOne({ key: 'active' });
    if (doc) {
      const { _id, key, updatedAt, ...config } = doc;
      configCache = {
        pricing:  { ...DEFAULT_CONFIG.pricing,  ...(config.pricing || {}) },
        scores:   { ...DEFAULT_CONFIG.scores,   ...(config.scores || {}) },
        demand:   { ...DEFAULT_CONFIG.demand,   ...(config.demand || {}) },
        seller:   { ...DEFAULT_CONFIG.seller,   ...(config.seller || {}) },
        content:  { ...DEFAULT_CONFIG.content,  ...(config.content || {}) },
        api:      { ...DEFAULT_CONFIG.api,      ...(config.api || {}) },
        behavior: { ...DEFAULT_CONFIG.behavior, ...(config.behavior || {}) },
      };
    } else {
      configCache = { ...DEFAULT_CONFIG };
      await saveConfig(configCache);
    }
  } catch (error) {
    console.error('Error loading config from DB:', error);
    configCache = { ...DEFAULT_CONFIG };
  }
  configCacheTime = Date.now();
  return configCache;
}

async function saveConfig(config) {
  const db = getDB();
  await db.collection('config').updateOne(
    { key: 'active' },
    { $set: { key: 'active', ...config, updatedAt: new Date().toISOString() } },
    { upsert: true }
  );
  configCache = config;
  configCacheTime = Date.now();
}

// Register routers (init happens in startServer after DB connect)
app.use(experimentsRouter);
app.use(listingOverridesRouter);

// Helper function to get stadium map data for a venue
function getStadiumMapData(venueName) {
  const venueLower = venueName.toLowerCase();
  // Default stadium map data
  const defaultData = {
    midfieldOrientation: ['Section 101-110', 'Section 201-210'],
    roofCoverage: 'partial',
    entryTunnelProximity: 'near',
    sectionQuality: {
      'lower_bowl': 9,
      'club': 8,
      'mezzanine': 6,
      'upper_deck': 4
    }
  };

  // Venue-specific overrides
  if (venueLower.includes('madison square garden') || venueLower.includes('msg')) {
    return {
      ...defaultData,
      midfieldOrientation: ['Section 101-115', 'Section 201-215'],
      roofCoverage: 'covered'
    };
  }
  if (venueLower.includes('crypto') || venueLower.includes('staples')) {
    return {
      ...defaultData,
      midfieldOrientation: ['Section 101-120', 'Section 201-220'],
      roofCoverage: 'covered'
    };
  }
  if (venueLower.includes('wembley')) {
    return {
      ...defaultData,
      midfieldOrientation: ['Section 101-130', 'Section 201-230'],
      roofCoverage: 'partial'
    };
  }
  if (venueLower.includes('td garden')) {
    return {
      ...defaultData,
      midfieldOrientation: ['Section 101-112', 'Section 201-212'],
      roofCoverage: 'covered'
    };
  }

  return defaultData;
}

// Helper function to load venue section data from data/venues/
function loadVenueData(venueName) {
  const VENUES_DIR = join(__dirname, 'data/venues');
  
  if (!existsSync(VENUES_DIR)) {
    return null;
  }

  try {
    const files = readdirSync(VENUES_DIR).filter(f => f.endsWith('-sections.json'));
    const venueLower = venueName.toLowerCase();
    
    // Try to find a matching venue file
    for (const file of files) {
      const filePath = join(VENUES_DIR, file);
      const data = readFileSync(filePath, 'utf8');
      const venueData = JSON.parse(data);
      
      // Check if venue name matches (case-insensitive, partial match)
      const fileVenueLower = venueData.venue.toLowerCase();
      if (fileVenueLower === venueLower || 
          fileVenueLower.includes(venueLower) || 
          venueLower.includes(fileVenueLower)) {
        return venueData;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error loading venue data:', error);
    return null;
  }
}

// Generate future date string for event date computation
function futureDateString(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// Compute fresh event dates from daysFromNow stored in DB
function refreshEventDate(event) {
  if (event.daysFromNow !== undefined) {
    return { ...event, date: futureDateString(event.daysFromNow) };
  }
  return event;
}

// DB helper functions for fetching events and listings
async function getEvents() {
  const db = getDB();
  const events = await db.collection('events').find().toArray();
  return events.map(refreshEventDate);
}

async function getEventById(id) {
  const db = getDB();
  const event = await db.collection('events').findOne({ id: parseInt(id) });
  return event ? refreshEventDate(event) : null;
}

async function getListingsForEvent(eventId) {
  const db = getDB();
  return db.collection('listings').find({ eventId: parseInt(eventId) }).toArray();
}

async function getAllListings() {
  const db = getDB();
  return db.collection('listings').find().toArray();
}

async function getListingById(id) {
  const db = getDB();
  return db.collection('listings').findOne({ id: parseInt(id) });
}

// Format price based on configuration
function formatPrice(price, config) {
  const currency = config.pricing.currency || 'USD';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';

  switch (config.pricing.format) {
    case 'currency_symbol':
      return `${symbol}${price.toFixed(2)}`;
    case 'currency_code':
      return `${price.toFixed(2)} ${currency}`;
    case 'number_only':
      return price.toFixed(2);
    default:
      return `${symbol}${price.toFixed(2)}`;
  }
}

// Format date based on configuration
function formatDate(dateString, config) {
  const date = new Date(dateString);
  
  switch (config.api.dateFormat) {
    case 'MM/DD/YYYY':
      return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    case 'DD/MM/YYYY':
      return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
    case 'YYYY-MM-DD':
      return date.toISOString().split('T')[0];
    case 'full':
      return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    default:
      return date.toLocaleDateString('en-US');
  }
}

// Format seats array to display string
function formatSeats(seats) {
  if (seats.length === 1) {
    return `Seat ${seats[0]}`;
  }
  
  // Check if consecutive
  let isConsecutive = true;
  for (let i = 1; i < seats.length; i++) {
    if (seats[i] !== seats[i - 1] + 1) {
      isConsecutive = false;
      break;
    }
  }
  
  if (isConsecutive) {
    return `${seats[0]}-${seats[seats.length - 1]}`;
  }
  
  return seats.join(', ');
}

// Transform event based on configuration (NO pricing)
function transformEvent(event, config, allListings = []) {
  const transformed = { ...event };
  
  // Format date
  transformed.dateFormatted = formatDate(event.date, config);
  
  // Add stadium map data
  const stadiumMapData = getStadiumMapData(event.venue.name);
  transformed.venue.stadiumMapData = stadiumMapData;
  
  // Add listing counts
  const eventListings = allListings.filter(l => l.eventId === event.id);
  transformed.totalListingsCount = eventListings.length;
  
  // Listing supply indicator
  if (transformed.totalListingsCount > 500) {
    transformed.listingSupply = 'high';
  } else if (transformed.totalListingsCount > 100) {
    transformed.listingSupply = 'medium';
  } else {
    transformed.listingSupply = 'low';
  }
  
  // Capture full venue data before trimming for flat format
  const fullVenue = { ...event.venue };

  // Venue info based on config
  if (config.content.venueInfo === 'name_only') {
    transformed.venue = { name: event.venue.name };
  } else if (config.content.venueInfo === 'address_only') {
    transformed.venue = { address: event.venue.address };
  } else {
    // Include stadium map data if venue info is full
    transformed.venue.stadiumMapData = stadiumMapData;
  }

  // Description based on config
  if (config.content.eventDescriptions === 'brief') {
    transformed.description = transformed.description.split('.')[0] + '.';
  } else if (config.content.eventDescriptions === 'minimal') {
    transformed.description = '';
  }

  // Response format
  if (config.api.responseFormat === 'flat') {
    return {
      id: transformed.id,
      title: transformed.title,
      artist: transformed.artist,
      date: transformed.dateFormatted,
      time: transformed.time,
      venueName: fullVenue.name,
      venueAddress: fullVenue.address,
      venueCity: fullVenue.city,
      venueState: fullVenue.state,
      category: transformed.category,
      description: transformed.description,
      totalListingsCount: transformed.totalListingsCount,
      listingSupply: transformed.listingSupply
    };
  }
  
  return transformed;
}

// Calculate deal score (1-10) based on price compared to other listings for the event
function calculateDealScore(listing, allListingsForEvent, config) {
  if (allListingsForEvent.length === 0) return 5;

  const prices = allListingsForEvent.map(l => l.pricePerTicket);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];

  if (maxPrice === minPrice) return 5; // All same price

  // Base score from price (lower price = higher score)
  let score = 10 - ((listing.pricePerTicket - minPrice) / (maxPrice - minPrice)) * 9;

  // Adjustments based on new factors
  // Deal flags boost (gated by config)
  if (config?.scores?.dealFlagsInfluenceScore !== false) {
    if (listing.dealFlags) {
      if (listing.dealFlags.includes('great_deal') || listing.dealFlags.includes('fantastic_value')) score += 0.5;
      if (listing.dealFlags.includes('best_value')) score += 0.3;
      if (listing.dealFlags.includes('featured')) score += 0.2;
    }
  }

  // Supply/demand adjustment
  if (listing.demandLevel === 'high') score += 0.2;
  if (listing.demandLevel === 'low') score -= 0.2;
  
  // Seat quality adjustment (better seats at good price = better deal)
  if (listing.stadiumZone === 'lower_bowl' && listing.pricePerTicket < medianPrice) score += 0.3;
  if (listing.stadiumZone === 'upper_deck' && listing.pricePerTicket > medianPrice) score -= 0.3;
  
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// Calculate value score (experience per dollar, not just price)
function calculateValueScore(listing, allListingsForEvent) {
  if (allListingsForEvent.length === 0) return 5;
  
  const prices = allListingsForEvent.map(l => l.pricePerTicket);
  const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
  
  // Base value from seat quality vs price
  let score = 5;
  
  // Field proximity score (1-10) normalized
  const proximityScore = listing.fieldProximity || 5;
  const priceRatio = listing.pricePerTicket / medianPrice;
  
  // Value = quality / price ratio
  // Higher proximity at lower price = better value
  score = (proximityScore / 10) * (1 / priceRatio) * 5;
  
  // Adjustments
  if (listing.seatType === 'obstructed_view') score -= 1;
  if (listing.seatType === 'standing_room' && priceRatio > 1.2) score -= 0.5;
  if (listing.dealFlags && listing.dealFlags.includes('clear_view')) score += 0.5;
  if (listing.bundleOptions && Object.keys(listing.bundleOptions).length > 0) score += 0.3;
  
  return Math.max(1, Math.min(10, Math.round(score * 10) / 10));
}

// Calculate relative value indicators
function calculateRelativeValue(listing, allListingsForEvent) {
  if (allListingsForEvent.length === 0) {
    return {
      priceVsMedian: 0,
      priceVsSimilarSeats: 0,
      marketValue: listing.pricePerTicket,
      savingsAmount: 0,
      savingsPercent: 0
    };
  }
  
  const prices = allListingsForEvent.map(l => l.pricePerTicket);
  const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  
  // Find similar seats (same zone)
  const similarSeats = allListingsForEvent.filter(l => 
    l.stadiumZone === listing.stadiumZone && l.id !== listing.id
  );
  const similarPrices = similarSeats.length > 0 
    ? similarSeats.map(l => l.pricePerTicket)
    : prices;
  const similarMedian = similarPrices.length > 0
    ? similarPrices.sort((a, b) => a - b)[Math.floor(similarPrices.length / 2)]
    : medianPrice;
  
  const priceVsMedian = Math.round(((listing.pricePerTicket - medianPrice) / medianPrice) * 100 * 10) / 10;
  const priceVsSimilarSeats = similarSeats.length > 0
    ? Math.round(((listing.pricePerTicket - similarMedian) / similarMedian) * 100 * 10) / 10
    : priceVsMedian;
  
  const marketValue = Math.round(avgPrice * 100) / 100;
  const savingsAmount = listing.pricePerTicket < marketValue 
    ? Math.round((marketValue - listing.pricePerTicket) * 100) / 100
    : 0;
  const savingsPercent = listing.pricePerTicket < marketValue
    ? Math.round(((marketValue - listing.pricePerTicket) / marketValue) * 100 * 10) / 10
    : 0;
  
  return {
    priceVsMedian,
    priceVsSimilarSeats,
    marketValue,
    savingsAmount,
    savingsPercent
  };
}

// Get deal score color based on score
function getDealScoreColor(score) {
  if (score >= 8) return 'green';
  if (score >= 5) return 'yellow';
  return 'red';
}

// Generate urgency text based on listing data and urgency level + demand config
function getUrgencyText(listing, level, demandConfig) {
  if (level === 'none') return null;
  const texts = [];
  const hasDemandLevel = demandConfig?.includeDemandLevel !== false;
  const hasSoldData = demandConfig?.includeSoldData !== false;
  const hasViewCounts = demandConfig?.includeViewCounts !== false;

  if (level === 'subtle') {
    if (hasDemandLevel && listing.demandLevel === 'high') texts.push('Popular event');
  } else if (level === 'moderate') {
    if (hasDemandLevel && listing.demandLevel === 'high') texts.push('Selling quickly');
    if (hasSoldData && listing.soldRecently) texts.push('Recently sold nearby');
    if (listing.quantity <= 2) texts.push('Limited availability');
  } else if (level === 'aggressive') {
    if (hasDemandLevel && listing.demandLevel === 'high') texts.push('SELLING FAST - High demand!');
    if (hasSoldData && listing.soldRecently) texts.push('Someone just bought similar tickets!');
    if (hasViewCounts && listing.viewsLast24h > 50) texts.push(`${listing.viewsLast24h} people viewed this today`);
    if (hasDemandLevel || hasSoldData || hasViewCounts) {
      texts.push(`Only ${Math.max(1, Math.min(listing.quantity, Math.floor(((listing.id * 7 + 13) % 4) + 1)))} left at this price!`);
    }
  }
  return texts.length > 0 ? texts : null;
}

// Transform listing based on configuration
function transformListing(rawListing, config, allListingsForEvent = [], listingOverrides = {}) {
  // Apply per-listing field overrides before any calculations
  const listing = applyListingOverrides(rawListing, listingOverrides);
  const transformed = { ...listing };

  // Format seats
  transformed.seatsDisplay = formatSeats(listing.seats);

  // Format prices
  transformed.pricePerTicketFormatted = formatPrice(listing.pricePerTicket, config);

  switch (config.pricing.feeVisibility) {
    case 'hidden':
      transformed.totalPrice = listing.pricePerTicket;
      transformed.totalPriceFormatted = transformed.pricePerTicketFormatted;
      delete transformed.fees;
      delete transformed.serviceFee;
      delete transformed.fulfillmentFee;
      delete transformed.platformFee;
      break;
    case 'total_only':
      transformed.totalPrice = listing.pricePerTicket + listing.fees;
      transformed.totalPriceFormatted = formatPrice(listing.pricePerTicket + listing.fees, config);
      transformed.feesFormatted = formatPrice(listing.fees, config);
      delete transformed.serviceFee;
      delete transformed.fulfillmentFee;
      delete transformed.platformFee;
      break;
    case 'included_in_price':
      transformed.pricePerTicket = listing.pricePerTicket + listing.fees;
      transformed.pricePerTicketFormatted = formatPrice(transformed.pricePerTicket, config);
      transformed.totalPrice = transformed.pricePerTicket;
      transformed.totalPriceFormatted = transformed.pricePerTicketFormatted;
      transformed.feesIncludedInPrice = true;
      delete transformed.fees;
      delete transformed.serviceFee;
      delete transformed.fulfillmentFee;
      delete transformed.platformFee;
      break;
    case 'breakdown':
    default:
      transformed.feesFormatted = formatPrice(listing.fees, config);
      transformed.totalPrice = listing.pricePerTicket + listing.fees;
      transformed.totalPriceFormatted = formatPrice(listing.pricePerTicket + listing.fees, config);
      if (listing.serviceFee !== undefined) {
        transformed.serviceFeeFormatted = formatPrice(listing.serviceFee, config);
      }
      if (listing.fulfillmentFee !== undefined) {
        transformed.fulfillmentFeeFormatted = formatPrice(listing.fulfillmentFee, config);
      }
      if (listing.platformFee !== undefined) {
        transformed.platformFeeFormatted = formatPrice(listing.platformFee, config);
      }
      break;
  }

  // Fabricated discount or real original price
  if (config.pricing.fabricatedDiscount) {
    const inflationPercent = ((listing.id * 7 + 13) % 26) + 15;
    transformed.originalPrice = Math.round(listing.pricePerTicket * (1 + inflationPercent / 100) * 100) / 100;
    transformed.originalPriceFormatted = formatPrice(transformed.originalPrice, config);
    transformed.discountPercent = inflationPercent;
  } else if (config.pricing.showOriginalPrice && listing.price7DaysAgo && listing.price7DaysAgo > listing.pricePerTicket) {
    transformed.originalPrice = listing.price7DaysAgo;
    transformed.originalPriceFormatted = formatPrice(listing.price7DaysAgo, config);
  }

  // Calculate scores and relative value (allListingsForEvent must be passed by caller)
  const eventListings = allListingsForEvent;
  
  // Deal score (conditionally)
  if (config.scores.includeDealScore) {
    transformed.dealScore = calculateDealScore(listing, eventListings, config);
    if (config.scores.scoreContradictions) {
      transformed.dealScore = Math.max(1, Math.min(10, Math.round((11 - transformed.dealScore) * 10) / 10));
    }
    transformed.dealScoreColor = getDealScoreColor(transformed.dealScore);
  } else {
    delete transformed.dealScore;
    delete transformed.dealScoreColor;
  }

  // Value score (conditionally)
  if (config.scores.includeValueScore) {
    transformed.valueScore = calculateValueScore(listing, eventListings);
    if (config.scores.scoreContradictions) {
      transformed.valueScore = Math.max(1, Math.min(10, Math.round((11 - transformed.valueScore) * 10) / 10));
    }
    transformed.valueScoreColor = getDealScoreColor(transformed.valueScore);
  } else {
    delete transformed.valueScore;
    delete transformed.valueScoreColor;
  }

  // Relative value indicators (conditionally)
  if (config.scores.includeRelativeValue) {
    const relativeValue = calculateRelativeValue(listing, eventListings);
    transformed.priceVsMedian = relativeValue.priceVsMedian;
    transformed.priceVsSimilarSeats = relativeValue.priceVsSimilarSeats;
    transformed.marketValue = relativeValue.marketValue;
  } else {
    delete transformed.priceVsMedian;
    delete transformed.priceVsSimilarSeats;
    delete transformed.marketValue;
  }

  // Savings info (conditionally)
  if (config.scores.includeSavings) {
    const relativeValue = calculateRelativeValue(listing, eventListings);
    transformed.savingsAmount = relativeValue.savingsAmount;
    transformed.savingsPercent = relativeValue.savingsPercent;
    if (!config.scores.includeRelativeValue) {
      transformed.marketValue = relativeValue.marketValue; // Needed for savings calculation
    }
  } else {
    delete transformed.savingsAmount;
    delete transformed.savingsPercent;
  }

  // Price history (conditionally)
  if (config.demand.includePriceHistory) {
    if (transformed.priceHistory && Array.isArray(transformed.priceHistory)) {
      transformed.priceHistory = transformed.priceHistory.map(entry => ({
        ...entry,
        dateFormatted: formatDate(entry.date, config)
      }));
    }
  } else {
    delete transformed.priceHistory;
    delete transformed.price7DaysAgo;
    delete transformed.priceChangePercent;
  }

  // Urgency language (BEFORE demand indicator deletion to use original data)
  if (config.demand.urgencyLanguage && config.demand.urgencyLanguage !== 'none') {
    transformed.urgencyText = getUrgencyText(listing, config.demand.urgencyLanguage, config.demand);
  }

  // Demand indicators (conditionally, granular)
  if (!config.demand.includeViewCounts) {
    delete transformed.viewCount;
    delete transformed.viewsLast24h;
  }
  if (!config.demand.includeSoldData) {
    delete transformed.soldCount;
    delete transformed.soldRecently;
  }
  if (!config.demand.includePriceTrend) {
    delete transformed.priceTrend;
  }
  if (!config.demand.includeDemandLevel) {
    delete transformed.demandLevel;
  }

  // Bundle options (conditionally)
  if (!config.content.includeBundleOptions) {
    delete transformed.bundleOptions;
    delete transformed.premiumFeatures;
  } else if (!config.content.includePremiumFeatures) {
    delete transformed.premiumFeatures;
  }

  // Policies (conditionally)
  if (!config.seller.includeRefundPolicy) {
    delete transformed.refundPolicy;
  }
  if (!config.seller.includeTransferMethod) {
    delete transformed.transferMethod;
  }

  // Seller details (conditionally)
  if (!config.seller.includeSellerDetails) {
    delete transformed.sellerVerified;
    delete transformed.sellerTransactionCount;
  }

  // Trust signals — controls how much seller trust emphasis appears
  switch (config.seller.trustSignals) {
    case 'none':
      delete transformed.sellerVerified;
      delete transformed.sellerRating;
      delete transformed.sellerTransactionCount;
      break;
    case 'minimal':
      // Only show verified badge, no counts or rating
      delete transformed.sellerTransactionCount;
      delete transformed.sellerRating;
      break;
    case 'heavy':
      // Add extra trust emphasis fields
      if (transformed.sellerVerified) {
        transformed.sellerTrustBadge = 'Verified Trusted Seller';
      }
      if (transformed.sellerTransactionCount > 100) {
        transformed.sellerReputation = 'Top Seller — ' + transformed.sellerTransactionCount + '+ transactions';
      } else if (transformed.sellerTransactionCount > 20) {
        transformed.sellerReputation = 'Experienced Seller';
      }
      if (transformed.sellerRating >= 4.5) {
        transformed.sellerRatingLabel = 'Excellent';
      } else if (transformed.sellerRating >= 4.0) {
        transformed.sellerRatingLabel = 'Very Good';
      } else {
        transformed.sellerRatingLabel = 'Good';
      }
      break;
    case 'standard':
    default:
      // Default behavior — all seller fields pass through as-is
      break;
  }

  // Deal flags (conditionally)
  if (!config.scores.includeDealFlags) {
    delete transformed.dealFlags;
  }

  // Seat quality (conditionally)
  if (!config.api.includeSeatQuality) {
    delete transformed.seatType;
    delete transformed.stadiumZone;
    delete transformed.fieldProximity;
    delete transformed.rowElevation;
    delete transformed.seatLocation;
    delete transformed.seatsAdjacent;
  }
  
  // Response format
  if (config.api.responseFormat === 'flat') {
    const flat = {
      id: transformed.id,
      eventId: transformed.eventId,
      section: transformed.section,
      row: transformed.row,
      seats: transformed.seats,
      seatsDisplay: transformed.seatsDisplay,
      quantity: transformed.quantity,
      pricePerTicket: transformed.pricePerTicket,
      pricePerTicketFormatted: transformed.pricePerTicketFormatted,
      fees: config.pricing.feeVisibility !== 'hidden' ? transformed.fees : undefined,
      feesFormatted: config.pricing.feeVisibility !== 'hidden' ? transformed.feesFormatted : undefined,
      totalPrice: transformed.totalPrice,
      totalPriceFormatted: transformed.totalPriceFormatted,
      sellerName: transformed.sellerName,
      sellerRating: transformed.sellerRating,
      deliveryMethod: transformed.deliveryMethod,
      notes: transformed.notes,
      listedAt: transformed.listedAt,
      imageUrl: transformed.imageUrl,
    };

    // Fee-related extras
    if (transformed.feesIncludedInPrice) flat.feesIncludedInPrice = true;
    if (config.pricing.feeVisibility === 'breakdown') {
      if (transformed.serviceFee !== undefined) flat.serviceFee = transformed.serviceFee;
      if (transformed.serviceFeeFormatted) flat.serviceFeeFormatted = transformed.serviceFeeFormatted;
      if (transformed.fulfillmentFee !== undefined) flat.fulfillmentFee = transformed.fulfillmentFee;
      if (transformed.fulfillmentFeeFormatted) flat.fulfillmentFeeFormatted = transformed.fulfillmentFeeFormatted;
      if (transformed.platformFee !== undefined) flat.platformFee = transformed.platformFee;
      if (transformed.platformFeeFormatted) flat.platformFeeFormatted = transformed.platformFeeFormatted;
    }

    // Seat quality (conditionally)
    if (config.api.includeSeatQuality) {
      if (transformed.seatType) flat.seatType = transformed.seatType;
      if (transformed.stadiumZone) flat.stadiumZone = transformed.stadiumZone;
      if (transformed.fieldProximity !== undefined) flat.fieldProximity = transformed.fieldProximity;
      if (transformed.rowElevation !== undefined) flat.rowElevation = transformed.rowElevation;
      if (transformed.seatLocation) flat.seatLocation = transformed.seatLocation;
      if (transformed.seatsAdjacent !== undefined) flat.seatsAdjacent = transformed.seatsAdjacent;
    }

    if (config.scores.includeDealScore && transformed.dealScore !== undefined) {
      flat.dealScore = transformed.dealScore;
      flat.dealScoreColor = transformed.dealScoreColor;
    }

    if (config.scores.includeValueScore && transformed.valueScore !== undefined) {
      flat.valueScore = transformed.valueScore;
      flat.valueScoreColor = transformed.valueScoreColor;
    }

    if (config.demand.includePriceHistory) {
      if (transformed.priceHistory) flat.priceHistory = transformed.priceHistory;
      if (transformed.price7DaysAgo !== undefined) flat.price7DaysAgo = transformed.price7DaysAgo;
      if (transformed.priceChangePercent !== undefined) flat.priceChangePercent = transformed.priceChangePercent;
    }

    if (config.scores.includeSavings) {
      if (transformed.savingsAmount !== undefined) flat.savingsAmount = transformed.savingsAmount;
      if (transformed.savingsPercent !== undefined) flat.savingsPercent = transformed.savingsPercent;
      if (transformed.marketValue !== undefined) flat.marketValue = transformed.marketValue;
    }

    if (config.scores.includeRelativeValue) {
      if (transformed.priceVsMedian !== undefined) flat.priceVsMedian = transformed.priceVsMedian;
      if (transformed.priceVsSimilarSeats !== undefined) flat.priceVsSimilarSeats = transformed.priceVsSimilarSeats;
    }

    // Demand indicators (granular)
    if (config.demand.includeViewCounts) {
      if (transformed.viewCount !== undefined) flat.viewCount = transformed.viewCount;
      if (transformed.viewsLast24h !== undefined) flat.viewsLast24h = transformed.viewsLast24h;
    }
    if (config.demand.includeSoldData) {
      if (transformed.soldCount !== undefined) flat.soldCount = transformed.soldCount;
      if (transformed.soldRecently !== undefined) flat.soldRecently = transformed.soldRecently;
    }
    if (config.demand.includePriceTrend) {
      if (transformed.priceTrend !== undefined) flat.priceTrend = transformed.priceTrend;
    }
    if (config.demand.includeDemandLevel) {
      if (transformed.demandLevel !== undefined) flat.demandLevel = transformed.demandLevel;
    }

    if (config.content.includeBundleOptions) {
      if (transformed.bundleOptions) flat.bundleOptions = transformed.bundleOptions;
      if (config.content.includePremiumFeatures && transformed.premiumFeatures) {
        flat.premiumFeatures = transformed.premiumFeatures;
      }
    }

    if (config.seller.includeRefundPolicy && transformed.refundPolicy) {
      flat.refundPolicy = transformed.refundPolicy;
    }

    if (config.seller.includeTransferMethod && transformed.transferMethod) {
      flat.transferMethod = transformed.transferMethod;
    }

    if (config.seller.includeSellerDetails) {
      if (transformed.sellerVerified !== undefined) flat.sellerVerified = transformed.sellerVerified;
      if (transformed.sellerTransactionCount !== undefined) flat.sellerTransactionCount = transformed.sellerTransactionCount;
    }

    // Trust signal extras (heavy mode adds these fields)
    if (transformed.sellerTrustBadge) flat.sellerTrustBadge = transformed.sellerTrustBadge;
    if (transformed.sellerReputation) flat.sellerReputation = transformed.sellerReputation;
    if (transformed.sellerRatingLabel) flat.sellerRatingLabel = transformed.sellerRatingLabel;

    if (config.scores.includeDealFlags && transformed.dealFlags) {
      flat.dealFlags = transformed.dealFlags;
    }

    // Urgency text
    if (transformed.urgencyText) flat.urgencyText = transformed.urgencyText;

    // Original price / discount
    if (transformed.originalPrice !== undefined) flat.originalPrice = transformed.originalPrice;
    if (transformed.originalPriceFormatted !== undefined) flat.originalPriceFormatted = transformed.originalPriceFormatted;
    if (transformed.discountPercent !== undefined) flat.discountPercent = transformed.discountPercent;

    return flat;
  }
  
  return transformed;
}

// API Routes

// Get configuration
app.get('/api/config', async (req, res) => {
  res.json(await loadConfig());
});

// Update configuration
app.post('/api/config', async (req, res) => {
  const currentConfig = await loadConfig();
  const body = req.body;
  const incoming = body;
  const newConfig = {
    pricing:  { ...currentConfig.pricing,  ...(incoming.pricing || {}) },
    scores:   { ...currentConfig.scores,   ...(incoming.scores || {}) },
    demand:   { ...currentConfig.demand,   ...(incoming.demand || {}) },
    seller:   { ...currentConfig.seller,   ...(incoming.seller || {}) },
    content:  { ...currentConfig.content,  ...(incoming.content || {}) },
    api:      { ...currentConfig.api,      ...(incoming.api || {}) },
    behavior: { ...currentConfig.behavior, ...(incoming.behavior || {}) },
  };
  await saveConfig(newConfig);
  res.json(newConfig);
});

// Get available scenarios
app.get('/api/scenarios', async (req, res) => {
  try {
    const db = getDB();
    const scenarios = await db.collection('scenarios').find().toArray();
    res.json(scenarios.map(({ _id, ...s }) => s));
  } catch (error) {
    console.error('Error loading scenarios:', error);
    res.json([]);
  }
});

// Load a scenario by name
app.post('/api/scenarios/load', async (req, res) => {
  const { name } = req.body;
  try {
    const db = getDB();
    const scenario = await db.collection('scenarios').findOne({ name });
    if (!scenario || !scenario.config) {
      return res.status(404).json({ error: 'Scenario not found' });
    }
    const fullConfig = {
      pricing:  { ...DEFAULT_CONFIG.pricing,  ...(scenario.config.pricing  || {}) },
      scores:   { ...DEFAULT_CONFIG.scores,   ...(scenario.config.scores   || {}) },
      demand:   { ...DEFAULT_CONFIG.demand,   ...(scenario.config.demand   || {}) },
      seller:   { ...DEFAULT_CONFIG.seller,   ...(scenario.config.seller   || {}) },
      content:  { ...DEFAULT_CONFIG.content,  ...(scenario.config.content  || {}) },
      api:      { ...DEFAULT_CONFIG.api,      ...(scenario.config.api      || {}) },
      behavior: { ...DEFAULT_CONFIG.behavior, ...(scenario.config.behavior || {}) },
    };
    await saveConfig(fullConfig);
    res.json(fullConfig);
  } catch (error) {
    console.error('Error loading scenario:', error);
    res.status(500).json({ error: 'Failed to load scenario' });
  }
});

// Get all events
app.get('/api/events', async (req, res) => {
  const { config, experimentId, variantId } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const events = await getEvents();
  const allListings = await getAllListings();
  const transformed = events.map(event => transformEvent(event, config, allListings));
  res.json(transformed);
});

// Get single event
app.get('/api/events/:id', async (req, res) => {
  const { config, experimentId, variantId } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const event = await getEventById(req.params.id);
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const allListings = await getAllListings();
  const transformed = transformEvent(event, config, allListings);
  const listingsCount = allListings.filter(l => l.eventId === event.id).length;
  transformed.listingsCount = listingsCount;
  res.json(transformed);
});

// Get listings for an event
app.get('/api/events/:id/listings', async (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const eventId = parseInt(req.params.id);
  // Apply listing overrides to raw data before filtering/sorting
  let listings = (await getListingsForEvent(eventId))
    .map(l => applyListingOverrides(l, listingOverrides));

  // Apply filters (using overridden prices)
  if (req.query.minPrice) {
    const minPrice = parseFloat(req.query.minPrice);
    listings = listings.filter(l => l.pricePerTicket >= minPrice);
  }
  if (req.query.maxPrice) {
    const maxPrice = parseFloat(req.query.maxPrice);
    listings = listings.filter(l => l.pricePerTicket <= maxPrice);
  }
  if (req.query.section) {
    listings = listings.filter(l => l.section === req.query.section);
  }
  if (req.query.deliveryMethod) {
    listings = listings.filter(l => l.deliveryMethod === req.query.deliveryMethod);
  }

  // Apply sorting
  const sort = req.query.sort || config.api.defaultSort || 'price_asc';
  switch (sort) {
    case 'price_asc':
      listings.sort((a, b) => a.pricePerTicket - b.pricePerTicket);
      break;
    case 'price_desc':
      listings.sort((a, b) => b.pricePerTicket - a.pricePerTicket);
      break;
    case 'section':
      listings.sort((a, b) => a.section.localeCompare(b.section));
      break;
    case 'quantity':
      listings.sort((a, b) => b.quantity - a.quantity);
      break;
    case 'deal_score':
      listings.sort((a, b) => {
        const aScore = calculateDealScore(a, listings, config);
        const bScore = calculateDealScore(b, listings, config);
        return bScore - aScore;
      });
      break;
    case 'value_score':
      listings.sort((a, b) => {
        const aScore = calculateValueScore(a, listings);
        const bScore = calculateValueScore(b, listings);
        return bScore - aScore;
      });
      break;
  }

  const transformed = listings.map(listing => transformListing(listing, config, listings, listingOverrides));
  res.json(transformed);
});

// Get single listing
app.get('/api/listings/:id', async (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const listing = await getListingById(req.params.id);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  // Apply overrides to peer listings so relative scores use overridden prices
  const eventListings = (await getListingsForEvent(listing.eventId))
    .map(l => applyListingOverrides(l, listingOverrides));
  const transformed = transformListing(listing, config, eventListings, listingOverrides);
  const event = await getEventById(listing.eventId);
  const allListings = await getAllListings();
  transformed.event = transformEvent(event, config, allListings);
  res.json(transformed);
});

// Get raw (base) listings for an event — no overrides applied, for admin comparison
app.get('/api/events/:id/listings/raw', async (req, res) => {
  const eventId = parseInt(req.params.id);
  const listings = await getListingsForEvent(eventId);
  res.json(listings.map(l => ({
    id: l.id,
    section: l.section,
    row: l.row,
    pricePerTicket: l.pricePerTicket,
    fees: l.fees,
    quantity: l.quantity,
    sellerName: l.sellerName,
    sellerRating: l.sellerRating,
    demandLevel: l.demandLevel,
    viewCount: l.viewCount,
    viewsLast24h: l.viewsLast24h,
  })));
});

// Update listing image
app.put('/api/listings/:id/image', async (req, res) => {
  const listingId = parseInt(req.params.id);
  const { imageUrl } = req.body;

  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }

  const db = getDB();
  const result = await db.collection('listings').findOneAndUpdate(
    { id: listingId },
    { $set: { imageUrl } },
    { returnDocument: 'after' }
  );
  if (!result) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  res.json({ success: true, listing: result });
});

// Update listing notes
app.put('/api/listings/:id/notes', async (req, res) => {
  const listingId = parseInt(req.params.id);
  const { notes } = req.body;

  if (!Array.isArray(notes)) {
    return res.status(400).json({ error: 'notes must be an array' });
  }

  const cleanNotes = notes.filter(note => note && note.trim() !== '');
  const db = getDB();
  const result = await db.collection('listings').findOneAndUpdate(
    { id: listingId },
    { $set: { notes: cleanNotes } },
    { returnDocument: 'after' }
  );
  if (!result) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  res.json({ success: true, listing: result });
});

// Search events
app.get('/api/search', async (req, res) => {
  const { config, experimentId, variantId } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const query = (req.query.q || '').toLowerCase();
  const events = await getEvents();
  const filtered = events.filter(event =>
    event.title.toLowerCase().includes(query) ||
    event.artist.toLowerCase().includes(query) ||
    event.venue.name.toLowerCase().includes(query) ||
    event.category.toLowerCase().includes(query)
  );
  res.json(filtered.map(event => transformEvent(event, config)));
});

// Shopping cart operations (scoped per session)
let carts = {}; // { [sessionId]: { [listingId]: quantity } }

function getCartForSession(sessionId) {
  if (!carts[sessionId]) carts[sessionId] = {};
  return carts[sessionId];
}

app.get('/api/cart', async (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = await resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const cart = getCartForSession(req.sessionId);
  const cartItems = [];
  for (const [listingId, quantity] of Object.entries(cart)) {
    const listing = await getListingById(listingId);
    if (!listing) continue;
    const eventListings = (await getListingsForEvent(listing.eventId))
      .map(l => applyListingOverrides(l, listingOverrides));
    const event = await getEventById(listing.eventId);
    const allListings = await getAllListings();
    cartItems.push({
      listingId: parseInt(listingId),
      quantity,
      listing: transformListing(listing, config, eventListings, listingOverrides),
      event: transformEvent(event, config, allListings)
    });
  }
  res.json(cartItems);
});

app.post('/api/cart', async (req, res) => {
  const { listingId, quantity } = req.body;

  if (!listingId || !quantity) {
    return res.status(400).json({ error: 'listingId and quantity are required' });
  }

  const listing = await getListingById(listingId);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  if (quantity > listing.quantity) {
    return res.status(400).json({ error: 'Quantity exceeds available tickets' });
  }

  const cart = getCartForSession(req.sessionId);
  if (!cart[listingId]) {
    cart[listingId] = 0;
  }
  cart[listingId] += quantity;

  if (cart[listingId] > listing.quantity) {
    cart[listingId] = listing.quantity;
  }

  res.json({ listingId, quantity: cart[listingId] });
});

app.delete('/api/cart/:listingId', (req, res) => {
  const cart = getCartForSession(req.sessionId);
  delete cart[req.params.listingId];
  res.json({ success: true });
});

// Get request logs
app.get('/api/logs', (req, res) => {
  const limit = parseInt(req.query.limit) || 100;
  const agentOnly = req.query.agentOnly === 'true';
  const path = req.query.path;
  const method = req.query.method;
  const statusCode = req.query.statusCode;
  const search = req.query.search; // Search in path, user-agent, etc.
  
  let logs = [...requestLogs].reverse(); // Most recent first
  
  // Filter by agent requests if requested
  if (agentOnly) {
    logs = logs.filter(log => log.isAgent);
  }
  
  // Filter by path if provided
  if (path) {
    logs = logs.filter(log => log.path.includes(path));
  }
  
  // Filter by method if provided
  if (method) {
    logs = logs.filter(log => log.method === method.toUpperCase());
  }
  
  // Filter by status code if provided
  if (statusCode) {
    logs = logs.filter(log => log.statusCode === parseInt(statusCode));
  }
  
  // Search filter
  if (search) {
    const searchLower = search.toLowerCase();
    logs = logs.filter(log => 
      log.path.toLowerCase().includes(searchLower) ||
      (log.headers['user-agent'] || '').toLowerCase().includes(searchLower) ||
      JSON.stringify(log.query || {}).toLowerCase().includes(searchLower)
    );
  }
  
  // Apply limit
  logs = logs.slice(0, limit);
  
  res.json({
    total: requestLogs.length,
    filtered: logs.length,
    logs: logs
  });
});

// Export logs as JSON
app.get('/api/logs/export/json', (req, res) => {
  const agentOnly = req.query.agentOnly === 'true';
  let logs = [...requestLogs].reverse();
  
  if (agentOnly) {
    logs = logs.filter(log => log.isAgent);
  }
  
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="request-logs-${new Date().toISOString().split('T')[0]}.json"`);
  res.json(logs);
});

// Export logs as CSV
app.get('/api/logs/export/csv', (req, res) => {
  const agentOnly = req.query.agentOnly === 'true';
  let logs = [...requestLogs].reverse();
  
  if (agentOnly) {
    logs = logs.filter(log => log.isAgent);
  }
  
  // CSV headers
  const headers = ['Timestamp', 'Method', 'Path', 'Status Code', 'Duration (ms)', 'Is Agent', 'User Agent', 'IP', 'Response Size'];
  const rows = logs.map(log => [
    log.timestamp,
    log.method,
    log.path,
    log.statusCode,
    log.duration,
    log.isAgent ? 'Yes' : 'No',
    (log.headers['user-agent'] || '').replace(/,/g, ';'), // Replace commas in user agent
    log.ip,
    log.responseSize || 0
  ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="request-logs-${new Date().toISOString().split('T')[0]}.csv"`);
  res.send(csv);
});

// Get log statistics
app.get('/api/logs/stats', (req, res) => {
  const totalRequests = requestLogs.length;
  const agentRequests = requestLogs.filter(log => log.isAgent).length;
  const recentLogs = requestLogs.slice(-100); // Last 100 requests
  
  const statusCodes = {};
  const methods = {};
  const paths = {};
  const agents = {};
  
  recentLogs.forEach(log => {
    statusCodes[log.statusCode] = (statusCodes[log.statusCode] || 0) + 1;
    methods[log.method] = (methods[log.method] || 0) + 1;
    paths[log.path] = (paths[log.path] || 0) + 1;
    
    if (log.isAgent) {
      const ua = log.headers['user-agent'] || 'unknown';
      agents[ua] = (agents[ua] || 0) + 1;
    }
  });
  
  res.json({
    total: totalRequests,
    agentRequests: agentRequests,
    regularRequests: totalRequests - agentRequests,
    agentPercentage: totalRequests > 0 ? ((agentRequests / totalRequests) * 100).toFixed(2) : 0,
    recentStats: {
      statusCodes,
      methods,
      topPaths: Object.entries(paths)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([path, count]) => ({ path, count })),
      topAgents: Object.entries(agents)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([agent, count]) => ({ agent, count }))
    }
  });
});

// Clear logs (optional - for testing)
app.delete('/api/logs', (req, res) => {
  requestLogs = [];
  if (existsSync(LOG_FILE)) {
    writeFileSync(LOG_FILE, '');
  }
  res.json({ success: true, message: 'Logs cleared' });
});

// ========== Session API Routes ==========

// Session stats (must be before /api/sessions/:id)
app.get('/api/sessions/stats', (req, res) => {
  const allSessions = [...sessions.values()];
  const now = Date.now();
  const activeSessions = allSessions.filter(s => now - new Date(s.lastActivity).getTime() <= SESSION_TIMEOUT_MS);
  const agentSessions = allSessions.filter(s => s.isAgent);
  const avgRequestCount = allSessions.length > 0
    ? Math.round(allSessions.reduce((sum, s) => sum + s.requestCount, 0) / allSessions.length)
    : 0;
  const avgDurationMs = allSessions.length > 0
    ? Math.round(allSessions.reduce((sum, s) => sum + (new Date(s.lastActivity) - new Date(s.startTime)), 0) / allSessions.length)
    : 0;

  // Top paths across all sessions
  const pathCounts = {};
  allSessions.forEach(s => s.pagesVisited.forEach(p => { pathCounts[p] = (pathCounts[p] || 0) + 1; }));
  const topPaths = Object.entries(pathCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([path, count]) => ({ path, count }));

  res.json({
    total: allSessions.length,
    agentSessions: agentSessions.length,
    regularSessions: allSessions.length - agentSessions.length,
    activeSessions: activeSessions.length,
    avgRequestCount,
    avgDurationMs,
    topPaths
  });
});

// List sessions
app.get('/api/sessions', (req, res) => {
  let result = [...sessions.values()];
  const now = Date.now();

  // Filters
  if (req.query.agentOnly === 'true') {
    result = result.filter(s => s.isAgent);
  }
  if (req.query.activeOnly === 'true') {
    result = result.filter(s => now - new Date(s.lastActivity).getTime() <= SESSION_TIMEOUT_MS);
  }
  if (req.query.search) {
    const q = req.query.search.toLowerCase();
    result = result.filter(s =>
      s.id.toLowerCase().includes(q) ||
      s.userAgent.toLowerCase().includes(q) ||
      s.ip.includes(q) ||
      s.pagesVisited.some(p => p.toLowerCase().includes(q))
    );
  }

  // Sort by most recent activity
  result.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

  // Pagination
  const limit = parseInt(req.query.limit || '50', 10);
  const offset = parseInt(req.query.offset || '0', 10);
  const total = result.length;
  result = result.slice(offset, offset + limit);

  res.json({ total, sessions: result });
});

// Get single session with full request trail
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Look up the actual log entries for this session
  const requestIdSet = new Set(session.requestIds);
  let requests = requestLogs.filter(log => requestIdSet.has(log.id) || log.sessionId === session.id);

  // Sort chronologically
  requests.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  res.json({ session, requests });
});

// Clear all sessions
app.delete('/api/sessions', (req, res) => {
  sessions.clear();
  if (existsSync(SESSIONS_FILE)) {
    writeFileSync(SESSIONS_FILE, '[]');
  }
  res.json({ success: true, message: 'Sessions cleared' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Ticket Marketplace API',
    version: '1.0.0',
    status: 'running',
    environment: NODE_ENV,
    endpoints: {
      health: '/health',
      config: '/api/config',
      events: '/api/events',
      scenarios: '/api/scenarios',
      logs: '/api/logs',
      sessions: '/api/sessions',
      experiments: '/api/experiments'
    },
    documentation: 'See /health for service status'
  });
});

// ========== Admin Data Generation ==========

// Generate new listings for an existing event
app.post('/api/admin/generate-listings/:eventId', async (req, res) => {
  try {
    const db = getDB();
    const eventId = parseInt(req.params.eventId);
    const event = await db.collection('events').findOne({ id: eventId });
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const basePrice = EVENT_DEFINITIONS.find(e => e.id === eventId)?.basePrice || 100;
    const newListings = generateListingsForEvent(eventId, basePrice);

    // Offset IDs to avoid collisions with existing listings
    const maxListing = await db.collection('listings').find({ eventId }).sort({ id: -1 }).limit(1).toArray();
    const startId = maxListing.length > 0 ? maxListing[0].id + 1 : eventId * 1000 + 1;
    newListings.forEach((l, i) => { l.id = startId + i; });

    await db.collection('listings').insertMany(newListings);
    res.json({ generated: newListings.length, eventId, startId });
  } catch (error) {
    console.error('Error generating listings:', error);
    res.status(500).json({ error: 'Failed to generate listings' });
  }
});

// Reseed all events and listings (destructive)
app.post('/api/admin/reseed', async (req, res) => {
  try {
    const db = getDB();
    const { generateEvents, generateAllListings } = await import('./data/generators.js');

    await db.collection('events').deleteMany({});
    await db.collection('listings').deleteMany({});

    const events = generateEvents();
    const listings = generateAllListings();

    await db.collection('events').insertMany(events);
    await db.collection('listings').insertMany(listings);

    res.json({ events: events.length, listings: listings.length });
  } catch (error) {
    console.error('Error reseeding:', error);
    res.status(500).json({ error: 'Failed to reseed' });
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  try {
    await getDB().command({ ping: 1 });
    res.status(200).json({
      status: 'ok',
      db: 'connected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: process.uptime()
    });
  } catch (e) {
    res.status(503).json({
      status: 'degraded',
      db: 'disconnected',
      timestamp: new Date().toISOString(),
      environment: NODE_ENV,
      uptime: process.uptime()
    });
  }
});

// Start server with DB connection
async function startServer() {
  try {
    await connectDB();

    // Initialize experiments module
    initExperiments({
      sessions,
      requestLogs,
      loadConfig,
      getGlobalListingOverrides,
      logsDir: LOGS_DIR,
      configDir: join(__dirname, 'config')
    });

    // Initialize listing overrides module
    initListingOverrides();

    app.listen(PORT, () => {
      console.log(`Backend server running on port ${PORT}`);
      console.log(`Environment: ${NODE_ENV}`);
      if (NODE_ENV === 'development') {
        console.log(`Request logs available at http://localhost:${PORT}/api/logs`);
        console.log(`Log statistics at http://localhost:${PORT}/api/logs/stats`);
        console.log(`Sessions at http://localhost:${PORT}/api/sessions`);
      }
      console.log(`Health check: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
