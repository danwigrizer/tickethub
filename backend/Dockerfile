# Backend Dockerfile
# Note: Build context should be ./backend directory
# Config and data directories are provided via Railway volumes
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY server.js ./

# Create directory structure for config, data, and logs
# These directories will be populated by Railway volumes
# The app handles missing directories gracefully
RUN mkdir -p /app/config/scenarios && \
    mkdir -p /app/data/venues && \
    mkdir -p /app/logs && \
    chmod 755 /app/config && \
    chmod 755 /app/data && \
    chmod 755 /app/logs

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start server
CMD ["node", "server.js"]

