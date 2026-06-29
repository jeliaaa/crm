/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['cheerio'],
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
