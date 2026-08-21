// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* ── Only transpile types package — db package must stay server-only ── */
  transpilePackages: ["@revenue-recovery/types"],

  /* ── Keep Prisma and its Node.js built-ins out of the webpack bundle ── */
  serverExternalPackages: ["@prisma/client", "@revenue-recovery/db"],

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
