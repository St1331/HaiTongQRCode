import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@haitong/shared'],
  async rewrites() {
    const apiOrigin = process.env.API_INTERNAL_URL ?? 'http://localhost:3001';
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default nextConfig;
