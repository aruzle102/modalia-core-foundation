/**
 * AI provider abstraction for Modalia.
 *
 * ARCHITECTURAL REFERENCE ONLY — NOT USED IN PRODUCTION.
 *
 * Version 7 removed external AI providers from the production execution
 * path. Modalia Intelligence is deterministic and database-powered; it
 * never calls an external API. This file is kept as an architectural
 * reference for the provider interface design, but:
 * - `resolveProvider()` always returns `null` in production.
 * - `getAiMode()` always reports `{ mode: "rules" }`.
 * - No server function calls any provider method.
 *
 * SERVER-SIDE ONLY. This module must never be imported from client
 * components — only from `*.functions.ts` server functions.
 *
 * Honesty contract:
 * - Every response path labels itself "rules" (the local rule-based
 *   assistant). The system never claims rule-based output is AI.
 * - No API keys ever live in code.
 */

export type AiSource = "provider" | "rules";

export type AiChatMessage = { role: "system" | "user" | "assistant"; content: string };

export interface AiProvider {
  /** Human-readable provider label shown in the UI (no secrets). */
  readonly label: string;
  /** True only when fully configured and callable. */
  isAvailable(): boolean;
  generateText(messages: AiChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string>;
  suggestTags(input: {
    name: string;
    category?: string | null;
    description?: string | null;
    locale: string;
  }): Promise<string[]>;
  generateDescription(input: {
    name: string;
    category?: string | null;
    attributes: Record<string, string>;
    price: number;
    currency: string;
    locale: string;
  }): Promise<string>;
}

/** OpenAI-compatible chat completions provider (works with OpenAI, Azure, vLLM, Ollama, …). */
export class OpenAiCompatibleProvider implements AiProvider {
  readonly label: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;

  constructor(opts: { baseUrl: string; apiKey: string; model: string }) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.label = `AI provider (${opts.model})`;
  }

  isAvailable(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async generateText(messages: AiChatMessage[], opts?: { maxTokens?: number; temperature?: number }): Promise<string> {
    if (!this.isAvailable()) throw new Error("AI provider is not configured.");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: opts?.maxTokens ?? 600,
          temperature: opts?.temperature ?? 0.3,
        }),
      });
      if (!response.ok) {
        throw new Error(`AI provider request failed (HTTP ${response.status}).`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content?.trim();
      if (!content) throw new Error("AI provider returned an empty response.");
      return content;
    } finally {
      clearTimeout(timeout);
    }
  }

  async suggestTags(input: {
    name: string;
    category?: string | null;
    description?: string | null;
    locale: string;
  }): Promise<string[]> {
    const text = await this.generateText(
      [
        {
          role: "system",
          content:
            "You suggest short product search tags for an Algerian marketplace. Reply with a comma-separated list of 5 to 10 single-word or two-word tags, nothing else. Never invent product facts.",
        },
        {
          role: "user",
          content: `Product: ${input.name}\nCategory: ${input.category ?? "unknown"}\nDescription: ${input.description ?? "none"}\nLanguage: ${input.locale}`,
        },
      ],
      { maxTokens: 120, temperature: 0.2 },
    );
    return text
      .split(/[,\n]/)
      .map((tag) => tag.trim().replace(/^[-•\d.)\s]+/, ""))
      .filter((tag) => tag.length >= 2 && tag.length <= 40)
      .slice(0, 10);
  }

  async generateDescription(input: {
    name: string;
    category?: string | null;
    attributes: Record<string, string>;
    price: number;
    currency: string;
    locale: string;
  }): Promise<string> {
    const attrs = Object.entries(input.attributes)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
    return this.generateText(
      [
        {
          role: "system",
          content:
            "You write honest product descriptions for an Algerian marketplace. Use ONLY the facts given. Never invent price, stock, warranty, materials, ingredients, or medical claims. If a fact is missing, omit it — never guess. End with a one-line note that the seller must review before publishing.",
        },
        {
          role: "user",
          content: `Name: ${input.name}\nCategory: ${input.category ?? "unknown"}\nAttributes: ${attrs || "none provided"}\nPrice: ${input.price} ${input.currency}\nLanguage: ${input.locale}`,
        },
      ],
      { maxTokens: 500, temperature: 0.4 },
    );
  }
}

export type AiMode = { mode: "provider" | "rules"; providerLabel: string | null };

/**
 * Resolve the active provider.
 *
 * PRODUCTION: always returns `null`. External AI providers were removed
 * from the production execution path in Version 7. Modalia Intelligence
 * is deterministic and database-powered. This function is kept for
 * architectural reference only — no production code calls it.
 */
export function resolveProvider(): AiProvider | null {
  return null;
}

/**
 * Safe status for UI banners — contains no secrets.
 * PRODUCTION: always reports rules mode. No env vars are consulted.
 */
export function getAiMode(): AiMode {
  return { mode: "rules", providerLabel: null };
}

/**
 * System instructions used whenever an external provider answers shopper
 * questions. They pin the provider to real catalog data only.
 */
export function buildCatalogSystemPrompt(locale: string, catalogContext: string): string {
  return [
    "You are the shopping assistant of Modalia, an Algerian marketplace.",
    "STRICT RULES — violating them is worse than refusing:",
    "1. Answer ONLY from the product data given below. It is real and current.",
    "2. NEVER invent a price, stock level, specification, warranty, material, ingredient, or medical claim.",
    "3. If the data does not contain the answer, say so plainly (in the user's language) and offer the closest real alternatives.",
    `4. Every product you mention must be cited as a link in this exact form: [name](/product/slug?locale=${locale}).`,
    "5. Reply in the user's language (Arabic, French, or English). Keep answers short and helpful.",
    "",
    "CATALOG DATA (real products):",
    catalogContext || "(no products matched)",
  ].join("\n");
}
