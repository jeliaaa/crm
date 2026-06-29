/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['cheerio'],
  experimental: {
    staleTimes: {
      dynamic: 0,
    },
  },
};

export default nextConfig;
