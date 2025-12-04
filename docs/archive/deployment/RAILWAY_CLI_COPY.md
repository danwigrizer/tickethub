# Copy Files to Railway via CLI

## Quick Setup

### Step 1: Install Railway CLI (if not installed)

```bash
npm i -g @railway/cli
railway login
```

### Step 2: Link to Your Project

```bash
cd /Users/dw/dev/Agentic
railway link
# Select your project and backend service when prompted
```

### Step 3: Run the Copy Script

```bash
./copy-to-railway.sh
```

## Manual Method (Step by Step)

If you prefer to do it manually:

### 1. Create Directories

```bash
railway run --service backend sh -c "mkdir -p /app/storage/config/scenarios && mkdir -p /app/storage/data/venues"
```

### 2. Copy Scenario Files

For each scenario file:

```bash
# Example for one file
base64 < config/scenarios/transparent-pricing.json | railway run --service backend sh -c "base64 -d > /app/storage/config/scenarios/transparent-pricing.json"
```

Or use the script which does all files automatically.

### 3. Copy Venue Files

```bash
# Example for one file
base64 < data/venues/sofi-stadium-sections.json | railway run --service backend sh -c "base64 -d > /app/storage/data/venues/sofi-stadium-sections.json"
```

## Alternative: Interactive Shell Method

If the script doesn't work, use an interactive shell:

```bash
# Open shell in Railway container
railway shell --service backend

# Then in the shell:
mkdir -p /app/storage/config/scenarios
mkdir -p /app/storage/data/venues

# For each file, you can create it directly or use base64
# Exit shell when done: type 'exit'
```

## Verify Files Were Copied

```bash
railway run --service backend sh -c "ls -la /app/storage/config/scenarios/"
railway run --service backend sh -c "ls -la /app/storage/data/venues/"
```

## Test the API

After copying, test that scenarios are available:

```bash
# Get your backend URL
railway domain --service backend

# Then visit: https://your-backend.railway.app/api/scenarios
```

## Troubleshooting

**"railway: command not found"**
- Install: `npm i -g @railway/cli`

**"Not logged in"**
- Run: `railway login`

**"Service not found"**
- Make sure you've linked: `railway link`
- Or specify service: `railway run --service <service-name>`

**Files not appearing**
- Check volume is mounted: `railway run --service backend ls -la /app/storage`
- Verify symlinks: `railway run --service backend ls -la /app/config`

