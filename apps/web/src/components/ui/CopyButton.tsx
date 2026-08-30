import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyState = "idle" | "copied" | "failed";

/** Long enough to read, short enough that the button is ready again. */
const COPIED_MS = 2000;
/** Failure lingers — it asks the user to do something, so it must outlive a glance. */
const FAILED_MS = 5000;

/**
 * Put `text` on the clipboard, reporting honestly whether it worked.
 *
 * The async Clipboard API is the correct path and is NOT always available:
 * `navigator.clipboard` is undefined on an insecure origin (testing the dev
 * server from a phone at http://192.168.1.x:5173 is exactly this), and
 * `writeText` rejects outright when the document is not focused — which happens
 * whenever a devtools panel or another window has taken focus. Both are common
 * and neither is the user's fault.
 *
 * So there is a fallback, and then a real failure return. The alternative — an
 * unawaited promise whose rejection nobody handles — leaves the user believing
 * they copied a receipt number they did not copy, which is the worst of the
 * three outcomes by some distance.
 */
async function writeToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through — an insecure context or an unfocused document, both of
      // which the legacy path below can still sometimes serve.
    }
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    /*
     * Positioned off-screen rather than `display: none`. `execCommand("copy")`
     * copies the current SELECTION, and a display-none element cannot hold one
     * — hiding it the obvious way makes the fallback silently copy nothing.
     */
    area.style.position = "fixed";
    area.style.top = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

export function CopyButton({
  value,
  /** What was copied, for the announcement: "Receipt number copied". */
  label,
  className,
}: {
  value: string;
  label: string;
  className?: string;
}) {
  const [state, setState] = useState<CopyState>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /*
   * Clearing the pending revert on unmount. Without it, navigating away within
   * the two-second window leaves a setState scheduled against a component that
   * no longer exists — a leak, and a React warning in development.
   */
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleCopy = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);

    const ok = await writeToClipboard(value);
    setState(ok ? "copied" : "failed");
    timer.current = setTimeout(
      () => setState("idle"),
      ok ? COPIED_MS : FAILED_MS,
    );
  }, [value]);

  const isCopied = state === "copied";
  const isFailed = state === "failed";

  return (
    <>
      <button
        type="button"
        onClick={() => void handleCopy()}
        aria-label={`Copy ${label}`}
        title={`Copy ${label}`}
        className={cn(
          "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          "text-muted-foreground transition-all duration-200 ease-out-soft",
          "hover:bg-secondary hover:text-foreground active:scale-90",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isCopied && "text-primary",
          isFailed && "text-destructive",
          className,
        )}
      >
        {isCopied ? (
          <Check className="h-4 w-4" />
        ) : isFailed ? (
          <AlertCircle className="h-4 w-4" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </button>

      {/*
        The outcome as TEXT, in a live region.

        Swapping a clipboard icon for a tick communicates nothing to a screen
        reader — the button's accessible name never changed, so as far as
        assistive tech is concerned pressing it did nothing at all. This is the
        only channel through which a non-sighted user learns the copy worked,
        and the only one through which they learn it did not.

        `polite` because it follows a deliberate action; interrupting mid-word
        for a confirmation the user is already expecting would be rude.
      */}
      <span role="status" aria-live="polite" className="sr-only">
        {isCopied
          ? `${label} copied to clipboard`
          : isFailed
            ? `Couldn't copy the ${label}. Your browser blocked clipboard access — select the text and copy it manually.`
            : ""}
      </span>

      {/*
        And the same failure, visibly. A sighted user gets a red icon out of the
        block above, which says "something is wrong" without saying what to do.
      */}
      {isFailed && (
        <span className="text-xs text-destructive">
          Couldn&apos;t copy — select it and copy manually.
        </span>
      )}
    </>
  );
}
