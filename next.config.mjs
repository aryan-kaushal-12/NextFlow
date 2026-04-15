/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**.transloadit.com' },
      { protocol: 'https', hostname: '**.tlcdn.com' },
      { protocol: 'https', hostname: 'img.clerk.com' },
    ],
  },
  webpack: (config) => {
    config.externals = [...(config.externals || []), { canvas: 'canvas' }];
    return config;
  },
};

export default nextConfig;
