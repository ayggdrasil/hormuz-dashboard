import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: {
    // Keep workspace root stable for local/Vercel builds when parent folders have lockfiles.
    root: process.cwd(),
  },
};

export default nextConfig;
