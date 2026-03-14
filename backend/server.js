import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import experimentsRouter, { initExperiments, resolveExperimentConfig, getActiveExperiment } from './experiments.js';
import listingOverridesRouter, { initListingOverrides, setListingOverridesListings, getGlobalListingOverrides, applyListingOverrides } from './listingOverrides.js';

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

// Configuration management
// In Docker, server.js is at /app/server.js, so use /app/config (not ../config)
const CONFIG_PATH = join(__dirname, 'config/active.json');
const DEFAULT_CONFIG = {
  pricing: {
    format: 'currency_symbol',        // 'currency_symbol' | 'currency_code' | 'number_only'
    currency: 'USD',                   // 'USD' | 'EUR' | 'GBP'
    feeVisibility: 'breakdown',        // 'hidden' | 'total_only' | 'breakdown' | 'included_in_price'
    showOriginalPrice: false,          // show "was $X" based on price history
    fabricatedDiscount: false,         // inject fake inflated "original" prices
  },
  scores: {
    includeDealScore: true,
    includeValueScore: true,
    includeDealFlags: true,
    dealFlagsInfluenceScore: true,     // when false, dealFlags don't boost dealScore
    includeSavings: true,              // savingsAmount, savingsPercent
    includeRelativeValue: true,        // priceVsMedian, priceVsSimilarSeats
    scoreContradictions: false,        // invert scores for testing
  },
  demand: {
    includeViewCounts: true,
    includeSoldData: true,
    includePriceTrend: true,
    includeDemandLevel: true,
    urgencyLanguage: 'moderate',       // 'none' | 'subtle' | 'moderate' | 'aggressive'
    includePriceHistory: true,
  },
  seller: {
    includeSellerDetails: true,
    includeRefundPolicy: true,
    includeTransferMethod: true,
    trustSignals: 'standard',          // 'none' | 'minimal' | 'standard' | 'heavy'
  },
  content: {
    eventDescriptions: 'detailed',
    venueInfo: 'full',
    includeBundleOptions: true,
    includePremiumFeatures: true,
    buttonText: 'Buy Now',
  },
  api: {
    responseFormat: 'nested',
    dateFormat: 'MM/DD/YYYY',
    defaultSort: 'price_asc',
    includeSeatQuality: true,
  },
  behavior: {
    latencyMs: 0,
    errorRate: 0,
    crossEndpointConsistency: true,
    cartExpirationSeconds: 0,
  },
};

// Migrate old 3-section config to new 7-section schema
function migrateConfig(oldConfig) {
  const migrated = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

  if (oldConfig.ui) {
    if (oldConfig.ui.priceFormat !== undefined) migrated.pricing.format = oldConfig.ui.priceFormat;
    if (oldConfig.ui.currency !== undefined) migrated.pricing.currency = oldConfig.ui.currency;
    if (oldConfig.ui.dateFormat !== undefined) migrated.api.dateFormat = oldConfig.ui.dateFormat;
    if (oldConfig.ui.buttonText !== undefined) migrated.content.buttonText = oldConfig.ui.buttonText;
  }

  if (oldConfig.api) {
    if (oldConfig.api.includeFees !== undefined) {
      migrated.pricing.feeVisibility = oldConfig.api.includeFees ? 'breakdown' : 'hidden';
    }
    if (oldConfig.api.responseFormat !== undefined) migrated.api.responseFormat = oldConfig.api.responseFormat;
    if (oldConfig.api.includeDealScore !== undefined) migrated.scores.includeDealScore = oldConfig.api.includeDealScore;
    if (oldConfig.api.includeValueScore !== undefined) migrated.scores.includeValueScore = oldConfig.api.includeValueScore;
    if (oldConfig.api.includeSavingsInfo !== undefined) migrated.scores.includeSavings = oldConfig.api.includeSavingsInfo;
    if (oldConfig.api.includeRelativeValue !== undefined) migrated.scores.includeRelativeValue = oldConfig.api.includeRelativeValue;
    if (oldConfig.api.includeDealFlags !== undefined) migrated.scores.includeDealFlags = oldConfig.api.includeDealFlags;
    if (oldConfig.api.includePriceHistory !== undefined) migrated.demand.includePriceHistory = oldConfig.api.includePriceHistory;
    if (oldConfig.api.includeDemandIndicators !== undefined) {
      const val = oldConfig.api.includeDemandIndicators;
      migrated.demand.includeViewCounts = val;
      migrated.demand.includeSoldData = val;
      migrated.demand.includePriceTrend = val;
      migrated.demand.includeDemandLevel = val;
    }
    if (oldConfig.api.includeBundleOptions !== undefined) migrated.content.includeBundleOptions = oldConfig.api.includeBundleOptions;
    if (oldConfig.api.includePremiumFeatures !== undefined) migrated.content.includePremiumFeatures = oldConfig.api.includePremiumFeatures;
    if (oldConfig.api.includeRefundPolicy !== undefined) migrated.seller.includeRefundPolicy = oldConfig.api.includeRefundPolicy;
    if (oldConfig.api.includeTransferMethod !== undefined) migrated.seller.includeTransferMethod = oldConfig.api.includeTransferMethod;
    if (oldConfig.api.includeSellerDetails !== undefined) migrated.seller.includeSellerDetails = oldConfig.api.includeSellerDetails;
  }

  if (oldConfig.content) {
    if (oldConfig.content.eventDescriptions !== undefined) migrated.content.eventDescriptions = oldConfig.content.eventDescriptions;
    if (oldConfig.content.venueInfo !== undefined) migrated.content.venueInfo = oldConfig.content.venueInfo;
  }

  return migrated;
}

