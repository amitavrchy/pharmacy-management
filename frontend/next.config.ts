import type { NextConfig } from 'next';
const config: NextConfig = {
  agentRules: false,
  poweredByHeader: false,
  // Self-contained server bundle for the production Docker image (no effect on `next dev`).
  output: 'standalone',
  async rewrites() { return [{ source: '/api/:path*', destination: `${process.env.API_URL || 'http://127.0.0.1:4217'}/:path*` }]; },
  async headers() { return [{source:'/:path*',headers:[{key:'X-Content-Type-Options',value:'nosniff'},{key:'Referrer-Policy',value:'same-origin'},{key:'X-Frame-Options',value:'DENY'}]}]; }
};
export default config;
