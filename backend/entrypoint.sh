#!/bin/sh
# Entrypoint script to set up symlinks for single Railway volume

# Ensure storage directories exist first (before creating symlinks)
mkdir -p /app/storage/config/scenarios
mkdir -p /app/storage/data/venues
mkdir -p /app/storage/logs

# Remove existing directories if they exist (but not if they're already symlinks)
if [ -d /app/config ] && [ ! -L /app/config ]; then
  rm -rf /app/config
fi
if [ -d /app/data ] && [ ! -L /app/data ]; then
  rm -rf /app/data
fi
if [ -d /app/logs ] && [ ! -L /app/logs ]; then
  rm -rf /app/logs
fi

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

# Start the application
exec node server.js

