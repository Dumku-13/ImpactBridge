import { z } from "zod";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import type { AiProvider, CompletionRequest } from "./types.js";

/**
 * Google Gemini adapter, over the REST API with `fetch`.
 *
 * No SDK for the same reason as the Razorpay adapter: it is one endpoint, and
 * going direct lets every response be validated with Zod instead of trusted.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";

/**
 * Only the fields we actually rely on.
 *
 * `parts` is optional in the schema on purpose: when Gemini stops for safety or
 * hits the token ceiling it returns a candidate with a finishReason and NO
 * parts. Requiring them would turn an explainable refusal into a Zod crash.
 */
const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ text: z.string() })).optional() })
          .optional(),
        finishReason: z.string().optional(),
      }),
    )
    .optional(),
  promptFeedback: z
    .object({ blockReason: z.string().optional() })
    .optional(),
});

async function callGemini(
  request: CompletionRequest,
  responseMimeType?: string,
): Promise<string> {
  const url = `${API}/models/${env.GEMINI_MODEL}:generateContent`;

  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Header rather than a query param: a key in the URL ends up in proxy
        // logs and browser history.
        "x-goog-api-key": env.GEMINI_API_KEY!,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: request.system }] },
        contents: [{ role: "user", parts: [{ text: request.prompt }] }],
        generationConfig: {
          temperature: request.temperature ?? 0.2,
          /*
           * Budget generously, because THINKING TOKENS COME OUT OF THIS.
           *
           * Current Gemini flash models reason internally before answering and
           * charge that reasoning to maxOutputTokens. Measured on a short
           * summarise task: 739 thinking tokens for 125 tokens of actual
           * answer. A budget sized to the visible output alone gets consumed by
           * thinking and the reply is truncated mid-sentence — which is exactly
           * how this first behaved.
           *
           * `thinkingConfig: { thinkingBudget: 0 }` would be the tidier fix but
           * is rejected as an invalid argument by this model alias, so headroom
           * it is. Length is controlled by asking for it in the prompt instead.
           */
          maxOutputTokens: request.maxOutputTokens ?? 3000,
          ...(responseMimeType ? { responseMimeType } : {}),
        },
      }),
      /*
       * A hung model request must not hold an Express handler open forever.
       * 30s is generous for these short prompts and still bounded.
       */
      signal: AbortSignal.timeout(30_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";

    if (err instanceof Error && err.name === "TimeoutError") {
      throw new HttpError(504, "The AI service took too long to respond.");
    }

    throw new HttpError(502, `Could not reach the AI service: ${message}`);
  }

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const detail =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${response.status}`;

    console.error(`[ai] gemini error: ${detail}`);

    /*
     * The free tier's rate limit is a normal operating condition, not a bug —
     * 429 lets the UI say "try again in a moment" instead of showing a generic
     * failure the user can do nothing about.
     */
    if (response.status === 429) {
      throw new HttpError(
        429,
        "The AI service is rate limited right now. Try again shortly.",
      );
    }

    throw new HttpError(502, `AI request failed: ${detail}`);
  }

  const parsed = responseSchema.parse(body);

  if (parsed.promptFeedback?.blockReason) {
    throw new HttpError(
      422,
      "The AI declined to process this content. Try rewording it.",
    );
  }

  const candidate = parsed.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join("") ?? "";

  if (!text.trim()) {
    // MAX_TOKENS with no text means the model spent its budget before writing
    // anything usable — worth distinguishing from an empty-but-successful reply.
    const reason = candidate?.finishReason ?? "no content";
    throw new HttpError(502, `The AI returned nothing (${reason}).`);
  }

  return text.trim();
}

export function createGeminiProvider(): AiProvider {
  return {
    name: "gemini",
    isAvailable: true,

    complete: (request) => callGemini(request),

    completeJson: (request) =>
      /*
       * `application/json` puts Gemini in JSON mode, so the reply is parseable
       * rather than fenced markdown. The schema is still described in the
       * prompt — the MIME type guarantees valid JSON, not the right SHAPE, and
       * the caller validates that with Zod regardless.
       */
      callGemini(
        {
          ...request,
          prompt: `${request.prompt}\n\nRespond with JSON matching exactly this shape:\n${request.schemaHint}`,
        },
        "application/json",
      ),
  };
}
