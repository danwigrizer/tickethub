# Railway Volume Setup - Complete Guide

## Important: Config and Data via Volumes

The Dockerfile now expects Railway volumes to provide `config/` and `data/` directories. The build context is `backend/`, so these directories aren't copied during build.

## Required Railway Volumes

You **must** set up these volumes in Railway for the app to work:

### 1. Config Volume (Required)

**Mount Path**: `/app/config`
**Size**: 100 MB

**Contents needed**:
- `active.json` - Will be created automatically by the app
- `scenarios/` directory with all scenario JSON files

**How to populate**:
1. Create the volume in Railway
2. Use Railway's file browser or SSH to copy files:
   - Copy all files from `config/scenarios/` to `/app/config/scenarios/`
   - The app will create `active.json` on first run

### 2. Data Volume (Optional but Recommended)

**Mount Path**: `/app/data`
**Size**: 50 MB

**Contents needed**:
- `venues/` directory with all venue JSON files

**How to populate**:
1. Create the volume in Railway
2. Copy all files from `data/venues/` to `/app/data/venues/`

### 3. Logs Volume (Required for Production)

**Mount Path**: `/app/logs`
**Size**: 1 GB

**Contents**: Created automatically by the app

## Quick Setup Steps

1. **Create Volumes in Railway**:
   - Go to Backend Service → Volumes tab
   - Add all three volumes with the mount paths above

2. **Populate Config Volume**:
   ```bash
   # Via Railway CLI or file browser
   # Copy config/scenarios/*.json to /app/config/scenarios/
   ```

3. **Populate Data Volume** (optional):
   ```bash
   # Copy data/venues/*.json to /app/data/venues/
   ```

4. **Redeploy** the service

## Alternative: Include Files in Image

If you prefer to include config/data in the Docker image instead of volumes:

1. Change Railway build context to project root
2. Update Dockerfile to copy config and data directories
3. Volumes will still take precedence if mounted

But the current setup (volumes only) is more flexible for updates.

## Verification

After setup, check:
- `/api/scenarios` returns scenario list (config volume working)
- `/api/events` works (data volume optional)
- `/health` endpoint responds

