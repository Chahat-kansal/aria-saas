export { default } from 'next-auth/middleware';

export const config = {
  matcher: ['/chat/:path*', '/settings/:path*'],
};
