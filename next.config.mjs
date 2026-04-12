/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: { serverComponentsExternalPackages: ['mongoose'] },
  images: { domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'] },
};
export default nextConfig;
