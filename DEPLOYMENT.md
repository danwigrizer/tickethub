# Deployment Guide

This guide covers deploying the Fake Ticket Marketplace application to production environments.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Deployment Options](#deployment-options)
  - [Docker Deployment](#docker-deployment)
  - [Manual Deployment](#manual-deployment)
  - [Cloud Platform Deployment](#cloud-platform-deployment)
- [Post-Deployment](#post-deployment)
- [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18+ installed
- npm or yarn package manager
- Docker and Docker Compose (for Docker deployment)
- Access to a server or cloud platform

## Environment Variables

### Backend Environment Variables

Create a `.env` file in the `backend/` directory:

```env
# Server Configuration
PORT=3001
NODE_ENV=production

# CORS Configuration
# Comma-separated list of allowed origins (e.g., "https://example.com,https://www.example.com")
# For production, specify exact origins instead of "*"
CORS_ORIGIN=https://yourdomain.com

# Logging
MAX_LOG_ENTRIES=1000
```

### Frontend Environment Variables

Create a `.env.local` file in the `frontend/` directory:

```env
# API Configuration
# Set this to your backend API URL
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api

# Next.js Configuration
NODE_ENV=production
```

**Important:** For Next.js, environment variables that should be available in the browser must be prefixed with `NEXT_PUBLIC_`.

## Deployment Options

### Docker Deployment

The easiest way to deploy the application is using Docker Compose.

#### 1. Prepare Environment Variables

Create a `.env` file in the project root:

```env
# Backend Configuration
BACKEND_PORT=3001
CORS_ORIGIN=https://yourdomain.com

# Frontend Configuration
FRONTEND_PORT=3000
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

#### 2. Build and Start Services

```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

#### 3. Update Services

```bash
# Rebuild and restart
docker-compose up -d --build

# Restart specific service
docker-compose restart backend
docker-compose restart frontend
```

#### 4. Health Checks

The backend includes a health check endpoint:
```bash
curl http://localhost:3001/health
```

### Manual Deployment

#### Backend Deployment

1. **Install Dependencies:**
   ```bash
   cd backend
   npm install --production
   ```

2. **Set Environment Variables:**
   Create a `.env` file in the `backend/` directory with the required variables.

3. **Start the Server:**
   ```bash
   npm start
   ```

   Or use a process manager like PM2:
   ```bash
   npm install -g pm2
   pm2 start server.js --name ticket-backend
   pm2 save
   pm2 startup
   ```

#### Frontend Deployment

1. **Build the Application:**
   ```bash
   cd frontend
   npm install
   npm run build
   ```

2. **Set Environment Variables:**
   Create a `.env.local` file with `NEXT_PUBLIC_API_URL` pointing to your backend.

3. **Start the Production Server:**
   ```bash
   npm start
   ```

   Or use PM2:
   ```bash
   pm2 start npm --name ticket-frontend -- start
   pm2 save
   ```

### Cloud Platform Deployment

#### Vercel (Frontend)

1. Install Vercel CLI:
   ```bash
   npm i -g vercel
   ```

2. Deploy:
   ```bash
   cd frontend
   vercel
   ```

3. Set environment variables in Vercel dashboard:
   - `NEXT_PUBLIC_API_URL`: Your backend API URL

#### Railway / Render / Heroku

1. **Backend:**
   - Connect your repository
   - Set build command: `cd backend && npm install`
   - Set start command: `cd backend && npm start`
   - Configure environment variables

2. **Frontend:**
   - Connect your repository
   - Set build command: `cd frontend && npm install && npm run build`
   - Set start command: `cd frontend && npm start`
   - Configure environment variables (especially `NEXT_PUBLIC_API_URL`)

#### AWS / GCP / Azure

Use container services (ECS, Cloud Run, Container Instances) with the provided Dockerfiles:

1. Build Docker images:
   ```bash
   docker build -t ticket-backend ./backend
   docker build -t ticket-frontend ./frontend
   ```

2. Push to container registry
3. Deploy using your platform's container service

## Post-Deployment

### 1. Verify Health Checks

```bash
# Backend health check
curl https://api.yourdomain.com/health

# Should return:
# {"status":"ok","timestamp":"...","environment":"production","uptime":...}
```

### 2. Test API Endpoints

```bash
# Test events endpoint
curl https://api.yourdomain.com/api/events

# Test configuration endpoint
curl https://api.yourdomain.com/api/config
```

### 3. Configure Reverse Proxy (Recommended)

For production, use a reverse proxy like Nginx:

**Nginx Configuration Example:**

```nginx
# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Frontend
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. SSL/TLS Configuration

Use Let's Encrypt with Certbot:

```bash
sudo certbot --nginx -d yourdomain.com -d api.yourdomain.com
```

### 5. Firewall Configuration

Ensure ports are properly configured:
- Backend: 3001 (or your configured port)
- Frontend: 3000 (or your configured port)
- Or use reverse proxy on ports 80/443

## Troubleshooting

### Backend Issues

**Port already in use:**
```bash
# Find process using port
lsof -i :3001
# Kill process or change PORT in .env
```

**CORS errors:**
- Verify `CORS_ORIGIN` environment variable includes your frontend domain
- Check that the frontend URL matches exactly (including protocol and port)

**Configuration not loading:**
- Ensure `config/active.json` exists or can be created
- Check file permissions on the config directory

### Frontend Issues

**API connection errors:**
- Verify `NEXT_PUBLIC_API_URL` is set correctly
- Ensure the backend is accessible from the frontend
- Check CORS configuration on backend

**Build errors:**
- Clear `.next` directory: `rm -rf frontend/.next`
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check Node.js version (requires 18+)

**Environment variables not working:**
- Remember: Browser-accessible variables must start with `NEXT_PUBLIC_`
- Rebuild the application after changing environment variables
- Check that variables are set before the build process

### Docker Issues

**Container won't start:**
```bash
# Check logs
docker-compose logs backend
docker-compose logs frontend

# Check container status
docker-compose ps
```

**Port conflicts:**
- Change ports in `docker-compose.yml` or `.env` file
- Check if ports are already in use: `lsof -i :3000` or `lsof -i :3001`

**Volume permissions:**
- Ensure the `logs` directory has write permissions
- Check that `config` and `data` directories are readable

## Security Considerations

1. **Environment Variables:** Never commit `.env` files to version control
2. **CORS:** Restrict CORS origins in production (don't use `*`)
3. **HTTPS:** Always use HTTPS in production
4. **Rate Limiting:** Consider adding rate limiting for production use
5. **Authentication:** Add authentication if exposing admin panel publicly
6. **Logs:** Be mindful of sensitive data in logs
7. **Dependencies:** Regularly update dependencies for security patches

## Monitoring

### Health Check Monitoring

Set up monitoring to check the `/health` endpoint:
- Uptime monitoring services (UptimeRobot, Pingdom)
- Cloud platform health checks
- Custom monitoring scripts

### Log Monitoring

- Backend logs are stored in `logs/requests.jsonl`
- Consider using log aggregation services (Loggly, Papertrail, etc.)
- Set up log rotation to prevent disk space issues

## Backup

Important files to backup:
- `config/active.json` - Current configuration
- `logs/requests.jsonl` - Request logs (if needed)
- Environment variable files (securely)

## Scaling

For high-traffic scenarios:

1. **Backend Scaling:**
   - Use a load balancer
   - Run multiple backend instances
   - Consider using a shared session store if adding sessions

2. **Frontend Scaling:**
   - Next.js can be deployed to CDN (Vercel, Cloudflare Pages)
   - Use static generation where possible
   - Enable caching headers

3. **Database (if added):**
   - Use connection pooling
   - Consider read replicas for read-heavy workloads

## Support

For issues or questions:
1. Check the logs: `docker-compose logs` or application logs
2. Verify environment variables are set correctly
3. Test health endpoints
4. Review this deployment guide

