import { useCallback, useRef } from "react";

/**
 * The browser half of the bot trap declared in `@impactbridge/shared`
 * (`botGuardFields` in schemas/auth.ts — read that first; it explains what the
 * server does with these and why they are a speed bump rather than a defence).
 *
 * Two values travel with every public auth submission:
 *
 *   `_hp` — whatever ended up in the honeypot input. Empty for a person.
 *   `_ts` — the moment the form mounted, so the server can measure how long the
 *           submission took and reject anything faster than a human hand.
 *
 * Both are read at SUBMIT time from a ref rather than held in React state. Two
 * reasons: a controlled honeypot would re-render the whole form on every
 * character a bot types into a field nobody can see, and keeping `_hp` out of
 * React Hook Form's value type means the trap never appears in `LoginInput` at
 * the call sites, never needs a `defaultValue`, and cannot be accidentally
 * surfaced by a `formState` dump.
 */
export interface BotGuardFields {
  _hp: string;
  _ts: number;
}

export function useBotGuard() {
  /*
   * Captured once, on first render, and never refreshed.
   *
   * It must be mount time, not submit time: the whole signal is the ELAPSED
   * gap between the form appearing and the request arriving. Reading
   * `Date.now()` inside the submit handler would make every submission look
   * instantaneous and every user look like a bot.
   */
  const mountedAt = useRef(Date.now());
  const trapRef = useRef<HTMLInputElement>(null);

  const getBotFields = useCallback(
    (): BotGuardFields => ({
      // The ref is null only if the caller forgot to render <HoneypotField>.
      // Sending "" then is right: an absent trap has caught nothing.
      _hp: trapRef.current?.value ?? "",
      _ts: mountedAt.current,
    }),
    [],
  );

  return { trapRef, getBotFields };
}
