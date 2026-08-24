/**
 * apps/web/src/inngest/adapters/llm.ts
 *
 * LLM client for Inngest pipeline — uses Groq / Claude for structured diagnosis and decision making.
 */

import Groq from "groq-sdk";
import Anthropic from "@anthropic-ai/sdk";
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
 * Generates diagnosis using LLM tool-calling.
 */
export async function generateDiagnosis(prompt: string): Promise<DiagnosisOutput> {
  const groq = getGroqClient();
  const anthropic = getAnthropicClient();

  if (!groq && !anthropic) {
    throw new Error(
      "No LLM provider configured. Please set GROQ_API_KEY (or ANTHROPIC_API_KEY) in your .env file."
    );
  }

  // 1. Groq (Default / Recommended)
  if (groq) {
    const model = process.env["GROQ_MODEL"] || "openai/gpt-oss-120b";
    console.log(`[LLM] Calling Groq (${model}) for Diagnosis...`);

    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert revenue recovery AI agent. Your sole job is to diagnose the root cause of a failed payment with structured precision. Be concise — max 1 sentence for reasoning.",
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
                  description: "Max 1 short sentence explaining the root cause concisely.",
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
    if (!toolCall?.function?.arguments) {
      throw new Error(`Groq model ${model} did not return structured tool call arguments.`);
    }

    return JSON.parse(toolCall.function.arguments) as DiagnosisOutput;
  }

  // 2. Anthropic Claude
  if (anthropic) {
    console.log("[LLM] Calling Anthropic Claude for Diagnosis...");
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      temperature: 0.1,
      system:
        "You are an expert revenue recovery AI agent. Your sole job is to diagnose the root cause of a failed payment. Be concise — max 1 sentence for reasoning.",
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
    if (!toolBlock || toolBlock.type !== "tool_use") {
      throw new Error("Claude did not return structured tool call output.");
    }

    return toolBlock.input as unknown as DiagnosisOutput;
  }

  throw new Error("Failed to execute diagnosis through LLM.");
}

/**
 * Generates recovery decision using LLM tool-calling.
 */
export async function generateDecision(prompt: string): Promise<DecisionOutput> {
  const groq = getGroqClient();
  const anthropic = getAnthropicClient();

  if (!groq && !anthropic) {
    throw new Error(
      "No LLM provider configured. Please set GROQ_API_KEY (or ANTHROPIC_API_KEY) in your .env file."
    );
  }

  // 1. Groq (Default / Recommended)
  if (groq) {
    const model = process.env["GROQ_MODEL"] || "openai/gpt-oss-120b";
    console.log(`[LLM] Calling Groq (${model}) for Decision...`);

    const response = await groq.chat.completions.create({
      model,
      messages: [
        {
          role: "system",
          content:
            "You are an expert revenue recovery AI agent. Decide the best recovery action and channel based on diagnosis and constraints. Be concise — max 1 sentence for reasoning.",
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
                  description: "Max 1 short sentence justifying the action and channel.",
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
    if (!toolCall?.function?.arguments) {
      throw new Error(`Groq model ${model} did not return structured tool call arguments.`);
    }

    return JSON.parse(toolCall.function.arguments) as DecisionOutput;
  }

  // 2. Anthropic Claude
  if (anthropic) {
    console.log("[LLM] Calling Anthropic Claude for Decision...");
    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 1024,
      temperature: 0.1,
      system:
        "You are an expert revenue recovery AI agent. Decide the best recovery action and channel based on diagnosis and constraints. Be concise — max 1 sentence for reasoning.",
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
              reasoning: { type: "string" },
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
      throw new Error("Claude did not return structured tool call output.");
    }

    return toolBlock.input as unknown as DecisionOutput;
  }

  throw new Error("Failed to execute decision through LLM.");
}
