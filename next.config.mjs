/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['cheerio', 'pdfkit', 'fontkit'],
    staleTimes: {
      dynamic: 0,
    },
    // pdfkit reads the invoice fonts from disk at request time; make sure
    // they ship with the serverless function.
    outputFileTracingIncludes: {
      '/api/invoices/generate': [
        './node_modules/@fontsource/noto-sans-georgian/files/*.woff',
        './node_modules/@fontsource/noto-sans/files/*-cyrillic-*.woff',
      ],
    },
  },
};

export default nextConfig;
