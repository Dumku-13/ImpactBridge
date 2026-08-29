import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Loader2, Send } from "lucide-react";
import { formatMoney, upsertApplicationSchema } from "@impactbridge/shared";
import { useGrant } from "@/api/grants";
import { useMyOrganization } from "@/api/ngo";
import {
  EligibilityNotice,
  eligibilityFailures,
} from "@/components/grants/EligibilityCheck";
import {
  useCreateApplication,
  useTransitionApplication,
  useUpdateApplication,
} from "@/api/applications";
import { useDebounce } from "@/hooks/useDebounce";
import { ApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

type SaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

/** Mirrors `proposalSchema.pitch.min(80)` in the shared package. */
const PITCH_MIN = 80;

/**
 * The NGO's application form, as a short sequence rather than one long page.
 *
 * Saving creates a DRAFT; submitting is a separate state transition. That split
 * matters — a half-written proposal shouldn't be visible to the funder, and the
 * server enforces the same thing by hiding DRAFT applications from the funder's
 * queue.
 *
 * The steps mirror the fields that actually exist: amount, proposal, the
 * grant's own questions (when it has any), then a review. Organisation details
 * and legal documents are deliberately NOT steps here — they live on the NGO
 * dashboard and are attached to the organisation, not to each application.
 * Adding them as empty ceremony would make the form look thorough while
 * collecting nothing.
 */
export function ApplyPage() {
  useDocumentTitle("Apply for a grant");
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { data: grant, isPending } = useGrant(slug);
  const { data: myOrg } = useMyOrganization();
  const createApplication = useCreateApplication();
  const updateApplication = useUpdateApplication();
  const transition = useTransitionApplication();

  const [amount, setAmount] = useState("");
  const [pitch, setPitch] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);

  /** Set once the draft exists server-side; null means nothing saved yet. */
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Guards against two autosaves racing — the second would PATCH with a stale
  // id, or worse, create a duplicate draft before the first POST resolves.
  const inFlight = useRef(false);

  const hasQuestions = (grant?.questions.length ?? 0) > 0;

  const steps = useMemo(
    () =>
      [
        { key: "amount", label: "Amount" },
        { key: "proposal", label: "Proposal" },
        ...(hasQuestions ? [{ key: "questions", label: "Questions" }] : []),
        { key: "review", label: "Review" },
      ] as const,
    [hasQuestions],
  );

  /*
   * Autosave fires on a debounced snapshot of the form rather than per
   * keystroke — a PATCH per character would be both wasteful and racy.
   */
  const snapshot = JSON.stringify({ amount, pitch, answers });
  const debouncedSnapshot = useDebounce(snapshot, 1200);
  const lastSaved = useRef<string | null>(null);

  /*
   * The draft's id is held in a ref as well as state.
   *
   * State alone is not enough: two autosaves can be scheduled before React
   * commits the first `setApplicationId`, so the second still reads `null` and
   * POSTs a SECOND draft. The ref is assigned synchronously the moment the
   * create resolves, which closes that window. (Observed: five keystrokes
   * produced two drafts before this.)
   */
  const applicationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!grant) return;

    /*
     * Read the DEBOUNCED snapshot, never live state. Deriving "is this worth
     * saving?" from live state made it a dependency that flips on the first
     * keystroke — firing the effect while the debounced value was still the
     * empty form, and saving a blank draft.
     */
    const pending = JSON.parse(debouncedSnapshot) as {
      amount: string;
      pitch: string;
      answers: string[];
    };

    const input = {
      requestedAmountMinor: Math.round(Number(pending.amount || 0) * 100),
      proposal: {
        pitch: pending.pitch,
        answers: grant.questions.map((_, i) => pending.answers[i] ?? ""),
      },
    };

    /*
     * Only save a payload the server will actually accept, checked against the
     * SAME schema the API validates with rather than a hand-copied rule that
     * would drift.
     *
     * Without this the form fired a doomed request on every debounce: the
     * proposal has an 80-character minimum, so autosave POSTed and got a 400
     * back on each pause until the applicant happened to cross it — and because
     * the create never succeeded, the draft id was never set, so each attempt
     * tried to create again instead of patching.
     */
    if (!upsertApplicationSchema.safeParse(input).success) {
      setSaveState("unsaved");
      return;
    }

    if (debouncedSnapshot === lastSaved.current) return;
    if (inFlight.current) return;

    let cancelled = false;

    (async () => {
      inFlight.current = true;
      setSaveState("saving");
      try {

        if (applicationIdRef.current) {
          await updateApplication.mutateAsync({
            id: applicationIdRef.current,
            input,
          });
        } else {
          const created = await createApplication.mutateAsync({
            grantId: grant.id,
            input,
          });
          applicationIdRef.current = created.id;
          if (!cancelled) setApplicationId(created.id);
        }

        lastSaved.current = debouncedSnapshot;
        if (!cancelled) setSaveState("saved");
      } catch {
        // Autosave failures stay quiet: the applicant hasn't asked to save, so
        // an alert would interrupt writing. The indicator shows the state, and
        // submitting surfaces a real error if it still can't reach the server.
        if (!cancelled) setSaveState("error");
      } finally {
        inFlight.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSnapshot, grant?.id]);

  if (isPending) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!grant) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">Grant not found.</Alert>
      </div>
    );
  }

  const ineligible = eligibilityFailures(grant.eligibility, myOrg);

  const cap = grant.maxAwardMinor ?? grant.amountMinor;
  const amountMinor = Math.round(Number(amount || 0) * 100);
  const amountValid = amountMinor > 0 && amountMinor <= cap;
  // Submitting while ineligible only earns a 403 — the button is disabled
  // rather than letting the applicant discover that the hard way.
  const canSubmit =
    amountValid && pitch.trim().length >= PITCH_MIN && ineligible.length === 0;
  const busy = transition.isPending;
  const current = steps[step]!;
  const isLast = step === steps.length - 1;

  async function submit() {
    setError(null);
    try {
      // The draft may not exist yet if the applicant typed fast and hit submit
      // inside the debounce window — create it now rather than losing the work.
      let id = applicationIdRef.current ?? applicationId;
      const input = {
        requestedAmountMinor: amountMinor,
        proposal: {
          pitch,
          answers: grant!.questions.map((_, i) => answers[i] ?? ""),
        },
      };

      if (id) {
        await updateApplication.mutateAsync({ id, input });
      } else {
        const created = await createApplication.mutateAsync({
          grantId: grant!.id,
          input,
        });
        id = created.id;
        applicationIdRef.current = id;
      }

      await transition.mutateAsync({ id, input: { toStatus: "SUBMITTED" } });
      navigate(`/applications/${id}`);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not submit your application.",
      );
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <Link
        to={`/grants/${grant.slug}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to grant
      </Link>

      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          Application
        </p>
        <h1
          className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {grant.title}
        </h1>
        <p className="tnum mt-2 text-sm text-muted-foreground">
          You can request up to {formatMoney(cap, grant.currency)}.
        </p>
      </header>

      {/* Step rail */}
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {steps.map((s, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={s.key} className="flex items-center gap-2">
              <button
                type="button"
                // Backwards only: skipping ahead past an unfilled amount would
                // land the applicant on a review screen full of blanks.
                onClick={() => i < step && setStep(i)}
                disabled={i > step}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-200",
                  active && "bg-primary text-primary-foreground",
                  done && "text-primary hover:bg-secondary",
                  !active && !done && "text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : <span className="tnum">{i + 1}</span>}
                {s.label}
              </button>
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="h-px w-4 bg-border" />
              )}
            </li>
          );
        })}
      </ol>

      <EligibilityNotice reasons={ineligible} />

      {error && <Alert variant="error">{error}</Alert>}

      <section className="space-y-5 rounded-xl border border-border bg-card p-6 shadow-subtle">
        {current.key === "amount" && (
          <Field
            label="Amount requested (₹)"
            htmlFor="amount"
            hint={`Maximum ${formatMoney(cap, grant.currency)}`}
          >
            <Input
              id="amount"
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={String(cap / 100)}
              hasError={amount !== "" && !amountValid}
            />
            {amount !== "" && !amountValid && (
              <p className="mt-1.5 text-xs text-destructive">
                {amountMinor > cap
                  ? `That's above this grant's maximum of ${formatMoney(cap, grant.currency)}.`
                  : "Enter an amount greater than zero."}
              </p>
            )}
          </Field>
        )}

        {current.key === "proposal" && (
          <Field
            label="Your proposal"
            htmlFor="pitch"
            hint="What you'll do and who it reaches"
          >
            <textarea
              id="pitch"
              rows={10}
              value={pitch}
              onChange={(e) => setPitch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            {/* The 80-character minimum lives in the shared schema and the
                server rejects anything shorter — so it is stated here rather
                than discovered as a failed save. */}
            <p className="tnum mt-1.5 text-xs text-muted-foreground">
              {pitch.trim().length < PITCH_MIN
                ? `${PITCH_MIN - pitch.trim().length} more characters before this can be saved`
                : "Long enough to save"}
            </p>
          </Field>
        )}

        {current.key === "questions" &&
          grant.questions.map((question, index) => (
            <Field key={question} label={question} htmlFor={`answer-${index}`}>
              <textarea
                id={`answer-${index}`}
                rows={4}
                value={answers[index] ?? ""}
                onChange={(e) =>
                  setAnswers((prev) => {
                    const next = [...prev];
                    next[index] = e.target.value;
                    return next;
                  })
                }
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </Field>
          ))}

        {current.key === "review" && (
          <div className="space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Requesting
              </p>
              <p
                className="tnum mt-1 font-grotesk text-3xl font-extrabold leading-none text-foreground"
                style={{ fontStretch: "88%" }}
              >
                {formatMoney(amountMinor, grant.currency)}
              </p>
            </div>

            <div className="border-t border-border pt-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Proposal
              </p>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {pitch.trim() || (
                  <span className="text-muted-foreground">Nothing written yet.</span>
                )}
              </p>
            </div>

            {grant.questions.map((question, i) => (
              <div key={question} className="border-t border-border pt-4">
                <p className="text-sm font-medium text-foreground">{question}</p>
                <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                  {answers[i]?.trim() || "—"}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </Button>
        )}

        {!isLast && (
          <Button
            type="button"
            // Can't advance past an invalid amount — the review step would
            // otherwise show a figure the server will reject.
            disabled={current.key === "amount" && !amountValid}
            onClick={() => setStep((s) => s + 1)}
          >
            Continue
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}

        {isLast && (
          <Button type="button" disabled={!canSubmit || busy} onClick={() => void submit()}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            <Send className="mr-1.5 h-4 w-4" />
            Submit application
          </Button>
        )}

        <SaveIndicator state={saveState} savedAsDraft={applicationId !== null} />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Your work saves automatically as a draft. A draft stays private to you —
        the funder only sees the application once you submit it.
      </p>
    </div>
  );
}

/**
 * Autosave status. Quiet by design: this should reassure at a glance and never
 * compete with the form for attention.
 */
function SaveIndicator({
  state,
  savedAsDraft,
}: {
  state: SaveState;
  savedAsDraft: boolean;
}) {
  if (state === "idle") return null;

  return (
    <p
      // `polite` so a screen reader finishes the current field before
      // announcing that a save happened.
      aria-live="polite"
      className={cn(
        "ml-auto inline-flex items-center gap-1.5 text-xs",
        state === "error" ? "text-destructive" : "text-muted-foreground",
      )}
    >
      {state === "saving" && (
        <>
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </>
      )}
      {state === "saved" && (
        <>
          <Check className="h-3 w-3 text-primary" />
          {savedAsDraft ? "Draft saved" : "Saved"}
        </>
      )}
      {state === "unsaved" && "Not saved yet — the proposal is still too short"}
      {state === "error" && "Couldn't save — your work is still here"}
    </p>
  );
}
