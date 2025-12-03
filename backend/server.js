import express from 'express';
import cors from 'cors';
import { readFileSync, writeFileSync, existsSync, readdirSync, appendFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Request logging setup
const LOGS_DIR = join(__dirname, '../logs');
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
      isAgent: isAgent
    };
    
    // Add to in-memory store
    requestLogs.push(logEntry);
    if (requestLogs.length > MAX_LOG_ENTRIES) {
      requestLogs.shift(); // Remove oldest entry
    }
    
    // Save to file
    saveLogEntry(logEntry);
    
    // Console log for agent requests
    if (isAgent) {
      console.log(`[AGENT REQUEST] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${userAgent}`);
    }
  });
  
  next();
});

// Load recent logs on startup
loadRecentLogs();

// Configuration management
const CONFIG_PATH = join(__dirname, '../config/active.json');
const DEFAULT_CONFIG = {
  ui: {
    priceFormat: 'currency_symbol', // 'currency_symbol', 'currency_code', 'number_only'
    dateFormat: 'MM/DD/YYYY', // 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD', 'full'
    urgencyMessages: true,
    stockCounts: true,
    showFees: true,
    buttonText: 'Buy Now',
    currency: 'USD'
  },
  api: {
    responseFormat: 'nested', // 'nested', 'flat'
    includeFees: true,
    priceField: 'price',
    includeAvailability: true,
    includePriceHistory: true,
    includeDealScore: true,
    includeValueScore: true,
    includeSavingsInfo: true,        // savingsAmount, savingsPercent, marketValue
    includeDemandIndicators: true,   // viewCount, soldCount, demandLevel, priceTrend
    includeBundleOptions: true,
    includeRefundPolicy: true,
    includeTransferMethod: true,
    includeSellerDetails: true,     // sellerVerified, sellerTransactionCount
    includeDealFlags: true,
    includePremiumFeatures: true,
    includeRelativeValue: true       // priceVsMedian, priceVsSimilarSeats
  },
  content: {
    eventDescriptions: 'detailed', // 'detailed', 'brief', 'minimal'
    venueInfo: 'full', // 'full', 'name_only', 'address_only'
    showReviews: false,
    showRatings: false
  }
};

function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    try {
      const data = readFileSync(CONFIG_PATH, 'utf8');
      const savedConfig = JSON.parse(data);
      // Deep merge with defaults to ensure new fields are included
      return {
        ui: { ...DEFAULT_CONFIG.ui, ...(savedConfig.ui || {}) },
        api: { ...DEFAULT_CONFIG.api, ...(savedConfig.api || {}) },
        content: { ...DEFAULT_CONFIG.content, ...(savedConfig.content || {}) }
      };
    } catch (error) {
      console.error('Error loading config:', error);
      return DEFAULT_CONFIG;
    }
  }
  // Create default config if it doesn't exist
  writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

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
  const VENUES_DIR = join(__dirname, '../data/venues');
  
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

// Format price based on configuration
function formatPrice(price, config) {
  const currency = config.ui.currency || 'USD';
  const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '£';
  
  switch (config.ui.priceFormat) {
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
  
  switch (config.ui.dateFormat) {
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
      venueName: transformed.venue.name,
      venueAddress: transformed.venue.address,
      venueCity: transformed.venue.city,
      venueState: transformed.venue.state,
      category: transformed.category,
      description: transformed.description,
      totalListingsCount: transformed.totalListingsCount,
      listingSupply: transformed.listingSupply
    };
  }
  
  return transformed;
}