// Migrate old-schema experiment overrides (partial/sparse objects)
function migrateOverrides(oldOverrides) {
  const migrated = {};

  if (oldOverrides.ui) {
    if (oldOverrides.ui.priceFormat !== undefined) {
      migrated.pricing = migrated.pricing || {};
      migrated.pricing.format = oldOverrides.ui.priceFormat;
    }
    if (oldOverrides.ui.currency !== undefined) {
      migrated.pricing = migrated.pricing || {};
      migrated.pricing.currency = oldOverrides.ui.currency;
    }
    if (oldOverrides.ui.dateFormat !== undefined) {
      migrated.api = migrated.api || {};
      migrated.api.dateFormat = oldOverrides.ui.dateFormat;
    }
    if (oldOverrides.ui.buttonText !== undefined) {
      migrated.content = migrated.content || {};
      migrated.content.buttonText = oldOverrides.ui.buttonText;
    }
  }

  if (oldOverrides.api) {
    if (oldOverrides.api.includeFees !== undefined) {
      migrated.pricing = migrated.pricing || {};
      migrated.pricing.feeVisibility = oldOverrides.api.includeFees ? 'breakdown' : 'hidden';
    }
    if (oldOverrides.api.responseFormat !== undefined) {
      migrated.api = migrated.api || {};
      migrated.api.responseFormat = oldOverrides.api.responseFormat;
    }
    if (oldOverrides.api.includeDealScore !== undefined) {
      migrated.scores = migrated.scores || {};
      migrated.scores.includeDealScore = oldOverrides.api.includeDealScore;
    }
    if (oldOverrides.api.includeValueScore !== undefined) {
      migrated.scores = migrated.scores || {};
      migrated.scores.includeValueScore = oldOverrides.api.includeValueScore;
    }
    if (oldOverrides.api.includeSavingsInfo !== undefined) {
      migrated.scores = migrated.scores || {};
      migrated.scores.includeSavings = oldOverrides.api.includeSavingsInfo;
    }
    if (oldOverrides.api.includeRelativeValue !== undefined) {
      migrated.scores = migrated.scores || {};
      migrated.scores.includeRelativeValue = oldOverrides.api.includeRelativeValue;
    }
    if (oldOverrides.api.includeDealFlags !== undefined) {
      migrated.scores = migrated.scores || {};
      migrated.scores.includeDealFlags = oldOverrides.api.includeDealFlags;
    }
    if (oldOverrides.api.includePriceHistory !== undefined) {
      migrated.demand = migrated.demand || {};
      migrated.demand.includePriceHistory = oldOverrides.api.includePriceHistory;
    }
    if (oldOverrides.api.includeDemandIndicators !== undefined) {
      migrated.demand = migrated.demand || {};
      const val = oldOverrides.api.includeDemandIndicators;
      migrated.demand.includeViewCounts = val;
      migrated.demand.includeSoldData = val;
      migrated.demand.includePriceTrend = val;
      migrated.demand.includeDemandLevel = val;
    }
    if (oldOverrides.api.includeBundleOptions !== undefined) {
      migrated.content = migrated.content || {};
      migrated.content.includeBundleOptions = oldOverrides.api.includeBundleOptions;
    }
    if (oldOverrides.api.includePremiumFeatures !== undefined) {
      migrated.content = migrated.content || {};
      migrated.content.includePremiumFeatures = oldOverrides.api.includePremiumFeatures;
    }
    if (oldOverrides.api.includeRefundPolicy !== undefined) {
      migrated.seller = migrated.seller || {};
      migrated.seller.includeRefundPolicy = oldOverrides.api.includeRefundPolicy;
    }
    if (oldOverrides.api.includeTransferMethod !== undefined) {
      migrated.seller = migrated.seller || {};
      migrated.seller.includeTransferMethod = oldOverrides.api.includeTransferMethod;
    }
    if (oldOverrides.api.includeSellerDetails !== undefined) {
      migrated.seller = migrated.seller || {};
      migrated.seller.includeSellerDetails = oldOverrides.api.includeSellerDetails;
    }
  }

  if (oldOverrides.content) {
    if (oldOverrides.content.eventDescriptions !== undefined) {
      migrated.content = migrated.content || {};
      migrated.content.eventDescriptions = oldOverrides.content.eventDescriptions;
    }
    if (oldOverrides.content.venueInfo !== undefined) {
      migrated.content = migrated.content || {};
      migrated.content.venueInfo = oldOverrides.content.venueInfo;
    }
  }

  return migrated;
}

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const data = readFileSync(CONFIG_PATH, 'utf8');
      const savedConfig = JSON.parse(data);
      // Detect old schema and migrate — trigger on old ui section OR missing all new sections
      const hasNewSchema = savedConfig.pricing || savedConfig.scores || savedConfig.demand || savedConfig.seller;
      if (savedConfig.ui || !hasNewSchema) {
        const migrated = migrateConfig(savedConfig);
        saveConfig(migrated);
        return migrated;
      }
      return {
        pricing:  { ...DEFAULT_CONFIG.pricing,  ...(savedConfig.pricing || {}) },
        scores:   { ...DEFAULT_CONFIG.scores,   ...(savedConfig.scores || {}) },
        demand:   { ...DEFAULT_CONFIG.demand,   ...(savedConfig.demand || {}) },
        seller:   { ...DEFAULT_CONFIG.seller,   ...(savedConfig.seller || {}) },
        content:  { ...DEFAULT_CONFIG.content,  ...(savedConfig.content || {}) },
        api:      { ...DEFAULT_CONFIG.api,      ...(savedConfig.api || {}) },
        behavior: { ...DEFAULT_CONFIG.behavior, ...(savedConfig.behavior || {}) },
      };
    } catch (error) {
      console.error('Error loading config:', error);
      return DEFAULT_CONFIG;
    }
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Initialize experiments module
initExperiments({
  sessions,
  requestLogs,
  loadConfig,
  migrateConfig,
  migrateOverrides,
  getGlobalListingOverrides,
  logsDir: LOGS_DIR,
  configDir: join(__dirname, 'config')
});
app.use(experimentsRouter);

