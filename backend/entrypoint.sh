#!/bin/sh
# Entrypoint script for TicketHub backend

# Ensure logs directory exists
mkdir -p /app/logs

# Storage volume symlinks (for Railway single-volume architecture)
mkdir -p /app/storage/logs

if [ -d /app/logs ] && [ ! -L /app/logs ]; then
  rm -rf /app/logs
fi
if [ ! -L /app/logs ]; then
  ln -sf /app/storage/logs /app/logs
fi

# Start the application
exec node server.js