// Calculate deal score (1-10) based on price compared to other listings for the event
function calculateDealScore(listing, allListingsForEvent) {
  if (allListingsForEvent.length === 0) return 5;
  
  const prices = allListingsForEvent.map(l => l.pricePerTicket);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const medianPrice = prices.sort((a, b) => a - b)[Math.floor(prices.length / 2)];
  
  if (maxPrice === minPrice) return 5; // All same price
  
  // Base score from price (lower price = higher score)
  let score = 10 - ((listing.pricePerTicket - minPrice) / (maxPrice - minPrice)) * 9;
  
  // Adjustments based on new factors
  // Deal flags boost
  if (listing.dealFlags) {
    if (listing.dealFlags.includes('great_deal') || listing.dealFlags.includes('fantastic_value')) score += 0.5;
    if (listing.dealFlags.includes('best_value')) score += 0.3;
    if (listing.dealFlags.includes('featured')) score += 0.2;
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

// Transform listing based on configuration
function transformListing(listing, config, allListingsForEvent = []) {
  const transformed = { ...listing };
  
  // Format seats
  transformed.seatsDisplay = formatSeats(listing.seats);
  
  // Format prices
  transformed.pricePerTicketFormatted = formatPrice(listing.pricePerTicket, config);
  
  if (config.api.includeFees) {
    transformed.feesFormatted = formatPrice(listing.fees, config);
    transformed.totalPrice = listing.pricePerTicket + listing.fees;
    transformed.totalPriceFormatted = formatPrice(listing.pricePerTicket + listing.fees, config);
    
    // Include fee breakdown if available
    if (listing.serviceFee !== undefined) {
      transformed.serviceFeeFormatted = formatPrice(listing.serviceFee, config);
    }
    if (listing.fulfillmentFee !== undefined) {
      transformed.fulfillmentFeeFormatted = formatPrice(listing.fulfillmentFee, config);
    }
    if (listing.platformFee !== undefined) {
      transformed.platformFeeFormatted = formatPrice(listing.platformFee, config);
    }
  } else {
    transformed.totalPrice = listing.pricePerTicket;
    transformed.totalPriceFormatted = transformed.pricePerTicketFormatted;
  }
  
  // Calculate scores and relative value
  const eventListings = allListingsForEvent.length > 0 
    ? allListingsForEvent 
    : mockListings.filter(l => l.eventId === listing.eventId);
  
  // Deal score (conditionally)
  if (config.api.includeDealScore) {
    transformed.dealScore = calculateDealScore(listing, eventListings);
    transformed.dealScoreColor = getDealScoreColor(transformed.dealScore);
  } else {
    delete transformed.dealScore;
    delete transformed.dealScoreColor;
  }
  
  // Value score (conditionally)
  if (config.api.includeValueScore) {
    transformed.valueScore = calculateValueScore(listing, eventListings);
    transformed.valueScoreColor = getDealScoreColor(transformed.valueScore);
  } else {
    delete transformed.valueScore;
    delete transformed.valueScoreColor;
  }
  
  // Relative value indicators (conditionally)
  if (config.api.includeRelativeValue) {
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
  if (config.api.includeSavingsInfo) {
    const relativeValue = calculateRelativeValue(listing, eventListings);
    transformed.savingsAmount = relativeValue.savingsAmount;
    transformed.savingsPercent = relativeValue.savingsPercent;
    if (!config.api.includeRelativeValue) {
      transformed.marketValue = relativeValue.marketValue; // Needed for savings calculation
    }
  } else {
    delete transformed.savingsAmount;
    delete transformed.savingsPercent;
  }
  
  // Price history (conditionally)
  if (config.api.includePriceHistory) {
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
  
  // Demand indicators (conditionally)
  if (!config.api.includeDemandIndicators) {
    delete transformed.viewCount;
    delete transformed.viewsLast24h;
    delete transformed.soldCount;
    delete transformed.soldRecently;
    delete transformed.priceTrend;
    delete transformed.demandLevel;
  }
  
  // Bundle options (conditionally)
  if (!config.api.includeBundleOptions) {
    delete transformed.bundleOptions;
    delete transformed.premiumFeatures;
  } else if (!config.api.includePremiumFeatures) {
    delete transformed.premiumFeatures;
  }
  
  // Policies (conditionally)
  if (!config.api.includeRefundPolicy) {
    delete transformed.refundPolicy;
  }
  if (!config.api.includeTransferMethod) {
    delete transformed.transferMethod;
  }
  
  // Seller details (conditionally)
  if (!config.api.includeSellerDetails) {
    delete transformed.sellerVerified;
    delete transformed.sellerTransactionCount;
  }
  
  // Deal flags (conditionally)
  if (!config.api.includeDealFlags) {
    delete transformed.dealFlags;
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
      fees: config.api.includeFees ? transformed.fees : undefined,
      feesFormatted: config.api.includeFees ? transformed.feesFormatted : undefined,
      totalPrice: transformed.totalPrice,
      totalPriceFormatted: transformed.totalPriceFormatted,
      sellerName: transformed.sellerName,
      sellerRating: transformed.sellerRating,
      deliveryMethod: transformed.deliveryMethod,
      notes: transformed.notes,
      listedAt: transformed.listedAt,
      imageUrl: transformed.imageUrl,
      dealScore: transformed.dealScore,
      dealScoreColor: transformed.dealScoreColor
    };
    
    // Add conditional fields based on config
    if (transformed.seatType) flat.seatType = transformed.seatType;
    
    if (config.api.includeDealScore && transformed.dealScore !== undefined) {
      flat.dealScore = transformed.dealScore;
      flat.dealScoreColor = transformed.dealScoreColor;
    }
    
    if (config.api.includeValueScore && transformed.valueScore !== undefined) {
      flat.valueScore = transformed.valueScore;
      flat.valueScoreColor = transformed.valueScoreColor;
    }
    
    if (config.api.includePriceHistory) {
      if (transformed.priceHistory) flat.priceHistory = transformed.priceHistory;
      if (transformed.price7DaysAgo !== undefined) flat.price7DaysAgo = transformed.price7DaysAgo;
      if (transformed.priceChangePercent !== undefined) flat.priceChangePercent = transformed.priceChangePercent;
    }
    
    if (config.api.includeSavingsInfo) {
      if (transformed.savingsAmount !== undefined) flat.savingsAmount = transformed.savingsAmount;
      if (transformed.savingsPercent !== undefined) flat.savingsPercent = transformed.savingsPercent;
      if (transformed.marketValue !== undefined) flat.marketValue = transformed.marketValue;
    }
    
    if (config.api.includeRelativeValue) {
      if (transformed.priceVsMedian !== undefined) flat.priceVsMedian = transformed.priceVsMedian;
      if (transformed.priceVsSimilarSeats !== undefined) flat.priceVsSimilarSeats = transformed.priceVsSimilarSeats;
    }
    
    if (config.api.includeDemandIndicators) {
      if (transformed.viewCount !== undefined) flat.viewCount = transformed.viewCount;
      if (transformed.viewsLast24h !== undefined) flat.viewsLast24h = transformed.viewsLast24h;
      if (transformed.soldCount !== undefined) flat.soldCount = transformed.soldCount;
      if (transformed.soldRecently !== undefined) flat.soldRecently = transformed.soldRecently;
      if (transformed.priceTrend !== undefined) flat.priceTrend = transformed.priceTrend;
      if (transformed.demandLevel !== undefined) flat.demandLevel = transformed.demandLevel;
    }
    
    if (config.api.includeBundleOptions) {
      if (transformed.bundleOptions) flat.bundleOptions = transformed.bundleOptions;
      if (config.api.includePremiumFeatures && transformed.premiumFeatures) {
        flat.premiumFeatures = transformed.premiumFeatures;
      }
    }
    
    if (config.api.includeRefundPolicy && transformed.refundPolicy) {
      flat.refundPolicy = transformed.refundPolicy;
    }
    
    if (config.api.includeTransferMethod && transformed.transferMethod) {
      flat.transferMethod = transformed.transferMethod;
    }
    
    if (config.api.includeSellerDetails) {
      if (transformed.sellerVerified !== undefined) flat.sellerVerified = transformed.sellerVerified;
      if (transformed.sellerTransactionCount !== undefined) flat.sellerTransactionCount = transformed.sellerTransactionCount;
    }
    
    if (config.api.includeDealFlags && transformed.dealFlags) {
      flat.dealFlags = transformed.dealFlags;
    }
    
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
  const newConfig = { ...currentConfig, ...req.body };
  saveConfig(newConfig);
  res.json(newConfig);
});

// Get available scenarios
app.get('/api/scenarios', (req, res) => {
  const SCENARIOS_DIR = join(__dirname, '../config/scenarios');
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
  const SCENARIOS_DIR = join(__dirname, '../config/scenarios');
  try {
    const files = readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      const content = readFileSync(join(SCENARIOS_DIR, file), 'utf8');
      const scenario = JSON.parse(content);
      if (scenario.name === name && scenario.config) {
        saveConfig(scenario.config);
        res.json(scenario.config);
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
  const config = loadConfig();
  const transformed = mockEvents.map(event => transformEvent(event, config, mockListings));
  res.json(transformed);
});

// Get single event
app.get('/api/events/:id', (req, res) => {
  const config = loadConfig();
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
  const config = loadConfig();
  const eventId = parseInt(req.params.id);
  let listings = mockListings.filter(l => l.eventId === eventId);
  
  // Apply filters
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
  const sort = req.query.sort || 'price_asc';
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
  }
  
  const transformed = listings.map(listing => transformListing(listing, config, listings));
  res.json(transformed);
});

// Get single listing
app.get('/api/listings/:id', (req, res) => {
  const config = loadConfig();
  const listing = mockListings.find(l => l.id === parseInt(req.params.id));
  if (!listing) {
    return res.status(404).json({ error: 'Listing not found' });
  }
  const eventListings = mockListings.filter(l => l.eventId === listing.eventId);
  const transformed = transformListing(listing, config, eventListings);
  const event = mockEvents.find(e => e.id === listing.eventId);
  transformed.event = transformEvent(event, config, mockListings);
  res.json(transformed);
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
  const config = loadConfig();
  const query = req.query.q?.toLowerCase() || '';
  const filtered = mockEvents.filter(event => 
    event.title.toLowerCase().includes(query) ||
    event.artist.toLowerCase().includes(query) ||
    event.venue.name.toLowerCase().includes(query) ||
    event.category.toLowerCase().includes(query)
  );
  res.json(filtered.map(event => transformEvent(event, config)));
});

// Shopping cart operations
let cart = {}; // { [listingId]: quantity }

app.get('/api/cart', (req, res) => {
  const config = loadConfig();
  const cartItems = Object.entries(cart).map(([listingId, quantity]) => {
    const listing = mockListings.find(l => l.id === parseInt(listingId));
    if (!listing) return null;
    
    const eventListings = mockListings.filter(l => l.eventId === listing.eventId);
    const event = mockEvents.find(e => e.id === listing.eventId);
    return {
      listingId: parseInt(listingId),
      quantity,
      listing: transformListing(listing, config, eventListings),
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
      logs: '/api/logs'
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
  }
  console.log(`Health check: http://localhost:${PORT}/health`);
});
