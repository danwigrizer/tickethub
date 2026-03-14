# Fake Ticket Marketplace - AI Testing Platform

## Project Overview
A configurable fake ticket marketplace website designed to test how AI models (like ChatGPT) parse and interact with web content. The system allows dynamic modification of both frontend presentation and API responses to study AI behavior patterns.

## Architecture

### 1. **Frontend (React/Next.js)**
   - Ticket marketplace UI with:
     - Event listings page
     - Event detail pages
     - Search/filter functionality
     - Shopping cart
     - Checkout flow
   - Dynamic content rendering based on configuration
   - Realistic styling to mimic real ticket marketplaces

### 2. **Backend API (Node.js/Express or Python/Flask)**
   - RESTful API endpoints:
     - `/api/events` - List events
     - `/api/events/:id` - Event details
     - `/api/search` - Search events
     - `/api/cart` - Shopping cart operations
     - `/api/checkout` - Checkout process
   - Configuration-driven responses
   - CORS enabled for testing

### 3. **Configuration System**
   - JSON-based configuration with 7 sections
   - Configurable attributes:
     - **pricing**: Fee visibility mode (4 options), currency, format, fabricated discounts
     - **scores**: Deal/value scores, flag influence, score contradiction mode
     - **demand**: View counts, sold data, price trend, urgency language intensity (4 levels)
     - **seller**: Seller details, refund policy, transfer method, trust signal level
     - **content**: Description detail level, venue info, bundle options, button text
     - **api**: Response format, date format, default sort, seat quality gating
     - **behavior**: Latency simulation, error injection, cart expiration (Phase 2)
   - Auto-migration from the previous 3-section schema (ui/api/content)

### 4. **Admin/Control Panel**
   - Web interface to modify configurations
   - Real-time updates without restart
   - Preset configurations for different test scenarios
   - Export/import configurations
   - A/B experiment management (create experiments, assign variants, view results)

## Key Features for AI Testing

### Testable Variations:
1. **Content Structure**
   - Different HTML structures (semantic vs non-semantic)
   - Various data-attribute naming conventions
   - Different text patterns and formatting

2. **Pricing Information**
   - Price display formats ($50.00 vs $50 vs 50 USD)
   - Fee visibility modes (hidden, total only, itemized breakdown, included in price)
   - Fabricated "was" prices to test AI anchoring on fake discounts

3. **Demand and Urgency Signals**
   - Urgency language at four intensity levels (none through aggressive)
   - Granular demand indicators: view counts, sold data, price trend, demand level
   - Sold-out states

4. **Event Information**
   - Date formats (various locales)
   - Venue information detail levels
   - Artist/performer names and descriptions

5. **UI/UX Patterns**
   - Button text variations
   - Call-to-action wording
   - Navigation structures

## Technology Stack Recommendations

### Option A: Modern Stack
- **Frontend**: Next.js (React) with TypeScript
- **Backend**: Node.js with Express
- **Styling**: Tailwind CSS
- **State Management**: React Context or Zustand

### Option B: Simpler Stack
- **Frontend**: Vanilla HTML/CSS/JS or React
- **Backend**: Python Flask or Node.js Express
- **Styling**: CSS or Tailwind

## Project Structure
```
/
├── frontend/
│   ├── pages/          # Next.js pages or React components
│   ├── components/     # Reusable UI components
│   ├── styles/         # CSS/styling
│   └── config/         # Frontend configuration loader
├── backend/
│   ├── api/            # API route handlers
│   ├── config/         # Configuration management
│   ├── data/           # Mock data generators
│   └── server.js       # Express server
├── config/
│   ├── scenarios/      # Preset test scenarios
│   └── active.json     # Current active configuration
└── admin/
    └── panel/          # Admin control panel
```

## Implementation Phases

### Phase 1: Core Setup
- Basic frontend structure
- Simple backend API
- Configuration system
- Basic event listing page

### Phase 2: Full Marketplace Features
- Event detail pages
- Search functionality
- Shopping cart
- Checkout flow

### Phase 3: Configuration System
- Dynamic configuration loading
- Admin panel
- Preset scenarios

### Phase 4: Testing Features
- Logging AI interactions
- Analytics dashboard
- Export test results

## Example Configuration Structure
```json
{
  "pricing": {
    "format": "currency_symbol",
    "currency": "USD",
    "feeVisibility": "breakdown",
    "showOriginalPrice": false,
    "fabricatedDiscount": false
  },
  "scores": {
    "includeDealScore": true,
    "includeValueScore": true,
    "includeDealFlags": true,
    "dealFlagsInfluenceScore": false,
    "includeSavings": true,
    "includeRelativeValue": true,
    "scoreContradictions": false
  },
  "demand": {
    "includeViewCounts": true,
    "includeSoldData": true,
    "includePriceTrend": true,
    "includeDemandLevel": true,
    "urgencyLanguage": "subtle",
    "includePriceHistory": false
  },
  "seller": {
    "includeSellerDetails": true,
    "includeRefundPolicy": true,
    "includeTransferMethod": true,
    "trustSignals": "standard"
  },
  "content": {
    "eventDescriptions": "detailed",
    "venueInfo": "full",
    "includeBundleOptions": false,
    "includePremiumFeatures": false,
    "buttonText": "Buy Now"
  },
  "api": {
    "responseFormat": "nested",
    "dateFormat": "MM/DD/YYYY",
    "defaultSort": "deal_score",
    "includeSeatQuality": true
  },
  "behavior": {
    "latencyMs": 0,
    "errorRate": 0,
    "crossEndpointConsistency": true,
    "cartExpirationSeconds": 900
  }
}
```