// listingOverrides init is deferred — mockListings isn't defined yet at this point
// We init the file path now and set the listings reference later
initListingOverrides({ logsDir: LOGS_DIR, listings: null });
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

// Mock event data (NO prices or availability)
const mockEvents = [
  {
    id: 1,
    title: 'Taylor Swift: The Eras Tour',
    artist: 'Taylor Swift',
    date: '2024-06-15',
    time: '19:00',
    venue: {
      name: 'Madison Square Garden',
      address: '4 Pennsylvania Plaza, New York, NY 10001',
      city: 'New York',
      state: 'NY'
    },
    category: 'Concert',
    description: 'Experience the magic of Taylor Swift\'s Eras Tour featuring songs from all her iconic albums.'
  },
  {
    id: 2,
    title: 'Hamilton - Broadway',
    artist: 'Lin-Manuel Miranda',
    date: '2024-07-20',
    time: '20:00',
    venue: {
      name: 'Richard Rodgers Theatre',
      address: '226 W 46th St, New York, NY 10036',
      city: 'New York',
      state: 'NY'
    },
    category: 'Theater',
    description: 'The revolutionary musical about Alexander Hamilton and the founding of America.'
  },
  {
    id: 3,
    title: 'Los Angeles Lakers vs Golden State Warriors',
    artist: 'NBA',
    date: '2024-08-10',
    time: '19:30',
    venue: {
      name: 'Crypto.com Arena',
      address: '1111 S Figueroa St, Los Angeles, CA 90015',
      city: 'Los Angeles',
      state: 'CA'
    },
    category: 'Sports',
    description: 'Watch the Lakers take on the Warriors in this highly anticipated matchup.'
  },
  {
    id: 4,
    title: 'Ed Sheeran: + - = ÷ x Tour',
    artist: 'Ed Sheeran',
    date: '2024-09-05',
    time: '20:00',
    venue: {
      name: 'Wembley Stadium',
      address: 'Wembley, London HA9 0WS, UK',
      city: 'London',
      state: ''
    },
    category: 'Concert',
    description: 'Ed Sheeran performs his greatest hits in this spectacular stadium show.'
  },
  {
    id: 5,
    title: 'The Phantom of the Opera',
    artist: 'Andrew Lloyd Webber',
    date: '2024-10-12',
    time: '19:30',
    venue: {
      name: 'Majestic Theatre',
      address: '245 W 44th St, New York, NY 10036',
      city: 'New York',
      state: 'NY'
    },
    category: 'Theater',
    description: 'The longest-running show in Broadway history, featuring the iconic music of Andrew Lloyd Webber.'
  },
  {
    id: 6,
    title: 'Boston Celtics vs Miami Heat',
    artist: 'NBA',
    date: '2024-11-20',
    time: '20:00',
    venue: {
      name: 'TD Garden',
      address: '100 Legends Way, Boston, MA 02114',
      city: 'Boston',
      state: 'MA'
    },
    category: 'Sports',
    description: 'Eastern Conference rivalry game between the Celtics and Heat.'
  }
];

