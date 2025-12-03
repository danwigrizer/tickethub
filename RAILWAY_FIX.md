# Railway Deployment Fix

## Issue: VOLUME keyword banned

Railway doesn't allow `VOLUME` instructions in Dockerfiles. The Dockerfiles have been updated to be Railway-compliant.

## Updated Build Context

The backend Dockerfile now expects the build context to be the **project root**, not `./backend`.

## Railway Service Configuration

When setting up your backend service in Railway:

### Option 1: Use Root Directory (Recommended)

1. In Railway backend service settings:
   - **Root Directory**: Leave empty (or set to `/`)
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `.` (project root)

### Option 2: Use Backend Directory

If Railway requires a specific root directory:

1. **Root Directory**: `backend`
2. **Dockerfile Path**: `Dockerfile` (relative to backend/)
3. You'll need to copy config/data into backend/ before building, OR
4. Use Railway volumes to mount config and data

## Railway Volumes (For Persistent Storage)

If you want persistent logs and config:

1. Go to your **Backend Service** in Railway
2. Click **Volumes** tab
3. Add volumes:
   - **Path**: `/app/logs` → **Name**: `logs`
   - **Path**: `/app/config` → **Name**: `config` (optional, config can be in image)

The `data/venues/` directory is included in the image, so no volume needed.

## Quick Fix Steps

1. **Update Railway service settings:**
   - Set Dockerfile path: `backend/Dockerfile`
   - Set Docker context: `.` (project root)
   - Or set Root Directory to project root

2. **Redeploy** the service

3. **Add volumes** (optional) for persistent logs/config

## Verification

After deployment, check:
- `/health` endpoint works
- `/api/scenarios` returns scenario list (config/scenarios loaded)
- `/api/events` returns events (data/venues loaded)

