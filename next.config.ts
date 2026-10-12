import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // E2E tests run a second dev server with its own build folder.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  experimental: {
    // PDF / screenshot imports of LinkedIn profiles (Vercel caps requests at 4.5 MB).
    serverActions: { bodySizeLimit: "4mb" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
