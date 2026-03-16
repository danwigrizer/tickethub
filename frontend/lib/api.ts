// API configuration utility
// This centralizes the API URL configuration for the frontend

// Client-side: NEXT_PUBLIC_API_URL is baked at build time
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

// Server-side: read at runtime for SSR fetches (falls back to the build-time value)
export function getServerApiUrl() {
  return process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
}

