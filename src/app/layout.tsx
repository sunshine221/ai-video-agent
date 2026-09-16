import type { Metadata } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';
import { Providers } from '@/components/providers';
import './globals.css';

// 使用本地字体文件，避免构建时依赖网络下载 Google 字体导致启动卡顿/失败
const inter = localFont({
  src: [
    { path: './fonts/Inter-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/Inter-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/Inter-Bold.woff2', weight: '700', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
  fallback: ['system-ui', 'sans-serif'],
});

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || 'AI 视频制作智能体',
  description: 'AI 自动生成视频脚本、分镜、画面、旁白，一站式创作平台',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" className={inter.variable}>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <Providers>
          {children}
          <Toaster position="top-center" richColors />
        </Providers>
      </body>
    </html>
  );
}
