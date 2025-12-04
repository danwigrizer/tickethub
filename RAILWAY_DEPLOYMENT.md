# Railway Deployment Guide

This guide covers the specific details for deploying the Ticket Marketplace application to Railway. It consolidates information about volume setup, file copying, and troubleshooting.

## Table of Contents

1. [Service Configuration](#service-configuration)
2. [Volume Setup](#volume-setup)
3. [Copying Configuration & Data](#copying-configuration--data)
4. [Frontend Setup](#frontend-setup)
5. [Troubleshooting](#troubleshooting)

---

## Service Configuration

For optimal performance and management, deploy the Frontend and Backend as **separate services** within the same Railway project.

### Backend Service (`tickethub`)

*   **Source**: GitHub Repo (`tickethub`)
*   **Root Directory**: `backend` (or empty if using project root context)
*   **Build Context**: Project Root (`.`) - *Crucial for accessing config/data directories*
*   **Dockerfile Path**: `backend/Dockerfile`
*   **Environment Variables**:
    *   `PORT`: `3001`
    *   `NODE_ENV`: `production`
    *   `CORS_ORIGIN`: `https://your-frontend-domain.up.railway.app` (or `*` for development)
    *   `MAX_LOG_ENTRIES`: `1000`

### Frontend Service (`frontend`)

*   **Source**: GitHub Repo (`tickethub`)
*   **Root Directory**: `frontend`
*   **Dockerfile Path**: `Dockerfile` (relative to root directory)
*   **Environment Variables**:
    *   `NEXT_PUBLIC_API_URL`: `https://your-backend-service.up.railway.app/api`
    *   `NODE_ENV`: `production`

---

## Volume Setup

Railway allows only **ONE volume per service**. We use a single volume mounted at `/app/storage` and symlink the necessary directories (`config`, `data`, `logs`) to it.

### Required Volume

*   **Service**: Backend (`tickethub`)
*   **Mount Path**: `/app/storage`
*   **Size**: 2 GB (recommended)

### Directory Structure in Volume

The application expects the following structure within the volume:

```
/app/storage/
├── config/
│   ├── active.json (created automatically)
│   └── scenarios/ (YOU must copy these files)
├── data/
│   └── venues/ (YOU must copy these files)
└── logs/ (created automatically)
```

**Note**: An entrypoint script in the Docker image automatically creates symlinks from `/app/config`, `/app/data`, and `/app/logs` to this storage volume on startup.

---

## Copying Configuration & Data

You need to populate the volume with your scenario and venue data. You can do this via the Railway CLI or the Web Interface.

### Method 1: Railway Web Interface (Easiest)

1.  Go to your **Backend Service** in Railway.
2.  Click the **Volumes** tab.
3.  Click on your volume (mounted at `/app/storage`).
4.  Use the file browser to upload files:
    *   Upload files from local `config/scenarios/` to `/app/storage/config/scenarios/`.
    *   Upload files from local `data/venues/` to `/app/storage/data/venues/`.

### Method 2: Railway CLI

If you have the Railway CLI installed (`npm i -g @railway/cli`):

```bash
# Link to your project
railway link

# Copy scenario files
railway run --service tickethub sh -c "mkdir -p /app/storage/config/scenarios"
# Note: Railway CLI doesn't support direct directory copy easily without tar/zip.
# It is often easier to use the Web Interface or a custom script.
```

*For a scripted approach using base64 encoding (useful for CI/CD or manual CLI usage), refer to `docs/archive/scripts/copy-to-railway.sh`.*

---

## Frontend Setup

### Common Issues

1.  **Build Context**: Ensure the Root Directory is set to `frontend` so the Dockerfile can find `package.json`.
2.  **API Connection**: The `NEXT_PUBLIC_API_URL` **must** be set in Railway variables *before* the build, or the frontend will not be able to talk to the backend.
    *   Format: `https://your-backend-project.up.railway.app/api`
    *   **Note**: It must include the `/api` suffix.

### Verification

After deployment:
1.  Visit your frontend URL.
2.  Events should load immediately.
3.  If you see a spinner forever, check the browser console for CORS errors or 404s on the API requests.

---

## Troubleshooting

### Backend "File Not Found" Errors

*   **Issue**: The app crashes saying it can't find `active.json` or scenario files.
*   **Fix**: Ensure the volume is mounted at `/app/storage`. Check that you have copied the files into the volume. The app defaults to empty directories if files are missing, but the Admin panel needs them.

### Frontend "Events Not Showing"

*   **Issue**: Frontend loads but shows "No events found".
*   **Fix**:
    1.  Check `NEXT_PUBLIC_API_URL` on the frontend service.
    2.  Check `CORS_ORIGIN` on the backend service.
    3.  Verify the backend `/api/events` endpoint returns JSON data using `curl`.

### Build Fails on "COPY data ..."

*   **Issue**: Docker build fails because it can't find `data` directory.
*   **Fix**: Ensure Build Context is set to Project Root (`.`) if your Dockerfile tries to copy files from the root. Alternatively, use the provided Dockerfile which relies on volumes and creating directories at runtime.

---

*For historical context and older setup scripts, check the `docs/archive/` directory.*
