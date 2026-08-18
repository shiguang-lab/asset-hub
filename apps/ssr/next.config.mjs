/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@shiguang/content", "@shiguang/markdown-viewer", "@shiguang2/components"],
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
