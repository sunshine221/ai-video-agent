export { default } from 'next-auth/middleware';

/**
 * 路由守卫：未登录访问受保护页面时自动跳转到 /login。
 * 仅保护页面路由；API 各自在 handler 内做校验（见 getCurrentUserId）。
 * 排除：登录页、NextAuth 接口、注册接口、静态资源、data 资源代理。
 */
export const config = {
  matcher: [
    '/((?!login|api|_next/static|_next/image|favicon.ico).*)',
  ],
};
