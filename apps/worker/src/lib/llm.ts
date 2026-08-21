import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { DiagnosisOutput, DecisionOutput } from "@revenue-recovery/types";

// Note: Ensure ANTHROPIC_API_KEY is available in the environment
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function generateDiagnosis(
  prompt: string
): Promise<DiagnosisOutput> {
  logger.info("Calling Claude for Diagnosis...");

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    temperature: 0.1, // Low temperature for deterministic classification
    system: "You are an expert revenue recovery AI. Your sole job is to diagnose the root cause of a failed payment or revenue leak.",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "output_diagnosis",
        description: "Output the final diagnosis as structured JSON.",
        input_schema: {
          type: "object",
          properties: {
            root_cause: {
              type: "string",
              enum: [
                "insufficient_funds",
                "card_expired",
                "bank_decline_soft",
                "upi_mandate_failed",
                "cart_price_shock",
                "shipping_cost_surprise",
                "payment_method_missing",
                "genuine_dispute",
                "unknown",
              ],
            },
            confidence: {
              type: "number",
              description: "Confidence score between 0.0 and 1.0",
            },
            recommended_urgency: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            reasoning: {
              type: "string",
              description: "A one paragraph explanation of the diagnosis.",
            },
          },
          required: ["root_cause", "confidence", "recommended_urgency", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "output_diagnosis" },
  });

  const toolBlock = response.content.find(
    (c) => c.type === "tool_use" && c.name === "output_diagnosis"
  );

  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude failed to use the output_diagnosis tool");
  }

  return toolBlock.input as unknown as DiagnosisOutput;
}

export async function generateDecision(
  prompt: string
): Promise<DecisionOutput> {
  logger.info("Calling Claude for Decision...");

  const response = await anthropic.messages.create({
    model: "claude-3-5-sonnet-20241022",
    max_tokens: 1024,
    temperature: 0.1,
    system: "You are an expert revenue recovery AI. Your sole job is to decide on the best recovery action and channel based on a case diagnosis.",
    messages: [{ role: "user", content: prompt }],
    tools: [
      {
        name: "output_decision",
        description: "Output the final decision as structured JSON.",
        input_schema: {
          type: "object",
          properties: {
            action: {
              type: "string",
              enum: [
                "retry_payment",
                "send_payment_link",
                "send_reminder",
                "offer_promise_to_pay",
                "escalate_human",
                "stop",
              ],
            },
            channel: {
              type: "string",
              enum: [
                "EMAIL",
                "SMS",
                "WHATSAPP",
                "VOICE",
                "PAYMENT_RETRY",
                "HUMAN_HANDOFF",
              ],
            },
            reasoning: {
              type: "string",
              description: "A one paragraph explanation of the chosen action and why it complies with the policy.",
            },
          },
          required: ["action", "channel", "reasoning"],
        },
      },
    ],
    tool_choice: { type: "tool", name: "output_decision" },
  });

  const toolBlock = response.content.find(
    (c) => c.type === "tool_use" && c.name === "output_decision"
  );

  if (!toolBlock || toolBlock.type !== "tool_use") {
    throw new Error("Claude failed to use the output_decision tool");
  }

  return toolBlock.input as unknown as DecisionOutput;
}
