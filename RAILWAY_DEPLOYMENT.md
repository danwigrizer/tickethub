# Railway Deployment Guide

## Issue: Auto-detection vs Docker

Railway is trying to auto-detect your build from `package.json` instead of using Docker. Here's how to fix it:

## Solution 1: Deploy Services Separately (Recommended)

Railway works best when you deploy frontend and backend as separate services:

### Step 1: Create Backend Service

1. In Railway, create a **New Service**
2. Select **GitHub Repo** → Choose `tickethub`
3. Railway will auto-detect - **IMPORTANT**: Click on the service settings
4. Go to **Settings** → **Build & Deploy**
5. Set:
   - **Root Directory**: `backend`
   - **Build Command**: Leave empty (Docker will handle it)
   - **Start Command**: Leave empty (Docker will handle it)
6. Or use **Dockerfile** option and set:
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `backend`

### Step 2: Create Frontend Service

1. Create another **New Service** in the same project
2. Select **GitHub Repo** → Choose `tickethub` (same repo)
3. Go to **Settings** → **Build & Deploy**
4. Set:
   - **Root Directory**: `frontend`
   - **Build Command**: Leave empty (Docker will handle it)
   - **Start Command**: Leave empty (Docker will handle it)
5. Or use **Dockerfile** option and set:
   - **Dockerfile Path**: `frontend/Dockerfile`
   - **Docker Context**: `frontend`

### Step 3: Configure Environment Variables

**Backend Service:**
- `PORT=3001`
- `NODE_ENV=production`
- `CORS_ORIGIN=https://your-frontend-domain.railway.app` (or your custom domain)
- `MAX_LOG_ENTRIES=1000`

**Frontend Service:**
- `NODE_ENV=production`
- `NEXT_PUBLIC_API_URL=https://your-backend-service.railway.app/api` (use Railway's generated URL)

### Step 4: Add Custom Domains

After services are deployed:
1. Backend: Add custom domain (e.g., `api.yourdomain.com`)
2. Frontend: Add custom domain (e.g., `yourdomain.com`)
3. Update `CORS_ORIGIN` and `NEXT_PUBLIC_API_URL` with your custom domains

## Solution 2: Use Railway's Docker Compose (Alternative)

Railway also supports Docker Compose, but it's in beta:

1. Create a **New Project**
2. Select **Deploy from GitHub repo**
3. Choose your repo
4. Railway should detect `docker-compose.yml`
5. If not, go to **Settings** → **Service** → Enable **Docker Compose**

## Solution 3: Fix Root Build (If you want monorepo)

If Railway keeps trying to build from root, you can fix the root `package.json`:

The issue is that `npm run build` tries to run `next` but dependencies aren't installed. However, **we recommend using Docker instead**.

## Quick Fix: Remove Root Build Script

If Railway keeps auto-detecting, you can temporarily remove the build script from root `package.json`, but this isn't ideal.

## Recommended Approach

**Deploy as two separate services** - this is the most reliable way on Railway and gives you:
- Independent scaling
- Separate logs
- Better resource management
- Easier debugging

