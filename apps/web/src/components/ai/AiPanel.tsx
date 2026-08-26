import { useState } from "react";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import type { AiInsight } from "@/api/ai";
import { AiMarkdown } from "./AiMarkdown";
import { ApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";

/**
 * A collapsed AI panel that only generates when asked.
 *
 * Generation is slow and quota-limited, so nothing fires on mount — the user
 * presses the button. The result is cached server-side against a hash of the
 * source, so pressing it again is usually instant and free.
 */
export function AiPanel({
  title,
  description,
  actionLabel,
  generate,
  isPending,
}: {
  title: string;
  description: string;
  actionLabel: string;
  generate: () => Promise<AiInsight>;
  isPending: boolean;
}) {
  const [insight, setInsight] = useState<AiInsight | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setError(null);

    try {
      setInsight(await generate());
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't generate this right now.",
      );
    }
  }

  return (
    <section className="rounded-xl border border-primary/25 bg-primary/[0.03] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-primary" />
            {title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>

        <Button
          type="button"
          variant={insight ? "ghost" : "primary"}
          disabled={isPending}
          onClick={() => void run()}
        >
          {isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : insight ? (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          ) : (
            <Sparkles className="mr-1.5 h-4 w-4" />
          )}
          {insight ? "Regenerate" : actionLabel}
        </Button>
      </div>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {insight && (
        <div className="mt-4 border-t border-primary/20 pt-4">
          <AiMarkdown content={insight.content} />

          <p className="mt-4 text-xs text-muted-foreground">
            {/* Said plainly, because a reviewer acting on a hallucinated detail
                is the real risk with a feature like this. */}
            AI-generated from the text on this page — check anything it claims
            before relying on it.
            {insight.cached && " Showing a previously generated result."}
          </p>
        </div>
      )}
    </section>
  );
}
