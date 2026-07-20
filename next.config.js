/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ship the Chorus agent playbook with the MCP route's serverless bundle
    // (it's read with fs at runtime, so the tracer can't see it).
    outputFileTracingIncludes: { '/api/mcp/[transport]': ['./docs/chorus.md'] },
  },
  async rewrites() {
    // OAuth discovery for the remote MCP server (Chorus etc.). RFC 9728 allows
    // the resource path appended after the well-known segment — hence :path*.
    return [
      { source: '/.well-known/oauth-protected-resource', destination: '/api/oauth/prm' },
      { source: '/.well-known/oauth-protected-resource/:path*', destination: '/api/oauth/prm' },
      { source: '/.well-known/oauth-authorization-server', destination: '/api/oauth/asm' },
      { source: '/.well-known/oauth-authorization-server/:path*', destination: '/api/oauth/asm' },
      { source: '/.well-known/openid-configuration', destination: '/api/oauth/asm' },
    ]
  },
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