// Helper function to determine stadium zone from section
function getStadiumZone(section) {
  const sectionLower = section.toLowerCase();
  if (sectionLower.includes('floor') || sectionLower.includes('premium') || sectionLower.match(/section\s*(1[0-2][0-9]|0[1-9][0-9])/)) {
    return 'lower_bowl';
  }
  if (sectionLower.includes('club')) {
    return 'club';
  }
  if (sectionLower.match(/section\s*(2[0-4][0-9]|2[0-9][0-9])/) || sectionLower.includes('mezz')) {
    return 'mezzanine';
  }
  if (sectionLower.match(/section\s*(3[0-9][0-9]|4[0-9][0-9])/) || sectionLower.includes('upper')) {
    return 'upper_deck';
  }
  return 'lower_bowl'; // default
}

// Helper function to determine field proximity score (1-10)
function getFieldProximity(section, row) {
  const zone = getStadiumZone(section);
  const rowNum = parseInt(row) || (row.charCodeAt(0) - 64); // Convert letter rows to numbers
  
  let baseScore = 5;
  if (zone === 'lower_bowl') baseScore = 8;
  else if (zone === 'club') baseScore = 7;
  else if (zone === 'mezzanine') baseScore = 5;
  else if (zone === 'upper_deck') baseScore = 3;
  
  // Adjust based on row (lower row numbers = closer)
  if (rowNum <= 5) baseScore += 1;
  else if (rowNum >= 20) baseScore -= 1;
  
  return Math.max(1, Math.min(10, baseScore));
}

// Helper function to determine seat type
function getSeatType(section, row, notes) {
  const sectionLower = section.toLowerCase();
  const notesLower = (notes || []).join(' ').toLowerCase();
  
  if (sectionLower.includes('standing') || notesLower.includes('standing room')) {
    return 'standing_room';
  }
  if (notesLower.includes('obstructed') || notesLower.includes('limited view')) {
    return 'obstructed_view';
  }
  if (notesLower.includes('aisle')) {
    return 'aisle';
  }
  return 'seated';
}

// Helper function to determine seat location
function getSeatLocation(seats, section) {
  if (seats.length === 0) return 'unknown';
  const firstSeat = seats[0];
  const lastSeat = seats[seats.length - 1];
  
  // Assume seats 1-10 are aisle, 20-40 are mid-row, 1-5 or 45-50 are corner
  if (firstSeat <= 5 || lastSeat >= 45) return 'corner';
  if (firstSeat <= 10 || lastSeat >= 40) return 'aisle';
  if (firstSeat >= 20 && lastSeat <= 30) return 'center';
  return 'mid-row';
}

