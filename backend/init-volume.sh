#!/bin/sh
# Script to initialize volume with default files if empty
# This runs in the entrypoint before starting the server

# Check if scenarios directory is empty and copy defaults if needed
if [ ! -f /app/storage/config/scenarios/transparent-pricing.json ]; then
  echo "Volume is empty, but app will work with default config."
  echo "Scenario files can be added via Railway's volume management."
  echo "The app will create active.json automatically on first API call."
fi

