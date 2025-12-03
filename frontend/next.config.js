/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone', // Optimize for production deployment
  // Enable compression
  compress: true,
  // Production optimizations
  poweredByHeader: false, // Remove X-Powered-By header for security
  // Image optimization
  images: {
    unoptimized: false,
  },
}

module.exports = nextConfig

