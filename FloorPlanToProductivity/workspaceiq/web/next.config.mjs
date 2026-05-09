/** @type {import('next').NextConfig} */
const nextConfig = {
  typedRoutes: true,
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
      "konva/lib/index-node.js": "konva/lib/index.js"
    };

    return config;
  }
};

export default nextConfig;
