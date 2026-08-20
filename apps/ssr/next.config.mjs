import path from "node:path";
import { fileURLToPath } from "node:url";

const appDirectory = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // Keep the development compiler cache separate from production builds.
  // Sharing `.next` lets a running `next dev` process read a stale chunk map
  // after `next build`, which surfaces as missing `./<chunk>.js` errors.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  transpilePackages: ["@shiguang/content", "@shiguang/ui", "@shiguang2/components"],
  experimental: {
    optimizePackageImports: ["lucide-react", "@shiguang2/components"],
  },
  webpack(config, { isServer }) {
    config.resolve.alias["refractor/all$"] = path.join(
      appDirectory,
      "app/vendor/refractor-lite.ts",
    );
    if (!isServer && config.optimization.splitChunks) {
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        xmarkdownPanZoom: {
          test: /[\\/]node_modules[\\/](?:\.pnpm[\\/][^/]+[\\/]node_modules[\\/])?svg-pan-zoom[\\/]/,
          name: "xmarkdown-pan-zoom",
          chunks: "async",
          enforce: true,
          priority: 50,
        },
      };
    }
    return config;
  },
};

export default nextConfig;
