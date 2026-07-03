/**
 * Humanizer - turns raw office stats into a friendly sentence or two.
 *
 * Strategy:
 *   1. If ANTHROPIC_API_KEY is configured, ask Claude to phrase the
 *      facts conversationally (the boss hates robotic data dumps).
 *      The facts are computed from the live store and passed as data -
 *      Claude only does the wording, so answers are always real.
 *   2. Otherwise fall back to handcrafted friendly templates, so the
 *      bot works out of the box with zero external dependencies.
 */

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey ? new Anthropic({ apiKey }) : null;

const SYSTEM_PROMPT = `You are the friendly office electricity bot for a small office's Discord server.
You receive verified JSON facts about device states and power usage.
Rewrite them as a short, warm, conversational Discord message (1-3 sentences).
Rules: never invent numbers or devices - use only the facts given; keep every
number exactly as provided; light emoji use is welcome; no markdown headers.`;

/**
 * @param {string} intent   what the user asked (e.g. "office status")
 * @param {object} facts    verified data computed from the store
 * @param {string} fallback pre-built template reply used when Claude is
 *                          unavailable or errors out
 */
export async function humanize(intent, facts, fallback) {
  if (!client) return fallback;
  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `The user asked about: ${intent}\nFacts (JSON):\n${JSON.stringify(
            facts,
            null,
            2
          )}`,
        },
      ],
    });
    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();
    return text || fallback;
  } catch (err) {
    console.warn(`[bot] Claude humanizer failed (${err.message}) - using template`);
    return fallback;
  }
}

export function isLlmEnabled() {
  return Boolean(client);
}
