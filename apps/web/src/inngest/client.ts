/**
 * apps/web/src/inngest/client.ts
 *
 * Inngest client configuration with automatic local dev detection.
 */

import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "revenue-recovery",
  isDev: process.env.NODE_ENV !== "production" || process.env.INNGEST_DEV === "1",
});
