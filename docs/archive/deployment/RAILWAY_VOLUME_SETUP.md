# Railway Volume Setup - Complete Guide

## Important: Single Volume Setup

**Railway allows only ONE volume per service**, so we use a single volume mounted at `/app/storage` with symlinks to the expected paths.

## Required Railway Volume

You **must** set up ONE volume in Railway:

### Storage Volume (Required)

**Mount Path**: `/app/storage`
**Size**: 2 GB (or adjust based on your needs)

**Structure**:
```
/app/storage/
├── config/
│   ├── active.json (created automatically)
│   └── scenarios/ (copy your scenario files here)
├── data/
│   └── venues/ (copy your venue files here)
└── logs/ (created automatically)
```

**How it works**:
- The entrypoint script creates symlinks:
  - `/app/config` → `/app/storage/config`
  - `/app/data` → `/app/storage/data`
  - `/app/logs` → `/app/storage/logs`
- Your app code uses `/app/config`, `/app/data`, `/app/logs` as normal
- All data is stored in the single `/app/storage` volume

## Quick Setup Steps

1. **Create Volume in Railway**:
   - Go to Backend Service → Volumes tab
   - Click "+ New Volume"
   - **Mount Path**: `/app/storage`
   - **Name**: `storage` (or any name)
   - **Size**: 2 GB
   - Click "Add"

2. **Populate the Volume**:
   After deployment, use Railway's file browser or SSH to copy files:
   ```bash
   # Copy scenario files
   # Copy config/scenarios/*.json to /app/storage/config/scenarios/
   
   # Copy venue files (optional)
   # Copy data/venues/*.json to /app/storage/data/venues/
   ```

3. **Redeploy** the service (the entrypoint script will create symlinks automatically)

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

