# Backend Dockerfile
# Note: Build context should be ./backend directory
# Config and data directories are provided via Railway volumes
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code and entrypoint script
COPY server.js ./
COPY entrypoint.sh ./

# Create directory structure
# Railway allows only ONE volume per service, so we mount it at /app/storage
# The entrypoint script will create symlinks to the expected paths
RUN mkdir -p /app/storage/config/scenarios && \
    mkdir -p /app/storage/data/venues && \
    mkdir -p /app/storage/logs && \
    chmod +x entrypoint.sh && \
    chmod 755 -R /app/storage

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use entrypoint script to set up symlinks before starting
ENTRYPOINT ["/app/entrypoint.sh"]

