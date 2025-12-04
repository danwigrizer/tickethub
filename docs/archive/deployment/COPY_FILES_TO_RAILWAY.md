# How to Copy Files to Railway Volume

This guide shows you how to populate your Railway volume with config and data files.

## Prerequisites

- Railway service deployed and running
- Volume mounted at `/app/storage`
- Railway CLI installed (optional, for easier access)

## Method 1: Using Railway CLI (Recommended)

### Step 1: Install Railway CLI

```bash
npm i -g @railway/cli
railway login
```

### Step 2: Connect to Your Project

```bash
cd /Users/dw/dev/Agentic
railway link  # Link to your Railway project
railway service  # Select your backend service
```

### Step 3: Copy Files via Railway CLI

```bash
# Copy scenario files
railway run --service backend sh -c "mkdir -p /app/storage/config/scenarios"
railway cp config/scenarios/*.json backend:/app/storage/config/scenarios/

# Copy venue data files
railway run --service backend sh -c "mkdir -p /app/storage/data/venues"
railway cp data/venues/*.json backend:/app/storage/data/venues/
```

## Method 2: Using Railway Web Interface

### Step 1: Access Your Service

1. Go to Railway dashboard
2. Select your **Backend Service**
3. Click on **Volumes** tab
4. Click on your volume (mounted at `/app/storage`)

### Step 2: Use Railway's File Browser

Railway's web interface may have a file browser. If available:
1. Navigate to `/app/storage/config/scenarios/`
2. Upload your scenario JSON files
3. Navigate to `/app/storage/data/venues/`
4. Upload your venue JSON files

## Method 3: Using SSH/Shell Access

### Step 1: Open Shell in Railway

1. Go to your Backend Service in Railway
2. Click on **Deployments** tab
3. Click on the latest deployment
4. Click **Shell** or **Connect** button

### Step 2: Create Directories

```bash
mkdir -p /app/storage/config/scenarios
mkdir -p /app/storage/data/venues
```

### Step 3: Copy Files

You can use `curl` or `wget` to download files, or use Railway's file upload feature.

**Option A: Create files directly in shell**

```bash
# For each scenario file, create it:
cat > /app/storage/config/scenarios/transparent-pricing.json << 'EOF'
{
  "name": "Transparent Pricing",
  "description": "...",
  "config": { ... }
}
EOF
```

**Option B: Use base64 encoding**

1. On your local machine, encode the file:
```bash
base64 config/scenarios/transparent-pricing.json | pbcopy
```

2. In Railway shell, decode and save:
```bash
# Paste the base64 string and decode
echo "PASTE_BASE64_HERE" | base64 -d > /app/storage/config/scenarios/transparent-pricing.json
```

## Method 4: Using Docker Exec (If you have container access)

```bash
# Get container ID
railway status

# Copy files into container
docker cp config/scenarios/transparent-pricing.json <container-id>:/app/storage/config/scenarios/
docker cp data/venues/sofi-stadium-sections.json <container-id>:/app/storage/data/venues/
```

## Method 5: Create a Setup Script

Create a script that Railway runs on startup to copy files:

### Create `backend/setup-volume.sh`:

```bash
#!/bin/sh
# Copy default files to volume if they don't exist

# Copy scenarios if volume is empty
if [ ! -f /app/storage/config/scenarios/transparent-pricing.json ]; then
  echo "Copying scenario files..."
  cp /app/config/scenarios/*.json /app/storage/config/scenarios/ 2>/dev/null || true
fi

# Copy venue data if volume is empty
if [ ! -f /app/storage/data/venues/sofi-stadium-sections.json ]; then
  echo "Copying venue data files..."
  cp /app/data/venues/*.json /app/storage/data/venues/ 2>/dev/null || true
fi
```

Then update your entrypoint to run this script.

## Quick Copy Commands (Local to Railway)

If Railway CLI supports direct file operations:

```bash
# From your local project directory
railway run --service backend -- sh << EOF
mkdir -p /app/storage/config/scenarios
mkdir -p /app/storage/data/venues
EOF

# Then copy files (if Railway CLI supports it)
# Otherwise use the methods above
```

## Files to Copy

### Config/Scenarios (Required for admin panel):
- `config/scenarios/transparent-pricing.json`
- `config/scenarios/hidden-fees.json`
- `config/scenarios/full-transparency.json`
- `config/scenarios/minimal-info.json`
- `config/scenarios/european-format.json`
- `config/scenarios/historical-pricing.json`
- `config/scenarios/seat-quality-focus.json`
- `config/scenarios/supply-demand-scenario.json`
- `config/scenarios/bundle-options-scenario.json`
- `config/scenarios/deal-flags-emphasis.json`

**Destination**: `/app/storage/config/scenarios/`

### Data/Venues (Optional, for venue-specific data):
- `data/venues/sofi-stadium-sections.json`
- `data/venues/metlife-stadium-sections.json`
- `data/venues/att-stadium-sections.json`
- `data/venues/barclays-center-sections.json`
- `data/venues/ford-field-sections.json`
- `data/venues/lincoln-financial-field-sections.json`
- `data/venues/arrowhead-stadium-sections.json`

**Destination**: `/app/storage/data/venues/`

## Verification

After copying files, verify they're there:

```bash
# In Railway shell or via CLI
railway run --service backend ls -la /app/storage/config/scenarios/
railway run --service backend ls -la /app/storage/data/venues/
```

Or test via API:
- Visit `/api/scenarios` - should return your scenario list
- The app should work with venue data if you copied those files

## Notes

- The `active.json` file will be created automatically by the app
- Logs directory (`/app/storage/logs/`) is created automatically
- Files in the volume persist across deployments
- You only need to copy files once (unless you update them)

