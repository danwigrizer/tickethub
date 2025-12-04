# Railway Build Context Fix

## Issue: "COPY data /app/data" fails

The error `"/data": not found` means Railway's build context doesn't include the `data` directory.

## Solution: Set Build Context to Project Root

Railway needs to use the **project root** as the build context, not the `backend/` directory.

### Step 1: Configure Backend Service in Railway

1. Go to your **Backend Service** in Railway
2. Click **Settings** → **Build & Deploy**
3. Configure:
   - **Root Directory**: Leave **empty** (or set to `/`)
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `.` (dot = project root)

### Step 2: Verify Build Context

The Dockerfile expects these paths relative to project root:
- `backend/package*.json`
- `backend/server.js`
- `config/` (entire directory)
- `data/` (entire directory)

### Step 3: Alternative - Use Backend as Root

If Railway requires `backend/` as root directory:

**Option A: Update Dockerfile** (if backend is root):
```dockerfile
COPY package*.json ./
COPY server.js ./
COPY ../config /app/config
COPY ../data /app/data
```
But this won't work because Docker can't copy from outside build context.

**Option B: Copy files into backend/** (not recommended):
- Copy `config/` and `data/` into `backend/` before building
- Update Dockerfile to copy from current directory

**Option C: Use Railway Volumes** (recommended):
- Don't copy `data/` in Dockerfile
- Mount `data/` as a Railway volume
- Or include data files directly in the image differently

## Recommended Fix

**Set Railway build context to project root:**

1. Backend Service Settings:
   - **Root Directory**: (empty)
   - **Dockerfile Path**: `backend/Dockerfile`
   - **Docker Context**: `.` or leave empty

2. Redeploy the service

## Verification

After fixing, the build should show:
```
[6/8] COPY config /app/config
[7/8] COPY data /app/data
```
Both should succeed without errors.

## If Data Directory Still Not Found

If Railway still can't find `data/`:

1. **Check .dockerignore**: Ensure `data/` is not excluded
2. **Verify files are in repo**: `git ls-files data/` should show files
3. **Use Railway volume for data**: Mount `/app/data` as a volume instead of copying
4. **Include data in backend/**: Copy data files into backend directory structure

