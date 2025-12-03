# Fake Ticket Marketplace - AI Testing Platform

A configurable fake ticket marketplace website designed to test how AI models (like ChatGPT) parse and interact with web content. This platform allows you to dynamically modify both frontend presentation and API responses to study AI behavior patterns.

## Features

- **Realistic Ticket Marketplace UI**: Browse events, view details, add to cart, and checkout
- **Dynamic Configuration**: Change UI elements, API responses, and content structure in real-time
- **Admin Control Panel**: Web-based interface to modify configurations without code changes
- **Multiple Test Scenarios**: Preset configurations for different testing scenarios
- **Configurable Attributes**:
  - Price formats (currency symbol, code, number only)
  - Date formats (various locales and styles)
  - Content detail levels (detailed, brief, minimal)
  - API response structures (nested vs flat)
  - UI elements (button text, urgency messages, stock counts)

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

### UI Configuration
- **Price Format**: How prices are displayed ($50.00, 50.00 USD, or 50.00)
- **Date Format**: Date display style (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD, or full date)
- **Currency**: USD, EUR, or GBP
- **Button Text**: Customize call-to-action button text
- **Urgency Messages**: Show/hide "Only X left!" messages
- **Stock Counts**: Show/hide availability numbers
- **Show Fees**: Display or hide additional fees

### API Configuration
- **Response Format**: Nested objects or flat structure
- **Include Fees**: Whether fees are included in API responses
- **Include Availability**: Whether stock/availability info is returned

### Content Configuration
- **Event Descriptions**: Detailed, brief, or minimal descriptions
- **Venue Information**: Full details, name only, or address only

## Project Structure

```
/
├── frontend/          # Next.js React application
│   ├── app/          # Next.js app directory
│   │   ├── page.tsx  # Home/events listing page
│   │   ├── admin/    # Admin control panel
│   │   ├── cart/     # Shopping cart page
│   │   └── events/   # Event detail pages
│   └── ...
├── backend/          # Express API server
│   ├── server.js     # Main server file
│   └── ...
├── config/           # Configuration files
│   ├── active.json   # Current active configuration
│   └── scenarios/    # Preset test scenarios
└── ...
```

## API Endpoints

- `GET /api/events` - Get all events
- `GET /api/events/:id` - Get single event details
- `GET /api/search?q=query` - Search events
- `GET /api/cart` - Get cart contents
- `POST /api/cart` - Add item to cart
- `DELETE /api/cart/:eventId` - Remove item from cart
- `POST /api/checkout` - Complete checkout
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration

## Example Test Scenarios

### Scenario 1: Transparent Pricing
- Show fees: ON
- Price format: Currency symbol
- Response format: Nested
- Test: Ask AI to find total cost including fees

### Scenario 2: Hidden Fees
- Show fees: OFF
- Include fees in API: ON
- Test: See if AI can detect fees from API even if not shown in UI

### Scenario 3: Different Date Formats
- Date format: DD/MM/YYYY
- Test: See how AI interprets dates in different formats

### Scenario 4: Minimal Information
- Event descriptions: Minimal
- Venue info: Name only
- Test: How AI handles sparse information

## Development

### Adding New Events

Edit `backend/server.js` and modify the `mockEvents` array.

### Adding New Configuration Options

1. Update `DEFAULT_CONFIG` in `backend/server.js`
2. Add UI controls in `frontend/app/admin/page.tsx`
3. Implement transformation logic in backend `transformEvent` function

## Notes

- The configuration is stored in `config/active.json` (gitignored)
- Changes to configuration take effect immediately on the API
- Frontend may need a refresh to see UI changes
- This is a testing tool - not for production use

## License

MIT

