/**
 * apps/web/src/app/api/inngest/route.ts
 *
 * Inngest endpoint serving all background agent functions.
 */

import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { recoveryPipelineFunction } from "@/inngest/pipeline";
import { checkoutAbandonmentDetectorFunction } from "@/inngest/checkoutAbandonmentDetector";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [recoveryPipelineFunction, checkoutAbandonmentDetectorFunction],
});
