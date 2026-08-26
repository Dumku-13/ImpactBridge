/**
 * ── The AI provider port ─────────────────────────────────────────────────────
 *
 * Same reasoning as the payments port: the features above this file describe
 * WHAT they want generated, never WHICH model generates it. Swapping Gemini for
 * something else is one new file and an env var.
 *
 * That is not hypothetical here — this layer was originally specified against
 * Anthropic's API and moved to Gemini purely because the free tier needs no
 * payment card. The abstraction is what made that a config change.
 */

export interface CompletionRequest {
  /** Behavioural framing, kept separate so providers can map it natively. */
  system: string;
  /** The actual task, including any data the model should work from. */
  prompt: string;
  /** Upper bound on the response, to keep latency and quota predictable. */
  maxOutputTokens?: number;
  /**
   * 0 = deterministic, 1 = creative. Analysis tasks want low values so the same
   * proposal doesn't get a different verdict on each refresh.
   */
  temperature?: number;
}

export interface AiProvider {
  readonly name: "gemini" | "disabled";

  /** False when no key is configured — callers surface a clear 503. */
  readonly isAvailable: boolean;

  /** Free-form text generation. Throws HttpError on failure. */
  complete(request: CompletionRequest): Promise<string>;

  /**
   * Generation constrained to JSON matching `schemaHint`.
   *
   * Separate from `complete` because providers support this natively (Gemini
   * has a JSON response mode), and asking a model to "reply with JSON" in the
   * prompt alone reliably produces markdown code fences and prose around it.
   * Returns the raw JSON string; the caller validates it with Zod.
   */
  completeJson(
    request: CompletionRequest & { schemaHint: string },
  ): Promise<string>;
}
