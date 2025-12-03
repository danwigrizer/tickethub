# Environment Variables Examples

This document provides example environment variable configurations for different deployment scenarios.

## Backend Environment Variables

Create a `.env` file in the `backend/` directory:

### Development
```env
PORT=3001
NODE_ENV=development
CORS_ORIGIN=*
MAX_LOG_ENTRIES=1000
```

### Production
```env
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com,https://www.yourdomain.com
MAX_LOG_ENTRIES=1000
```

### Docker/Container
```env
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://yourdomain.com
MAX_LOG_ENTRIES=1000
```

## Frontend Environment Variables

Create a `.env.local` file in the `frontend/` directory:

### Development
```env
NEXT_PUBLIC_API_URL=http://localhost:3001/api
NODE_ENV=development
```

### Production (Same Domain)
```env
NEXT_PUBLIC_API_URL=/api
NODE_ENV=production
```

### Production (Different Domain/Subdomain)
```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
NODE_ENV=production
```

### Docker/Container
```env
NEXT_PUBLIC_API_URL=http://backend:3001/api
NODE_ENV=production
```

## Docker Compose Environment Variables

Create a `.env` file in the project root for Docker Compose:

### Basic Setup
```env
BACKEND_PORT=3001
FRONTEND_PORT=3000
CORS_ORIGIN=https://yourdomain.com
NEXT_PUBLIC_API_URL=https://api.yourdomain.com/api
```

### Local Development with Docker
```env
BACKEND_PORT=3001
FRONTEND_PORT=3000
CORS_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3001/api
```

## Notes

- **CORS_ORIGIN**: In production, specify exact origins. Use `*` only for development.
- **NEXT_PUBLIC_**: Prefix is required for Next.js environment variables that need to be available in the browser.
- **Port Configuration**: Ensure ports don't conflict with other services.
- **Security**: Never commit `.env` files to version control. They are already in `.gitignore`.

