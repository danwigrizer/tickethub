#!/bin/sh
# Entrypoint script to set up symlinks for single Railway volume

# Create symlinks from expected paths to the storage volume
# This allows the app to use /app/config, /app/data, /app/logs
# while Railway volume is mounted at /app/storage

if [ ! -L /app/config ]; then
  ln -sf /app/storage/config /app/config
fi

if [ ! -L /app/data ]; then
  ln -sf /app/storage/data /app/data
fi

if [ ! -L /app/logs ]; then
  ln -sf /app/storage/logs /app/logs
fi

# Ensure subdirectories exist
mkdir -p /app/storage/config/scenarios
mkdir -p /app/storage/data/venues
mkdir -p /app/storage/logs

# Start the application
exec node server.js

