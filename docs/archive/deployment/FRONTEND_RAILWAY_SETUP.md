# Frontend Railway Deployment Guide

## Common Build Issues

### Issue 1: Build Context

Railway might be using the wrong build context. The frontend Dockerfile expects the build context to be the `frontend/` directory.

**Fix in Railway:**
1. Go to Frontend Service → Settings → Build & Deploy
2. Set **Root Directory**: `frontend`
3. Set **Dockerfile Path**: `Dockerfile` (relative to frontend/)
4. Or leave Root Directory empty and set **Dockerfile Path**: `frontend/Dockerfile`

### Issue 2: Missing Build Argument

The Dockerfile requires `NEXT_PUBLIC_API_URL` as a build argument.

**Fix in Railway:**
1. Go to Frontend Service → Settings → Variables
2. Add build-time variable:
   - **Name**: `NEXT_PUBLIC_API_URL`
   - **Value**: Your backend URL (e.g., `https://your-backend.railway.app/api`)
   - **Type**: Build-time variable (or Environment Variable)

### Issue 3: Missing Dependencies

If build fails with "module not found" errors, ensure all dependencies are in `package.json`.

### Issue 4: TypeScript Errors

If TypeScript errors prevent build:
- Check `tsconfig.json` configuration
- Ensure all type definitions are installed
- Consider adding `typescript` to dependencies (not just devDependencies) if needed

## Railway Service Configuration

### Step 1: Create Frontend Service

1. In Railway, create a **New Service**
2. Select **GitHub Repo** → Choose `tickethub`
3. Railway will auto-detect - configure it properly

### Step 2: Configure Build Settings

**Option A: Root Directory Method**
- **Root Directory**: `frontend`
- **Dockerfile Path**: `Dockerfile`
- **Docker Context**: `.` (frontend directory)

**Option B: Project Root Method**
- **Root Directory**: (empty)
- **Dockerfile Path**: `frontend/Dockerfile`
- **Docker Context**: `frontend`

### Step 3: Set Environment Variables

**Required:**
- `NEXT_PUBLIC_API_URL` - Your backend API URL (e.g., `https://your-backend.railway.app/api`)
- `NODE_ENV=production`

**Build Arguments:**
- `NEXT_PUBLIC_API_URL` - Must be set as a build argument for the Docker build

### Step 4: Build Arguments in Railway

Railway should automatically use environment variables as build arguments, but you can also:
1. Go to Settings → Build & Deploy
2. Add build arguments if Railway doesn't auto-detect them

## Troubleshooting

### Build Fails with "Cannot find module"

**Solution**: Ensure `package.json` has all dependencies and Railway is installing them correctly.

### Build Fails with "NEXT_PUBLIC_API_URL is not defined"

**Solution**: Set `NEXT_PUBLIC_API_URL` as a build-time environment variable in Railway.

### Build Succeeds but App Doesn't Work

**Solution**: 
- Check that `NEXT_PUBLIC_API_URL` is set correctly
- Verify backend is accessible from frontend
- Check CORS settings on backend

### "server.js not found" Error

**Solution**: The standalone output should create `server.js` automatically. If not, check Next.js config has `output: 'standalone'`.

## Quick Checklist

- [ ] Frontend service created in Railway
- [ ] Root Directory or Dockerfile Path configured correctly
- [ ] `NEXT_PUBLIC_API_URL` set as environment variable
- [ ] `NEXT_PUBLIC_API_URL` available during build (build argument)
- [ ] Backend service is deployed and accessible
- [ ] CORS configured on backend to allow frontend domain

