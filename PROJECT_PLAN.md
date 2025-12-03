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
   - JSON-based configuration files
   - Configurable attributes:
     - **Event data**: Names, descriptions, prices, dates, venues
     - **Pricing strategies**: Dynamic pricing, fees, discounts
     - **UI elements**: Button text, labels, messaging
     - **API response formats**: Structure, field names, data types
     - **Error messages**: Different error scenarios
     - **Availability**: Stock levels, sold-out states

### 4. **Admin/Control Panel**
   - Web interface to modify configurations
   - Real-time updates without restart
   - Preset configurations for different test scenarios
   - Export/import configurations

## Key Features for AI Testing

### Testable Variations:
1. **Content Structure**
   - Different HTML structures (semantic vs non-semantic)
   - Various data-attribute naming conventions
   - Different text patterns and formatting

2. **Pricing Information**
   - Price display formats ($50.00 vs $50 vs 50 USD)
   - Hidden fees vs transparent pricing
   - Dynamic pricing messages

3. **Availability Indicators**
   - Stock counts ("Only 3 left!")
   - Urgency messaging ("Selling fast!")
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
  "ui": {
    "priceFormat": "currency_symbol",
    "dateFormat": "MM/DD/YYYY",
    "urgencyMessages": true,
    "stockCounts": true
  },
  "api": {
    "responseFormat": "nested",
    "includeFees": true,
    "priceField": "price"
  },
  "content": {
    "eventDescriptions": "detailed",
    "venueInfo": "full",
    "buttonText": "Buy Now"
  }
}
```

