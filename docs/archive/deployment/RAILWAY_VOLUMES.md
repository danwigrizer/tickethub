# Railway Volumes Setup Guide

This guide shows you how to set up Railway volumes for persistent storage of logs and configuration.

## Backend Storage Needs

The backend needs persistent storage for:
- **`/app/logs`** - Request logs (`requests.jsonl`)
- **`/app/config`** - Active configuration (`active.json` and `scenarios/`)
- **`/app/data`** - Venue data (read-only, can be in image or volume)

## Setting Up Railway Volumes

### Step 1: Add Volumes to Backend Service

1. In Railway, go to your **Backend Service**
2. Click on the **Volumes** tab (in the left sidebar)
3. Click **+ New Volume** button

### Step 2: Create Logs Volume

Create the first volume for logs:
- **Mount Path**: `/app/logs`
- **Name**: `logs` (or any descriptive name)
- **Size**: `1 GB` (or adjust based on your needs)
- Click **Add**

### Step 3: Create Config Volume

Create the second volume for configuration:
- **Mount Path**: `/app/config`
- **Name**: `config` (or any descriptive name)
- **Size**: `100 MB` (config files are small)
- Click **Add**

### Step 4: (Optional) Create Data Volume

If you want venue data to be persistent and editable:
- **Mount Path**: `/app/data`
- **Name**: `data`
- **Size**: `50 MB`
- Click **Add**

**Note**: If you don't create a data volume, the venue data will be included in the Docker image (read-only).

### Step 5: Initialize Volume Contents

After creating volumes, you need to populate them with initial data:

1. **For Config Volume:**
   - The app will automatically create `active.json` on first run
   - To populate `scenarios/` directory, you can:
     - SSH into the container and copy files, OR
     - Include scenarios in the Docker image (current setup does this)

2. **For Logs Volume:**
   - The app will automatically create the `requests.jsonl` file when it starts logging

3. **For Data Volume (if created):**
   - Venue data will be copied from the image on first run, OR
   - You can manually copy files via Railway's file browser

## How It Works

- **Volumes persist** across container restarts and redeployments
- **Files in volumes** are stored separately from the container
- **If you redeploy**, your logs and config will remain intact
- **Volume paths** must match exactly: `/app/logs`, `/app/config`, `/app/data`

## Verifying Volumes

After deployment:

1. Check that logs are being written:
   ```bash
   # Via Railway CLI or check the logs endpoint
   curl https://your-backend.railway.app/api/logs
   ```

2. Check that config persists:
   - Make a config change via admin panel
   - Redeploy the service
   - Config should still have your changes

## Troubleshooting

**Volume not mounting?**
- Check the mount path is exactly `/app/logs` (case-sensitive)
- Ensure the volume was created before the service started
- Redeploy the service after adding volumes

**Files not persisting?**
- Verify volumes are listed in the Volumes tab
- Check that the app is writing to the correct paths
- Look at service logs for any permission errors

**Permission errors?**
- The Dockerfile creates directories with proper permissions
- If issues persist, check Railway volume permissions in settings

## Current Dockerfile Setup

The Dockerfile is configured to:
- Create directories at `/app/logs`, `/app/config`, `/app/data`
- Work with or without volumes (volumes take precedence)
- Include default config and data in the image as fallback

## Best Practices

1. **Logs Volume**: Essential for production - keeps request history
2. **Config Volume**: Recommended - preserves admin panel changes
3. **Data Volume**: Optional - only needed if you want to edit venue data

## Cost Consideration

Railway volumes are included in your plan:
- Small volumes (under 1GB) are typically free
- Check your Railway plan for volume limits

