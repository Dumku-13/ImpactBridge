import { useEffect, useState } from "react";

/**
 * Delay propagating a rapidly-changing value.
 *
 * Used for the search box: without it every keystroke fires a request, so
 * typing "education" would send nine queries and the responses could arrive
 * out of order. Waiting for a pause means one request for the finished word.
 */
export function useDebounce<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // Cleanup cancels the pending timer whenever `value` changes again, which
    // is what actually produces the debounce.
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