// Helper function to generate deal flags
function generateDealFlags(pricePerTicket, basePrice, section, notes) {
  const flags = [];
  const priceRatio = pricePerTicket / basePrice;
  
  if (priceRatio < 0.7) flags.push('great_deal');
  if (priceRatio < 0.6) flags.push('fantastic_value');
  if (priceRatio < 0.8 && getStadiumZone(section) === 'lower_bowl') flags.push('best_value');
  if (Math.random() < 0.2) flags.push('featured');
  if (notes && notes.some(n => n.toLowerCase().includes('clear'))) flags.push('clear_view');
  if (notes && notes.some(n => n.toLowerCase().includes('aisle'))) flags.push('aisle_seat');
  if (Math.random() < 0.15) flags.push('selling_fast');
  
  return flags;
}

// Helper function to generate price history
function generatePriceHistory(currentPrice, listedAt) {
  const history = [];
  const listedDate = new Date(listedAt);
  const daysSinceListed = Math.floor((Date.now() - listedDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Generate history for up to 30 days, but only if listing is older than 7 days
  if (daysSinceListed >= 7) {
    for (let i = 7; i <= Math.min(daysSinceListed, 30); i += 7) {
      const date = new Date(listedDate);
      date.setDate(date.getDate() + i);
      // Price variation: ±20% over time
      const variation = 0.8 + Math.random() * 0.4;
      history.push({
        date: date.toISOString(),
        price: Math.round(currentPrice * variation * 100) / 100
      });
    }
  }
  
  return history;
}

// Generate mock listings for each event
function generateListingsForEvent(eventId, basePrice) {
  const sections = [
    'Section 101', 'Section 102', 'Section 128', 'Section 205', 'Section 206',
    'Floor A', 'Floor B', 'Upper Deck', 'Lower Level',
    'Section 301', 'Section 302', 'Club Level', 'Premium Seating', 'Section 219'
  ];
  const rows = ['A', 'B', 'C', 'D', 'E', 'F', '1', '2', '3', '4', '5', '10', '15', '20', '23', '25'];
  const deliveryMethods = ['Mobile Transfer', 'E-Ticket', 'Will Call', 'Standard Mail'];
  const sellerNames = [
    'TrustedSeller123', 'TicketMaster99', 'EventPro2024', 'SecureTix',
    'VerifiedVendor', 'QuickTickets', 'ReliableResale', 'SafeSeats'
  ];
  const possibleNotes = [
    ['Great seats', 'Aisle access'],
    ['Obstructed view'],
    ['Premium location'],
    ['Center section'],
    ['Near restrooms'],
    ['VIP access', 'Backstage pass'],
    ['Wheelchair accessible'],
    ['Limited view'],
    ['Best value'],
    ['Selling fast'],
    ['Clear view'],
    [],
    [],
    []
  ];
  const transferMethods = ['mobile-only', 'instant', 'delayed', 'standard'];
  const refundPolicies = ['full_refund_7days', 'partial_refund', 'no_refund', 'exchange_only'];

  const listings = [];
  const numListings = 5 + Math.floor(Math.random() * 11); // 5-15 listings

  for (let i = 0; i < numListings; i++) {
    const section = sections[Math.floor(Math.random() * sections.length)];
    const row = rows[Math.floor(Math.random() * rows.length)];
    const numSeats = 1 + Math.floor(Math.random() * 8); // 1-8 seats
    const seats = [];
    const startSeat = 1 + Math.floor(Math.random() * 50);
    for (let j = 0; j < numSeats; j++) {
      seats.push(startSeat + j);
    }

    // Price variation: 50% to 200% of base price
    const priceMultiplier = 0.5 + Math.random() * 1.5;
    const basePriceValue = Math.round(basePrice * priceMultiplier * 100) / 100;
    
    // Fee breakdown
    const feesIncluded = Math.random() < 0.3; // 30% chance fees are included
    const serviceFee = Math.round((basePriceValue * 0.08) * 100) / 100; // 8% service fee
    const fulfillmentFee = Math.round((basePriceValue * 0.02) * 100) / 100; // 2% fulfillment
    const platformFee = Math.round((basePriceValue * 0.01) * 100) / 100; // 1% platform
    const totalFees = serviceFee + fulfillmentFee + platformFee;
    
    const pricePerTicket = feesIncluded ? basePriceValue : basePriceValue;
    const fees = feesIncluded ? 0 : totalFees;

    const sellerRating = 3.5 + Math.random() * 1.5; // 3.5 to 5.0
    const deliveryMethod = deliveryMethods[Math.floor(Math.random() * deliveryMethods.length)];
    const sellerName = sellerNames[Math.floor(Math.random() * sellerNames.length)];
    const notes = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];

    const listedAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    const listingId = eventId * 1000 + i + 1;
    const imageUrl = `https://picsum.photos/seed/listing-${listingId}/400/300`;

    // Generate additional fields
    const seatType = getSeatType(section, row, notes);
    const stadiumZone = getStadiumZone(section);
    const fieldProximity = getFieldProximity(section, row);
    const seatLocation = getSeatLocation(seats, section);
    const seatsAdjacent = seats.length > 1 && seats.every((s, idx) => idx === 0 || s === seats[idx - 1] + 1);
    const dealFlags = generateDealFlags(pricePerTicket, basePrice, section, notes);
    const priceHistory = generatePriceHistory(pricePerTicket, listedAt);
    
    // Calculate days since listed
    const daysSinceListed = Math.floor((Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24));
    const price7DaysAgo = daysSinceListed >= 7 && priceHistory.length > 0 
      ? priceHistory[0].price 
      : pricePerTicket;
    const priceChangePercent = daysSinceListed >= 7 
      ? Math.round(((pricePerTicket - price7DaysAgo) / price7DaysAgo) * 100 * 10) / 10
      : 0;

    // Real-time indicators
    const viewCount = Math.floor(Math.random() * 500) + 10;
    const viewsLast24h = Math.floor(viewCount * (0.1 + Math.random() * 0.3));
    const soldCount = Math.floor(Math.random() * 20);
    const soldRecently = Math.random() < 0.3;
    const priceTrend = priceChangePercent > 5 ? 'increasing' : priceChangePercent < -5 ? 'decreasing' : 'stable';
    const demandLevel = viewCount > 200 ? 'high' : viewCount > 100 ? 'medium' : 'low';

    // Seller information
    const sellerVerified = Math.random() < 0.7;
    const sellerTransactionCount = Math.floor(Math.random() * 500) + 10;
    const refundPolicy = refundPolicies[Math.floor(Math.random() * refundPolicies.length)];
    const transferMethod = transferMethods[Math.floor(Math.random() * transferMethods.length)];

    // Bundle options
    const bundleOptions = {};
    if (Math.random() < 0.2) bundleOptions.parking = Math.random() < 0.5 ? true : Math.round((20 + Math.random() * 30) * 100) / 100;
    if (stadiumZone === 'club' && Math.random() < 0.5) bundleOptions.clubAccess = true;
    if (Math.random() < 0.1) bundleOptions.vipAccess = true;
    if (Math.random() < 0.05) bundleOptions.backstagePass = true;
    if (Math.random() < 0.15) bundleOptions.foodCredit = Math.round((10 + Math.random() * 40) * 100) / 100;

    const premiumFeatures = [];
    if (bundleOptions.clubAccess) premiumFeatures.push('Club Lounge Access');
    if (bundleOptions.vipAccess) premiumFeatures.push('VIP Entry');
    if (bundleOptions.backstagePass) premiumFeatures.push('Backstage Pass');
    if (stadiumZone === 'club') premiumFeatures.push('Premium Seating');

    listings.push({
      id: listingId,
      eventId: eventId,
      section,
      row,
      seats,
      quantity: numSeats,
      pricePerTicket,
      basePrice: basePriceValue,
      fees,
      serviceFee,
      fulfillmentFee,
      platformFee,
      feesIncluded,
      sellerName,
      sellerRating: Math.round(sellerRating * 10) / 10,
      sellerVerified,
      sellerTransactionCount,
      deliveryMethod,
      transferMethod,
      refundPolicy,
      notes: notes,
      listedAt,
      imageUrl,
      // New fields
      seatType,
      stadiumZone,
      fieldProximity,
      rowElevation: parseInt(row) || (row.charCodeAt(0) - 64),
      seatLocation,
      seatsAdjacent,
      dealFlags,
      priceHistory,
      price7DaysAgo,
      priceChangePercent,
      viewCount,
      viewsLast24h,
      soldCount,
      soldRecently,
      priceTrend,
      demandLevel,
      bundleOptions: Object.keys(bundleOptions).length > 0 ? bundleOptions : undefined,
      premiumFeatures: premiumFeatures.length > 0 ? premiumFeatures : undefined
    });
  }

  return listings;
}

// Generate all listings
const mockListings = [
  ...generateListingsForEvent(1, 299.99), // Taylor Swift
  ...generateListingsForEvent(2, 189.50), // Hamilton
  ...generateListingsForEvent(3, 125.00), // Lakers vs Warriors
  ...generateListingsForEvent(4, 89.99),  // Ed Sheeran
  ...generateListingsForEvent(5, 150.00), // Phantom
  ...generateListingsForEvent(6, 110.00)  // Celtics vs Heat
];

// Now that mockListings exists, pass the reference to listingOverrides module
setListingOverridesListings(mockListings);

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

  // Calculate scores and relative value
  const eventListings = allListingsForEvent.length > 0
    ? allListingsForEvent
    : mockListings.filter(l => l.eventId === listing.eventId);
  
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
app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

// Update configuration
app.post('/api/config', (req, res) => {
  const currentConfig = loadConfig();
  const body = req.body;
  // If body uses old schema, migrate it first
  const incoming = (body.ui || (!body.pricing && !body.scores && Object.keys(body).length > 0))
    ? migrateConfig(body)
    : body;
  const newConfig = {
    pricing:  { ...currentConfig.pricing,  ...(incoming.pricing || {}) },
    scores:   { ...currentConfig.scores,   ...(incoming.scores || {}) },
    demand:   { ...currentConfig.demand,   ...(incoming.demand || {}) },
    seller:   { ...currentConfig.seller,   ...(incoming.seller || {}) },
    content:  { ...currentConfig.content,  ...(incoming.content || {}) },
    api:      { ...currentConfig.api,      ...(incoming.api || {}) },
    behavior: { ...currentConfig.behavior, ...(incoming.behavior || {}) },
  };
  saveConfig(newConfig);
  res.json(newConfig);
});

// Get available scenarios
app.get('/api/scenarios', (req, res) => {
  const SCENARIOS_DIR = join(__dirname, 'config/scenarios');
  try {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
    const scenarios = files.map(file => {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf8');
      return JSON.parse(content);
    });
    res.json(scenarios);
  } catch (error) {
    console.error('Error loading scenarios:', error);
    res.json([]);
  }
});

// Load a scenario by name
app.post('/api/scenarios/load', (req, res) => {
  const { name } = req.body;
  const SCENARIOS_DIR = join(__dirname, 'config/scenarios');
  try {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf8');
      const scenario = JSON.parse(content);
      if (scenario.name === name && scenario.config) {
        const currentDefaults = loadConfig();
        const fullConfig = {
          pricing:  { ...DEFAULT_CONFIG.pricing,  ...(scenario.config.pricing  || {}) },
          scores:   { ...DEFAULT_CONFIG.scores,   ...(scenario.config.scores   || {}) },
          demand:   { ...DEFAULT_CONFIG.demand,   ...(scenario.config.demand   || {}) },
          seller:   { ...DEFAULT_CONFIG.seller,   ...(scenario.config.seller   || {}) },
          content:  { ...DEFAULT_CONFIG.content,  ...(scenario.config.content  || {}) },
          api:      { ...DEFAULT_CONFIG.api,      ...(scenario.config.api      || {}) },
          behavior: { ...DEFAULT_CONFIG.behavior, ...(scenario.config.behavior || {}) },
        };
        saveConfig(fullConfig);
        res.json(fullConfig);
        return;
      }
    }
    res.status(404).json({ error: 'Scenario not found' });
  } catch (error) {
    console.error('Error loading scenario:', error);
    res.status(500).json({ error: 'Failed to load scenario' });
  }
});

