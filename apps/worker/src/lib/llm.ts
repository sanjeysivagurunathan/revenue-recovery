/**
 * apps/worker/src/lib/llm.ts
 *
 * LLM client supporting Free Groq models, Anthropic Claude, and Smart Mock fallback.
 */

import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "./logger.js";
import type { DiagnosisOutput, DecisionOutput } from "@revenue-recovery/types";

function getGroqClient(): Groq | null {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey) return null;
  return new Groq({ apiKey });
}

function getAnthropicClient(): Anthropic | null {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey || !apiKey.startsWith("sk-ant")) return null;
  return new Anthropic({ apiKey });
}

/**
 * Generates diagnosis using Groq, Anthropic, or smart fallback.
 */
export async function generateDiagnosis(prompt: string): Promise<DiagnosisOutput> {
  const groq = getGroqClient();
  const anthropic = getAnthropicClient();

  // 1. Try Groq (Free & Ultra Fast)
  if (groq) {
    logger.info("Calling Groq API for Diagnosis...");
    const model = process.env["GROQ_MODEL"] || "openai/gpt-oss-120b";

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert revenue recovery AI. Your sole job is to diagnose the root cause of a failed payment or revenue leak.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "output_diagnosis",
              description: "Output the final diagnosis as structured JSON.",
              parameters: {
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
          },
        ],
        tool_choice: { type: "function", function: { name: "output_diagnosis" } },
        temperature: 0.1,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        return JSON.parse(toolCall.function.arguments) as DiagnosisOutput;
      }
    } catch (err) {
      logger.warn({ err }, "Groq call failed, falling back to heuristic diagnosis");
    }
  }

  // 2. Try Anthropic Claude
  if (anthropic) {
    logger.info("Calling Claude for Diagnosis...");
    try {
      const response = await anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1024,
        temperature: 0.1,
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
                confidence: { type: "number" },
                recommended_urgency: { type: "string", enum: ["low", "medium", "high"] },
                reasoning: { type: "string" },
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
      if (toolBlock && toolBlock.type === "tool_use") {
        return toolBlock.input as unknown as DiagnosisOutput;
      }
    } catch (err) {
      logger.warn({ err }, "Claude call failed, falling back to heuristic diagnosis");
    }
  }

  // 3. Fallback Heuristic Classifier (Zero API Key Mode)
  logger.info("Using smart local heuristic classifier for Diagnosis");
  const pLower = prompt.toLowerCase();
  if (pLower.includes("insufficient") || pLower.includes("funds") || pLower.includes("balance")) {
    return {
      root_cause: "insufficient_funds",
      confidence: 0.95,
      recommended_urgency: "high",
      reasoning: "Detected insufficient balance error code in the payment event.",
    };
  }
  if (pLower.includes("expired") || pLower.includes("card")) {
    return {
      root_cause: "card_expired",
      confidence: 0.92,
      recommended_urgency: "medium",
      reasoning: "Payment attempt failed due to card expiration or card network decline.",
    };
  }
  if (pLower.includes("mandate") || pLower.includes("upi")) {
    return {
      root_cause: "upi_mandate_failed",
      confidence: 0.9,
      recommended_urgency: "high",
      reasoning: "UPI Autopay mandate execution failed due to bank timeout or auth limit.",
    };
  }

  return {
    root_cause: "bank_decline_soft",
    confidence: 0.85,
    recommended_urgency: "medium",
    reasoning: "Soft bank decline detected during transaction routing.",
  };
}

/**
 * Generates recovery decision using Groq, Anthropic, or smart fallback.
 */
export async function generateDecision(prompt: string): Promise<DecisionOutput> {
  const groq = getGroqClient();
  const anthropic = getAnthropicClient();

  // 1. Try Groq (Free & Ultra Fast)
  if (groq) {
    logger.info("Calling Groq API for Decision...");
    const model = process.env["GROQ_MODEL"] || "openai/gpt-oss-120b";

    try {
      const response = await groq.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: "You are an expert revenue recovery AI. Your sole job is to decide on the best recovery action and channel based on a case diagnosis.",
          },
          { role: "user", content: prompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "output_decision",
              description: "Output the final decision as structured JSON.",
              parameters: {
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
          },
        ],
        tool_choice: { type: "function", function: { name: "output_decision" } },
        temperature: 0.1,
      });

      const toolCall = response.choices[0]?.message?.tool_calls?.[0];
      if (toolCall?.function?.arguments) {
        return JSON.parse(toolCall.function.arguments) as DecisionOutput;
      }
    } catch (err) {
      logger.warn({ err }, "Groq call failed, falling back to heuristic decision");
    }
  }

  // 2. Try Anthropic Claude
  if (anthropic) {
    logger.info("Calling Claude for Decision...");
    try {
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
                  description: "A one paragraph explanation of the chosen action.",
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
      if (toolBlock && toolBlock.type === "tool_use") {
        return toolBlock.input as unknown as DecisionOutput;
      }
    } catch (err) {
      logger.warn({ err }, "Claude call failed, falling back to heuristic decision");
    }
  }

  // 3. Fallback Heuristic Decision Maker (Zero API Key Mode)
  logger.info("Using smart local heuristic decision maker");
  const pLower = prompt.toLowerCase();
  if (pLower.includes("insufficient_funds") || pLower.includes("soft")) {
    return {
      action: "retry_payment",
      channel: "PAYMENT_RETRY",
      reasoning: "Selected automated payment retry after cooldown for soft decline/insufficient funds.",
    };
  }
  if (pLower.includes("expired") || pLower.includes("cart") || pLower.includes("missing")) {
    return {
      action: "send_payment_link",
      channel: "EMAIL",
      reasoning: "Generating hosted Razorpay payment link and notifying customer via email.",
    };
  }

  return {
    action: "send_reminder",
    channel: "EMAIL",
    reasoning: "Sending polite payment recovery reminder via email within policy quiet hours.",
  };
}
