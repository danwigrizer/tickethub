#!/bin/bash
# Script to copy config and data files to Railway volume

set -e

echo "🚀 Copying files to Railway volume..."

# Check if Railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI not found. Installing..."
    npm i -g @railway/cli
    echo "✅ Railway CLI installed. Please run 'railway login' first."
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway. Please run 'railway login'"
    exit 1
fi

echo "📁 Creating directories in Railway volume..."

# Create directories
railway run --service backend sh -c "mkdir -p /app/storage/config/scenarios && mkdir -p /app/storage/data/venues"

echo "📋 Copying scenario files..."

# Copy scenario files using base64 encoding
for file in config/scenarios/*.json; do
    filename=$(basename "$file")
    echo "  Copying $filename..."
    
    # Encode file to base64 and copy via Railway
    base64_content=$(base64 < "$file")
    railway run --service backend sh -c "echo '$base64_content' | base64 -d > /app/storage/config/scenarios/$filename"
done

echo "🏟️  Copying venue data files..."

# Copy venue files using base64 encoding
for file in data/venues/*.json; do
    filename=$(basename "$file")
    echo "  Copying $filename..."
    
    # Encode file to base64 and copy via Railway
    base64_content=$(base64 < "$file")
    railway run --service backend sh -c "echo '$base64_content' | base64 -d > /app/storage/data/venues/$filename"
done

echo "✅ Files copied successfully!"
echo ""
echo "Verifying files..."
railway run --service backend sh -c "ls -la /app/storage/config/scenarios/ && echo '---' && ls -la /app/storage/data/venues/"

echo ""
echo "🎉 Done! Your files are now in the Railway volume."

