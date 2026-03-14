# Fake Ticket Marketplace - AI Testing Platform

A configurable fake ticket marketplace website designed to test how AI models (like ChatGPT) parse and interact with web content. This platform allows you to dynamically modify both frontend presentation and API responses to study AI behavior patterns.

## Features

- **Realistic Ticket Marketplace UI**: Browse events, view details, add to cart, and checkout
- **Dynamic Configuration**: Change UI elements, API responses, and content structure in real-time
- **Admin Control Panel**: Web-based interface to modify configurations without code changes
- **Multiple Test Scenarios**: Preset configurations for different testing scenarios
- **Configurable Attributes**:
  - Fee visibility modes (hidden, total only, breakdown, included in price)
  - Urgency language intensity (none, subtle, moderate, aggressive)
  - Deal scoring signals (score contradictions, fabricated discounts, flag influence)
  - Demand indicators (view counts, sold data, price trend, demand level)
  - API response structures (nested vs flat, date format, sort order)
  - Content detail levels (detailed, brief, minimal)
  - A/B testing experiments with per-section config overrides

## Quick Start

### Prerequisites

- Node.js 18+ installed
- npm or yarn

### Installation

1. Install all dependencies:
```bash
npm run install:all
```

2. Start both frontend and backend servers:
```bash
npm run dev
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend Next.js app on `http://localhost:3000`

### Manual Start (Alternative)

If you prefer to run servers separately:

**Backend:**
```bash
cd backend
npm install
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

## Usage

### Accessing the Site

1. Open your browser to `http://localhost:3000`
2. Browse the ticket marketplace
3. Click on events to view details
4. Add tickets to cart and checkout

### Admin Control Panel

1. Navigate to `http://localhost:3000/admin`
2. Modify any configuration settings
3. Click "Save Configuration"
4. Refresh the main site to see changes

### Testing with AI Models

1. Configure the site with your desired settings via the admin panel
2. Share the URL with an AI model (like ChatGPT with browsing enabled)
3. Ask the AI to interact with the site (e.g., "Find me tickets for a concert under $100")
4. Observe how the AI parses and responds to different configurations
5. Modify configurations and test again to see how parsing behavior changes

## Configuration Options

The configuration system uses 7 sections. Changes take effect immediately on the API; refresh the frontend to see UI changes.

### pricing
- **format**: How prices are displayed (`currency_symbol`, `currency_code`, or `number_only`)
- **currency**: USD, EUR, or GBP
- **feeVisibility**: `hidden`, `total_only`, `breakdown`, or `included_in_price`
- **showOriginalPrice**: Show a "was $X" original price
- **fabricatedDiscount**: Generate a fake "was" price to test AI anchoring behavior

### scores
- **includeDealScore**: Include deal score in API responses
- **includeValueScore**: Include value score in API responses
- **includeDealFlags**: Include deal flag labels (e.g. "Hot Deal")
- **dealFlagsInfluenceScore**: Whether deal flags feed back into the score calculation
- **includeSavings**: Include savings amount in API responses
- **includeRelativeValue**: Include relative value comparison data
- **scoreContradictions**: Invert scores so expensive listings appear as "great deals"

### demand
- **includeViewCounts**: Include view count data in responses
- **includeSoldData**: Include recently sold counts
- **includePriceTrend**: Include price trend direction
- **includeDemandLevel**: Include a demand level label
- **urgencyLanguage**: Intensity of urgency copy — `none`, `subtle`, `moderate`, or `aggressive`
- **includePriceHistory**: Include historical price data

### seller
- **includeSellerDetails**: Include seller name and rating
- **includeRefundPolicy**: Include refund policy text
- **includeTransferMethod**: Include ticket transfer method
- **trustSignals**: Amount of trust/credibility signals — `none`, `minimal`, `standard`, or `heavy`

### content
- **eventDescriptions**: Detail level — `detailed`, `brief`, or `minimal`
- **venueInfo**: Venue detail level — `full`, `name_only`, or `address_only`
- **includeBundleOptions**: Include bundle/package options
- **includePremiumFeatures**: Include premium upsell features
- **buttonText**: Customize call-to-action button text

### api
- **responseFormat**: `nested` or `flat` response structure
- **dateFormat**: Date style — `MM/DD/YYYY`, `DD/MM/YYYY`, `YYYY-MM-DD`, or `full`
- **defaultSort**: Default sort order for listings
- **includeSeatQuality**: Include seat quality rating data

