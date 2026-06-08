/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: '/control/:clientId/youtube-ads',
        destination: '/control/:clientId/paid-ads',
        permanent: true,
      },
    ]
  },
}
module.exports = nextConfig
