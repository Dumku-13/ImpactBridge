import type { ReactNode } from "react";

/**
 * A deliberately tiny markdown renderer for AI output.
 *
 * ── Why not a markdown library ───────────────────────────────────────────────
 * The models here are prompted for a fixed, simple shape: bold labels, bullets,
 * numbered lists, short paragraphs. A full parser would be a dependency and a
 * larger attack surface for four constructs.
 *
 * ── Why not dangerouslySetInnerHTML ──────────────────────────────────────────
 * This text comes from a model reasoning over user-submitted proposals, so it
 * is untrusted twice over. Everything below builds React ELEMENTS, so any HTML
 * or script in the output is rendered as literal text and can never execute.
 */

/** Split on **bold** and return React nodes — no HTML is ever produced. */
function renderInline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

export function AiMarkdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];

  // Consecutive list items are gathered so they render as one <ul>/<ol>.
  let listItems: string[] = [];
  let listKind: "bullet" | "number" | null = null;

  function flushList() {
    if (listItems.length === 0) return;

    const items = listItems.map((item, index) => (
      <li key={index} className="text-muted-foreground">
        {renderInline(item)}
      </li>
    ));

    blocks.push(
      listKind === "number" ? (
        <ol
          key={`list-${blocks.length}`}
          className="ml-5 list-decimal space-y-1.5"
        >
          {items}
        </ol>
      ) : (
        <ul key={`list-${blocks.length}`} className="ml-5 list-disc space-y-1.5">
          {items}
        </ul>
      ),
    );

    listItems = [];
    listKind = null;
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushList();
      continue;
    }

    const bullet = /^[*-]\s+(.*)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.*)$/.exec(line);

    if (bullet) {
      // A change of list type starts a new list rather than mixing them.
      if (listKind === "number") flushList();
      listKind = "bullet";
      listItems.push(bullet[1]!);
      continue;
    }

    if (numbered) {
      if (listKind === "bullet") flushList();
      listKind = "number";
      listItems.push(numbered[1]!);
      continue;
    }

    flushList();

    const heading = /^#{1,6}\s+(.*)$/.exec(line);

    blocks.push(
      <p
        key={`p-${blocks.length}`}
        className={
          heading
            ? "font-semibold text-foreground"
            : "text-muted-foreground"
        }
      >
        {renderInline(heading ? heading[1]! : line)}
      </p>,
    );
  }

  flushList();

  return <div className="space-y-2.5 text-sm leading-relaxed">{blocks}</div>;
}