// Get all events
app.get('/api/events', (req, res) => {
  const { config, experimentId, variantId } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const transformed = mockEvents.map(event => transformEvent(event, config, mockListings));
  res.json(transformed);
});

// Get single event
app.get('/api/events/:id', (req, res) => {
  const { config, experimentId, variantId } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const event = mockEvents.find(e => e.id === parseInt(req.params.id));
  if (!event) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const transformed = transformEvent(event, config, mockListings);
  const listingsCount = mockListings.filter(l => l.eventId === event.id).length;
  transformed.listingsCount = listingsCount;
  res.json(transformed);
});

// Get listings for an event
app.get('/api/events/:id/listings', (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const eventId = parseInt(req.params.id);
  // Apply listing overrides to raw data before filtering/sorting
  let listings = mockListings
    .filter(l => l.eventId === eventId)
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
app.get('/api/listings/:id', (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const listing = mockListings.find(l => l.id === parseInt(req.params.id));
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  // Apply overrides to peer listings so relative scores use overridden prices
  const eventListings = mockListings
    .filter(l => l.eventId === listing.eventId)
    .map(l => applyListingOverrides(l, listingOverrides));
  const transformed = transformListing(listing, config, eventListings, listingOverrides);
  const event = mockEvents.find(e => e.id === listing.eventId);
  transformed.event = transformEvent(event, config, mockListings);
  res.json(transformed);
});

// Get raw (base) listings for an event — no overrides applied, for admin comparison
app.get('/api/events/:id/listings/raw', (req, res) => {
  const eventId = parseInt(req.params.id);
  const listings = mockListings.filter(l => l.eventId === eventId);
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
app.put('/api/listings/:id/image', (req, res) => {
  const listingId = parseInt(req.params.id);
  const { imageUrl } = req.body;
  
  if (!imageUrl) {
    return res.status(400).json({ error: 'imageUrl is required' });
  }
  
  const listing = mockListings.find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  
  listing.imageUrl = imageUrl;
  res.json({ success: true, listing });
});

// Update listing notes
app.put('/api/listings/:id/notes', (req, res) => {
  const listingId = parseInt(req.params.id);
  const { notes } = req.body;
  
  if (!Array.isArray(notes)) {
    return res.status(400).json({ error: 'notes must be an array' });
  }
  
  const listing = mockListings.find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  
  listing.notes = notes.filter(note => note && note.trim() !== ''); // Remove empty notes
  res.json({ success: true, listing });
});

// Search events
app.get('/api/search', (req, res) => {
  const { config, experimentId, variantId } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const query = req.query.q?.toLowerCase() || '';
  const filtered = mockEvents.filter(event => 
    event.title.toLowerCase().includes(query) ||
    event.artist.toLowerCase().includes(query) ||
    event.venue.name.toLowerCase().includes(query) ||
    event.category.toLowerCase().includes(query)
  );
  res.json(filtered.map(event => transformEvent(event, config)));
});

// Shopping cart operations (scoped per session)
let carts = {}; // { [sessionId]: { [listingId]: quantity } }

function getCart(sessionId) {
  if (!carts[sessionId]) carts[sessionId] = {};
  return carts[sessionId];
}

app.get('/api/cart', (req, res) => {
  const { config, experimentId, variantId, listingOverrides } = resolveExperimentConfig(req.sessionId);
  req.experimentId = experimentId; req.variantId = variantId;
  const cart = getCart(req.sessionId);
  const cartItems = Object.entries(cart).map(([listingId, quantity]) => {
    const listing = mockListings.find(l => l.id === parseInt(listingId));
    if (!listing) return null;

    const eventListings = mockListings
      .filter(l => l.eventId === listing.eventId)
      .map(l => applyListingOverrides(l, listingOverrides));
    const event = mockEvents.find(e => e.id === listing.eventId);
    return {
      listingId: parseInt(listingId),
      quantity,
      listing: transformListing(listing, config, eventListings, listingOverrides),
      event: transformEvent(event, config, mockListings)
    };
  }).filter(item => item !== null);

  res.json(cartItems);
});

app.post('/api/cart', (req, res) => {
  const { listingId, quantity } = req.body;

  if (!listingId || !quantity) {
    return res.status(400).json({ error: 'listingId and quantity are required' });
  }

  const listing = mockListings.find(l => l.id === listingId);
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }

  if (quantity > listing.quantity) {
    return res.status(400).json({ error: 'Quantity exceeds available tickets' });
  }

  const cart = getCart(req.sessionId);
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
  const cart = getCart(req.sessionId);
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

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    uptime: process.uptime()
  });
});

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
