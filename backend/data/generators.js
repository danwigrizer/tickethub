// Data generators extracted from server.js
// Used by seed.js to generate initial data and by server.js for DEFAULT_CONFIG

export const DEFAULT_CONFIG = {
  pricing: {
    format: 'currency_symbol',
    currency: 'USD',
    feeVisibility: 'breakdown',
    showOriginalPrice: false,
    fabricatedDiscount: false,
  },
  scores: {
    includeDealScore: true,
    includeValueScore: true,
    includeDealFlags: true,
    dealFlagsInfluenceScore: true,
    includeSavings: true,
    includeRelativeValue: true,
    scoreContradictions: false,
  },
  demand: {
    includeViewCounts: true,
    includeSoldData: true,
    includePriceTrend: true,
    includeDemandLevel: true,
    urgencyLanguage: 'moderate',
    includePriceHistory: true,
  },
  seller: {
    includeSellerDetails: true,
    includeRefundPolicy: true,
    includeTransferMethod: true,
    trustSignals: 'standard',
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

// Generate future dates relative to today
function futureDateString(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().split('T')[0];
}

// Event definitions with days-from-now offsets (so dates can be refreshed)
export const EVENT_DEFINITIONS = [
  {
    id: 1,
    title: 'Taylor Swift: The Eras Tour',
    artist: 'Taylor Swift',
    daysFromNow: 14,
    time: '19:00',
    venue: { name: 'Madison Square Garden', address: '4 Pennsylvania Plaza, New York, NY 10001', city: 'New York', state: 'NY' },
    category: 'Concert',
    description: 'Experience the magic of Taylor Swift\'s Eras Tour featuring songs from all her iconic albums.',
    basePrice: 299.99,
  },
  {
    id: 2,
    title: 'Hamilton - Broadway',
    artist: 'Lin-Manuel Miranda',
    daysFromNow: 21,
    time: '20:00',
    venue: { name: 'Richard Rodgers Theatre', address: '226 W 46th St, New York, NY 10036', city: 'New York', state: 'NY' },
    category: 'Theater',
    description: 'The revolutionary musical about Alexander Hamilton and the founding of America.',
    basePrice: 189.50,
  },
  {
    id: 3,
    title: 'Los Angeles Lakers vs Golden State Warriors',
    artist: 'NBA',
    daysFromNow: 7,
    time: '19:30',
    venue: { name: 'Crypto.com Arena', address: '1111 S Figueroa St, Los Angeles, CA 90015', city: 'Los Angeles', state: 'CA' },
    category: 'Sports',
    description: 'Watch the Lakers take on the Warriors in this highly anticipated matchup.',
    basePrice: 125.00,
  },
  {
    id: 4,
    title: 'Ed Sheeran: + - = ÷ x Tour',
    artist: 'Ed Sheeran',
    daysFromNow: 30,
    time: '20:00',
    venue: { name: 'Wembley Stadium', address: 'Wembley, London HA9 0WS, UK', city: 'London', state: '' },
    category: 'Concert',
    description: 'Ed Sheeran performs his greatest hits in this spectacular stadium show.',
    basePrice: 89.99,
  },
  {
    id: 5,
    title: 'The Phantom of the Opera',
    artist: 'Andrew Lloyd Webber',
    daysFromNow: 45,
    time: '19:30',
    venue: { name: 'Majestic Theatre', address: '245 W 44th St, New York, NY 10036', city: 'New York', state: 'NY' },
    category: 'Theater',
    description: 'The longest-running show in Broadway history, featuring the iconic music of Andrew Lloyd Webber.',
    basePrice: 150.00,
  },
  {
    id: 6,
    title: 'Boston Celtics vs Miami Heat',
    artist: 'NBA',
    daysFromNow: 10,
    time: '20:00',
    venue: { name: 'TD Garden', address: '100 Legends Way, Boston, MA 02114', city: 'Boston', state: 'MA' },
    category: 'Sports',
    description: 'Eastern Conference rivalry game between the Celtics and Heat.',
    basePrice: 110.00,
  },
];

// Generate events with computed dates
export function generateEvents() {
  return EVENT_DEFINITIONS.map(({ basePrice, daysFromNow, ...def }) => ({
    ...def,
    date: futureDateString(daysFromNow),
    daysFromNow,
  }));
}

// ===== Listing generation helpers =====

function getStadiumZone(section) {
  const sectionLower = section.toLowerCase();
  if (sectionLower.includes('floor') || sectionLower.includes('premium') || sectionLower.match(/section\s*(1[0-2][0-9]|0[1-9][0-9])/)) return 'lower_bowl';
  if (sectionLower.includes('club')) return 'club';
  if (sectionLower.match(/section\s*(2[0-4][0-9]|2[0-9][0-9])/) || sectionLower.includes('mezz')) return 'mezzanine';
  if (sectionLower.match(/section\s*(3[0-9][0-9]|4[0-9][0-9])/) || sectionLower.includes('upper')) return 'upper_deck';
  return 'lower_bowl';
}

function getFieldProximity(section, row) {
  const zone = getStadiumZone(section);
  const rowNum = parseInt(row) || (row.charCodeAt(0) - 64);
  let baseScore = zone === 'lower_bowl' ? 8 : zone === 'club' ? 7 : zone === 'mezzanine' ? 5 : 3;
  if (rowNum <= 5) baseScore += 1;
  else if (rowNum >= 20) baseScore -= 1;
  return Math.max(1, Math.min(10, baseScore));
}

function getSeatType(section, row, notes) {
  const sectionLower = section.toLowerCase();
  const notesLower = (notes || []).join(' ').toLowerCase();
  if (sectionLower.includes('standing') || notesLower.includes('standing room')) return 'standing_room';
  if (notesLower.includes('obstructed') || notesLower.includes('limited view')) return 'obstructed_view';
  if (notesLower.includes('aisle')) return 'aisle';
  return 'seated';
}

function getSeatLocation(seats, section) {
  if (seats.length === 0) return 'unknown';
  const firstSeat = seats[0];
  const lastSeat = seats[seats.length - 1];
  if (firstSeat <= 5 || lastSeat >= 45) return 'corner';
  if (firstSeat <= 10 || lastSeat >= 40) return 'aisle';
  if (firstSeat >= 20 && lastSeat <= 30) return 'center';
  return 'mid-row';
}

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

function generatePriceHistory(currentPrice, listedAt) {
  const history = [];
  const listedDate = new Date(listedAt);
  const daysSinceListed = Math.floor((Date.now() - listedDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysSinceListed >= 7) {
    for (let i = 7; i <= Math.min(daysSinceListed, 30); i += 7) {
      const date = new Date(listedDate);
      date.setDate(date.getDate() + i);
      const variation = 0.8 + Math.random() * 0.4;
      history.push({
        date: date.toISOString(),
        price: Math.round(currentPrice * variation * 100) / 100
      });
    }
  }
  return history;
}

export function generateListingsForEvent(eventId, basePrice) {
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
    ['Great seats', 'Aisle access'], ['Obstructed view'], ['Premium location'],
    ['Center section'], ['Near restrooms'], ['VIP access', 'Backstage pass'],
    ['Wheelchair accessible'], ['Limited view'], ['Best value'],
    ['Selling fast'], ['Clear view'], [], [], []
  ];
  const transferMethods = ['mobile-only', 'instant', 'delayed', 'standard'];
  const refundPolicies = ['full_refund_7days', 'partial_refund', 'no_refund', 'exchange_only'];

  const listings = [];
  const numListings = 5 + Math.floor(Math.random() * 11);

  for (let i = 0; i < numListings; i++) {
    const section = sections[Math.floor(Math.random() * sections.length)];
    const row = rows[Math.floor(Math.random() * rows.length)];
    const numSeats = 1 + Math.floor(Math.random() * 8);
    const seats = [];
    const startSeat = 1 + Math.floor(Math.random() * 50);
    for (let j = 0; j < numSeats; j++) seats.push(startSeat + j);

    const priceMultiplier = 0.5 + Math.random() * 1.5;
    const basePriceValue = Math.round(basePrice * priceMultiplier * 100) / 100;

    const feesIncluded = Math.random() < 0.3;
    const serviceFee = Math.round((basePriceValue * 0.08) * 100) / 100;
    const fulfillmentFee = Math.round((basePriceValue * 0.02) * 100) / 100;
    const platformFee = Math.round((basePriceValue * 0.01) * 100) / 100;
    const totalFees = serviceFee + fulfillmentFee + platformFee;
    const pricePerTicket = basePriceValue;
    const fees = feesIncluded ? 0 : totalFees;

    const sellerRating = 3.5 + Math.random() * 1.5;
    const deliveryMethod = deliveryMethods[Math.floor(Math.random() * deliveryMethods.length)];
    const sellerName = sellerNames[Math.floor(Math.random() * sellerNames.length)];
    const notes = possibleNotes[Math.floor(Math.random() * possibleNotes.length)];

    const listedAt = new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString();
    const listingId = eventId * 1000 + i + 1;
    const imageUrl = `https://picsum.photos/seed/listing-${listingId}/400/300`;

    const seatType = getSeatType(section, row, notes);
    const stadiumZone = getStadiumZone(section);
    const fieldProximity = getFieldProximity(section, row);
    const seatLocation = getSeatLocation(seats, section);
    const seatsAdjacent = seats.length > 1 && seats.every((s, idx) => idx === 0 || s === seats[idx - 1] + 1);
    const dealFlags = generateDealFlags(pricePerTicket, basePrice, section, notes);
    const priceHistory = generatePriceHistory(pricePerTicket, listedAt);

    const daysSinceListed = Math.floor((Date.now() - new Date(listedAt).getTime()) / (1000 * 60 * 60 * 24));
    const price7DaysAgo = daysSinceListed >= 7 && priceHistory.length > 0 ? priceHistory[0].price : pricePerTicket;
    const priceChangePercent = daysSinceListed >= 7 ? Math.round(((pricePerTicket - price7DaysAgo) / price7DaysAgo) * 100 * 10) / 10 : 0;

    const viewCount = Math.floor(Math.random() * 500) + 10;
    const viewsLast24h = Math.floor(viewCount * (0.1 + Math.random() * 0.3));
    const soldCount = Math.floor(Math.random() * 20);
    const soldRecently = Math.random() < 0.3;
    const priceTrend = priceChangePercent > 5 ? 'increasing' : priceChangePercent < -5 ? 'decreasing' : 'stable';
    const demandLevel = viewCount > 200 ? 'high' : viewCount > 100 ? 'medium' : 'low';

    const sellerVerified = Math.random() < 0.7;
    const sellerTransactionCount = Math.floor(Math.random() * 500) + 10;
    const refundPolicy = refundPolicies[Math.floor(Math.random() * refundPolicies.length)];
    const transferMethod = transferMethods[Math.floor(Math.random() * transferMethods.length)];

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
      eventId,
      section, row, seats,
      quantity: numSeats,
      pricePerTicket, basePrice: basePriceValue, fees,
      serviceFee, fulfillmentFee, platformFee, feesIncluded,
      sellerName, sellerRating: Math.round(sellerRating * 10) / 10,
      sellerVerified, sellerTransactionCount,
      deliveryMethod, transferMethod, refundPolicy,
      notes, listedAt, imageUrl,
      seatType, stadiumZone, fieldProximity,
      rowElevation: parseInt(row) || (row.charCodeAt(0) - 64),
      seatLocation, seatsAdjacent, dealFlags,
      priceHistory, price7DaysAgo, priceChangePercent,
      viewCount, viewsLast24h, soldCount, soldRecently, priceTrend, demandLevel,
      bundleOptions: Object.keys(bundleOptions).length > 0 ? bundleOptions : undefined,
      premiumFeatures: premiumFeatures.length > 0 ? premiumFeatures : undefined,
    });
  }

  return listings;
}

// Generate all listings for all events
export function generateAllListings() {
  const listings = [];
  for (const def of EVENT_DEFINITIONS) {
    listings.push(...generateListingsForEvent(def.id, def.basePrice));
  }
  return listings;
}
