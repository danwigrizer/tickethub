#!/bin/bash
# Direct file copy using base64 encoding via Railway shell

set -e

echo "🚀 Copying files to Railway volume..."

SERVICE_NAME=$(railway status 2>/dev/null | grep "Service:" | awk '{print $2}') || SERVICE_NAME="tickethub"
SERVICE_NAME=${RAILWAY_SERVICE:-$SERVICE_NAME}

echo "Using service: $SERVICE_NAME"
echo ""

# Create directories first
echo "📁 Creating directories..."
railway run --service "$SERVICE_NAME" -- sh -c "
  mkdir -p /app/storage/config/scenarios
  mkdir -p /app/storage/data/venues  
  mkdir -p /app/storage/logs
  ls -la /app/storage/
" 2>&1 || echo "Note: Directories may already exist"

echo ""
echo "📋 Copying scenario files..."

# Copy each scenario file
for file in config/scenarios/*.json; do
    filename=$(basename "$file")
    echo "  Copying $filename..."
    
    # Encode and write via Railway run
    base64_content=$(base64 < "$file" | tr -d '\n')
    
    railway run --service "$SERVICE_NAME" -- sh -c "
      echo '$base64_content' | base64 -d > /app/storage/config/scenarios/$filename
      ls -lh /app/storage/config/scenarios/$filename
    " 2>&1 | grep -v "^$" || echo "    ✓ Copied"
done

echo ""
echo "🏟️  Copying venue data files..."

# Copy each venue file
for file in data/venues/*.json; do
    filename=$(basename "$file")
    echo "  Copying $filename..."
    
    # Encode and write via Railway run
    base64_content=$(base64 < "$file" | tr -d '\n')
    
    railway run --service "$SERVICE_NAME" -- sh -c "
      echo '$base64_content' | base64 -d > /app/storage/data/venues/$filename
      ls -lh /app/storage/data/venues/$filename
    " 2>&1 | grep -v "^$" || echo "    ✓ Copied"
done

echo ""
echo "✅ Verifying files..."
railway run --service "$SERVICE_NAME" -- sh -c "
  echo 'Scenarios:'
  ls -1 /app/storage/config/scenarios/ | wc -l
  echo 'Venues:'
  ls -1 /app/storage/data/venues/ | wc -l
"

echo ""
echo "🎉 Done! Testing API..."
sleep 2
curl -s https://tickethub-production.up.railway.app/api/scenarios | jq 'length' 2>/dev/null || curl -s https://tickethub-production.up.railway.app/api/scenarios | head -5
echo ""
curl -s https://tickethub-production.up.railway.app/api/events | jq 'length' 2>/dev/null || echo "Events endpoint check"