### behavior (Phase 2 — not yet wired)
- **latencyMs**: Simulated response latency
- **errorRate**: Simulated error injection rate
- **crossEndpointConsistency**: Whether data is consistent across endpoints
- **cartExpirationSeconds**: How long session-scoped cart items persist

## Project Structure

```
/
├── frontend/          # Next.js React application
│   ├── app/          # Next.js app directory
│   │   ├── page.tsx  # Home/events listing page
│   │   ├── admin/    # Admin control panel
│   │   │   └── experiments/  # Experiment list, creation, and detail
│   │   ├── cart/     # Shopping cart page
│   │   └── events/   # Event detail pages
│   └── ...
├── backend/          # Express API server
│   ├── server.js     # Main server file
│   └── experiments.js  # Experiment CRUD, assignment, results
├── config/           # Configuration files
│   ├── active.json   # Current active configuration
│   └── scenarios/    # Preset test scenarios
└── ...
```

## API Endpoints

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get single event details
- `GET /api/events/:id/listings` - Get resale listings for an event
- `GET /api/listings/:id` - Get a single listing
- `GET /api/search?q=query` - Search events
- `GET /api/cart` - Get session cart contents
- `POST /api/cart` - Add item to cart
- `DELETE /api/cart/:listingId` - Remove item from cart
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/scenarios` - List preset scenarios
- `POST /api/scenarios/load` - Load a preset scenario
- `GET /api/experiments` - List experiments
- `POST /api/experiments` - Create an experiment
- `GET /api/experiments/:id` - Get experiment detail
- `PATCH /api/experiments/:id` - Update experiment
- `DELETE /api/experiments/:id` - Delete experiment
- `GET /api/experiments/:id/results` - Get experiment results

## Example Test Scenarios

### Scenario 1: Transparent Pricing
- `pricing.feeVisibility`: `breakdown`
- `pricing.format`: `currency_symbol`
- `api.responseFormat`: `nested`
- Test: Ask AI to find the total cost including fees

### Scenario 2: Hidden Fees
- `pricing.feeVisibility`: `hidden`
- `pricing.format`: `number_only`
- Test: See if AI reports a price without realizing fees are excluded

### Scenario 3: Fabricated Discounts
- `pricing.fabricatedDiscount`: `true`
- `pricing.showOriginalPrice`: `true`
- Test: Does AI anchor on the fake "was" price when making a recommendation?

### Scenario 4: Inverted Deal Scores
- `scores.scoreContradictions`: `true`
- `scores.includeDealFlags`: `true`
- Test: Does AI trust the "Great Deal" flag even when the price is the highest?

### Scenario 5: Aggressive Urgency
- `demand.urgencyLanguage`: `aggressive`
- `demand.includeDemandLevel`: `true`
- `demand.includeSoldData`: `true`
- Test: How does urgency copy influence AI purchase recommendations?

### Scenario 6: Minimal Information
- `content.eventDescriptions`: `minimal`
- `content.venueInfo`: `name_only`
- `seller.includeSellerDetails`: `false`
- Test: How does AI handle sparse information when comparing listings?

## Development

### Adding New Events

Edit `backend/server.js` and modify the `mockEvents` array.

### Adding New Configuration Options

1. Update `DEFAULT_CONFIG` in `backend/server.js` under the appropriate section (`pricing`, `scores`, `demand`, `seller`, `content`, `api`, or `behavior`)
2. Add UI controls in `frontend/app/admin/page.tsx`
3. Implement transformation logic in the backend `transformEvent` or `transformListing` function
4. If the field should be available in experiments, ensure it is included in the section's override merge logic in `backend/experiments.js`

## Deployment

The application is ready for deployment. See the deployment documentation for detailed instructions.

### Quick Deployment Options

**Docker (Recommended):**
```bash
docker-compose up -d
```

**Manual:**
```bash
# Build frontend
npm run build:frontend

# Start services
npm start
```

### Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - General deployment guide
- **[RAILWAY_DEPLOYMENT.md](./RAILWAY_DEPLOYMENT.md)** - Specific guide for deploying to Railway (recommended)
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Pre-deployment checklist
- **[ENV_EXAMPLES.md](./ENV_EXAMPLES.md)** - Environment variable examples

### Key Deployment Features

- ✅ Environment variable configuration
- ✅ Docker support with docker-compose
- ✅ Health check endpoints (`/health`)
- ✅ Production-optimized Next.js build
- ✅ Configurable CORS for security
- ✅ Centralized API URL configuration

## Notes

- The configuration is stored in `config/active.json` (gitignored)
- Changes to configuration take effect immediately on the API
- Frontend may need a refresh to see UI changes
- This is a testing tool - not for production use

## License

MIT

