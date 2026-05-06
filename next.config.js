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
}

module.exports = nextConfig