# Railway Volumes Setup

Railway doesn't allow `VOLUME` in Dockerfiles. Instead, use Railway's volume system.

## Backend Storage Needs

The backend needs persistent storage for:
- `logs/requests.jsonl` - Request logs
- `config/active.json` - Active configuration
- `data/venues/` - Venue data (read-only, can be in image)

## Option 1: Use Railway Volumes (Recommended)

### Step 1: Add Volume to Backend Service

1. In Railway, go to your **Backend Service**
2. Click on **Volumes** tab
3. Click **+ New Volume**
4. Create volumes:
   - **Path**: `/app/logs`
     - **Name**: `logs` (or any name)
   - **Size**: 1GB (or as needed)
   
   - **Path**: `/app/config`
     - **Name**: `config`
     - **Size**: 100MB

### Step 2: Data Directory

The `data/venues/` directory is read-only and can be included in the Docker image (already done).

## Option 2: Use Ephemeral Storage (Simpler, but data lost on restart)

If you don't need persistent logs/config, the app will work with ephemeral storage. Logs and config will be lost when the service restarts.

## Option 3: Use Environment Variables for Config

You can modify the app to use environment variables instead of `config/active.json` for configuration. This is more cloud-native.

## Current Setup

The Dockerfiles are already Railway-compliant (no VOLUME instructions). You just need to:
1. Add Railway volumes for persistent storage (Option 1), OR
2. Accept ephemeral storage (Option 2)

The app will work either way - volumes just provide persistence.

