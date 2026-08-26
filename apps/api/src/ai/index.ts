import { isAiConfigured } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";
import { createGeminiProvider } from "./gemini.js";
import type { AiProvider } from "./types.js";

export * from "./types.js";

/**
 * A provider that exists only to fail clearly.
 *
 * Without it every AI call site would need its own "is a key configured?"
 * check, and the one that forgot would throw an unhelpful TypeError on
 * undefined. This keeps the app fully functional with no key — the AI features
 * simply report themselves unavailable.
 */
function createDisabledProvider(): AiProvider {
  const unavailable = (): never => {
    throw new HttpError(
      503,
      "AI assistance is not configured on this server.",
    );
  };

  return {
    name: "disabled",
    isAvailable: false,
    complete: unavailable,
    completeJson: unavailable,
  };
}

export const ai: AiProvider = isAiConfigured
  ? createGeminiProvider()
  : createDisabledProvider();
