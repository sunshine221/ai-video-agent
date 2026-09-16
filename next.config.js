/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '20mb',
    },
    // playwright / ffmpeg-static 含原生二进制，不能被 Next.js 打包，需保持外部依赖
    serverComponentsExternalPackages: ['playwright', 'playwright-core', 'ffmpeg-static'],
  },
  // 允许 data/ 目录下的图片/音频被 /api/data/[...path] 路由处理
  async rewrites() {
    return [
      // 静态资源走 Next.js public/ 目录即可
    ];
  },
};

module.exports = nextConfig;
