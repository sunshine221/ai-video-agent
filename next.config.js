/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
  },
  // 允许 data/ 目录下的图片/音频被 /api/data/[...path] 路由处理
  async rewrites() {
    return [
      // 静态资源走 Next.js public/ 目录即可
    ];
  },
};

module.exports = nextConfig;
