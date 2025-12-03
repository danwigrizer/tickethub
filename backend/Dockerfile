# Backend Dockerfile
# Note: Build context should be the project root, not ./backend
# This allows copying config and data directories
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY backend/server.js ./

# Copy config directory (needed for scenarios)
# This will be used as default if Railway volumes are not mounted
# If volumes are mounted at /app/config, they take precedence
COPY config /app/config

# Create data directory structure
# Data directory is optional - app works without it (uses default venue data)
# If data exists in build context, copy it; otherwise create empty structure
# Railway volumes can mount /app/data if needed
RUN mkdir -p /app/data/venues

# Create logs directory
# Railway volume should be mounted at /app/logs for persistent storage
RUN mkdir -p /app/logs && \
    chmod 755 /app/logs && \
    chmod 755 /app/config && \
    chmod 755 /app/data

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]

