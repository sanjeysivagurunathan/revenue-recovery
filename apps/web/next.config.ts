// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ── Transpile shared monorepo packages ── */
  transpilePackages: ["@revenue-recovery/db", "@revenue-recovery/types"],

  /* ── Experimental features ── */
  experimental: {
    // Server Actions are stable in Next.js 15, but keep explicit opt-in for clarity
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  /* ── Logging ── */
  logging: {
    fetches: {
      fullUrl: process.env["NODE_ENV"] === "development",
    },
  },
};

export default nextConfig;
