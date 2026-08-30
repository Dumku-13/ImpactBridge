import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * An accessible FAQ accordion.
 *
 * ── Why not <details>/<summary> ──────────────────────────────────────────────
 *
 * The native element is genuinely tempting: it is accessible for free and needs
 * no JavaScript. It is not used here because it cannot animate its own height —
 * `<details>` snaps open, and the `content-visibility` transition that fixes
 * that is not available across the browsers this has to work in. A button plus
 * a grid-rows transition gets the same semantics (`aria-expanded` on a real
 * button, controlled region) and can move.
 *
 * ── One panel at a time, or several? ─────────────────────────────────────────
 *
 * Several. A visitor comparing two answers — "are donations real money?"
 * against "how are funds tracked?" — should be able to see both at once, and an
 * accordion that closes the thing you just read to open the next one turns a
 * comparison into a memory test. The only argument for single-open is keeping
 * the page short, which matters less than the reading task.
 */
export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * Grounded in what this platform actually does — the grant state machine in
 * `apps/api/src/services/grantWorkflow.ts`, the verification flow in the admin
 * dashboard, and the test-mode payment provider. Nothing here promises a fee
 * structure, a legal status or a partnership, because none of those exist.
 */
export const FAQ_ITEMS: FaqItem[] = [
  {
    question: "Is this real money?",
    answer:
      "No. ImpactBridge is a demonstration platform and every payment runs through a gateway in test mode, so no card is ever charged and no funds move. The donation flow, receipts and totals are all real code doing real work — the money is the only part that is simulated.",
  },
  {
    question: "How does a nonprofit get verified?",
    answer:
      "An NGO builds its profile and uploads its registration paperwork, which stays private to the organisation and platform administrators. An administrator reviews the documents and either verifies the organisation or sends it back with a reason. Only verified organisations appear as verified when donors browse — the badge is a decision someone made, not a field the NGO can set on itself.",
  },
  {
    question: "How does the grant lifecycle work?",
    answer:
      "A funding organisation posts a grant with eligibility rules. Nonprofits apply, and each application moves through review, reviewer assignment, an optional interview, and then approval or rejection. Approved applications move on to funds release and progress reports before being completed. Every one of those transitions is checked on the server against who is asking and what state the application is currently in, so no step can be skipped or forged from the browser.",
  },
  {
    question: "Who can see my application?",
    answer:
      "The nonprofit that submitted it and the funding organisation that posted the grant, plus platform administrators. Applications are scoped to their owner on the server, so changing an id in the address bar returns nothing rather than someone else's submission. Reviewer comments are visible to the funder's own team.",
  },
  {
    question: "How are funds tracked after approval?",
    answer:
      "Each approved application carries its allocation and the progress reports the nonprofit files against it, so the trail from a posted grant through to a completed programme stays in one place. Donations to an organisation are tracked separately from grant funding, because they answer to different people.",
  },
  {
    question: "What does it cost?",
    answer:
      "Nothing — there is no billing in this platform. It is a portfolio project built to model how grant funding actually works in the sector, not a commercial service.",
  },
  {
    question: "What data do you store about visitors?",
    answer:
      "One strictly-necessary cookie that keeps you signed in, which cannot be read by JavaScript. Campaign attribution — where a visit came from — is only recorded if you accept it in the privacy banner, is kept in your own browser, and is never sent to a third party. There are no analytics or advertising scripts on this site.",
  },
  {
    question: "Can I use this code?",
    answer:
      "Yes. It is an open source project built to be read as much as run — the codebase is commented to explain why decisions were made, not just what the code does.",
  },
];

function FaqEntry({ item }: { item: FaqItem }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonId = useId();

  /*
   * ── Why the height is measured rather than animated in pure CSS ─────────
   *
   * The tidier version of this animates `grid-template-rows` from `0fr` to
   * `1fr` and needs no JavaScript at all. The reason it is not used: `fr`
   * interpolation only became reliable across engines fairly recently
   * (Firefox shipped it well after Chrome and Safari), and when it is not
   * supported the transition does not degrade to an instant open — it can
   * leave the panel collapsed, so the answer simply never appears. A silently
   * empty FAQ is a worse failure than a less elegant implementation.
   *
   * So: measure the content and transition `height` to that number, which
   * every engine animates. The ResizeObserver is what keeps the figure honest
   * — it re-measures when a late-loading font reflows the text or the viewport
   * narrows while the entry is open, which is the exact case where a
   * hard-coded `max-height` silently clips the end of a long answer.
   */
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    const measure = () => setContentHeight(el.scrollHeight);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="border-b border-border">
      <h3>
        <button
          id={buttonId}
          type="button"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full items-center justify-between gap-4 py-5 text-left transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="font-display text-lg font-medium tracking-tight text-foreground">
            {item.question}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out-soft motion-reduce:transition-none",
              open && "rotate-180",
            )}
          />
        </button>
      </h3>

      <div
        id={panelId}
        role="region"
        aria-labelledby={buttonId}
        style={{ height: open ? contentHeight : 0 }}
        /*
         * Hidden from assistive technology while collapsed, so a screen reader
         * does not read out an answer the sighted user cannot see. `hidden` or
         * `display: none` would do that too, but a display:none panel has no
         * height to transition from — hence the aria attribute plus a clipped
         * height rather than removing the element.
         *
         * `aria-hidden` is sufficient here only because the panel contains
         * nothing focusable. If a link is ever added to an answer, this needs to
         * become `inert` as well, or a keyboard user will tab into a collapsed
         * panel and land somewhere invisible.
         */
        aria-hidden={!open}
        className="overflow-hidden transition-[height] duration-300 ease-out-soft motion-reduce:transition-none"
      >
        <div ref={contentRef}>
          <p className="pb-5 pr-8 text-sm leading-relaxed text-muted-foreground">
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Faq({
  items = FAQ_ITEMS,
  className,
}: {
  items?: FaqItem[];
  className?: string;
}) {
  return (
    <section className={cn("mx-auto max-w-3xl px-6 py-20", className)}>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        Questions
      </h2>
      <p className="mt-3 text-muted-foreground">
        What this platform does, and what it does not.
      </p>

      <div className="mt-10 border-t border-border">
        {items.map((item) => (
          <FaqEntry key={item.question} item={item} />
        ))}
      </div>
    </section>
  );
}
