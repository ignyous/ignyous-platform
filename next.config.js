/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.wpengine.com' },
      { protocol: 'https', hostname: '**.siteground.site' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'secure.gravatar.com' },
    ],
  },
  // Include the WordPress plugin source so the /api/baseline/bridge.zip route can build the zip on demand.
  outputFileTracingIncludes: {
    '/api/baseline/bridge.zip': ['./plugin/ignyous-bridge-baseline/**/*'],
  },
}

module.exports = nextConfig