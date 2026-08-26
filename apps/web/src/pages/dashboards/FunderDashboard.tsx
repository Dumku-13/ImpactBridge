import { useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCheck,
  Coins,
  Eye,
  Loader2,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import {
  formatMoney,
  upsertGrantSchema,
  type GrantCard as GrantCardType,
  type UpsertGrantInput,
} from "@impactbridge/shared";
import {
  useCreateGrant,
  useDeleteGrant,
  useMyGrants,
  useSetGrantStatus,
} from "@/api/grants";
import { useCategories } from "@/api/ngo";
import { deadlineLabel } from "@/components/grants/GrantCard";
import { ApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatBlock } from "@/components/editorial/StatBlock";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";

/**
 * The form's INPUT type, which differs from UpsertGrantInput because several
 * fields use `.default()` — before Zod parses, those are optional. Passing the
 * output type to useForm makes the resolver unassignable, so the three-generic
 * form is used: raw values in, parsed values out at submit.
 */
type GrantFormValues = z.input<typeof upsertGrantSchema>;

/** Default the deadline to 30 days out, formatted for <input type="date">. */
function defaultDeadline(): string {
  const date = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function FunderDashboard() {
  const { data: grants, isPending } = useMyGrants();
  const [composing, setComposing] = useState(false);

  const totalCommitted = (grants ?? [])
    .filter((g) => g.status !== "DRAFT")
    .reduce((sum, g) => sum + g.amountMinor, 0);

  const totalApplicants = (grants ?? []).reduce(
    (sum, g) => sum + g.applicationCount,
    0,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Funding dashboard
          </p>
          <h1
            className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            Your grants and applicants
          </h1>
        </div>

        {!composing && (
          <Button type="button" onClick={() => setComposing(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            New grant
          </Button>
        )}
      </header>

      {/*
        A band, not three cards. Boxing each figure gave them equal weight with
        the chrome around them; hairline-separated columns put the numbers
        themselves in charge, which is what a dashboard header is for.
      */}
      <div className="grid grid-cols-1 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-3">
        {[
          { label: "Grants posted", value: String(grants?.length ?? 0) },
          { label: "Total committed", value: formatMoney(totalCommitted, "inr") },
          { label: "Applications", value: String(totalApplicants) },
        ].map((stat) => (
          <div key={stat.label} className="bg-background py-5 sm:px-5">
            <StatBlock label={stat.label} size="sm">
              {stat.value}
            </StatBlock>
          </div>
        ))}
      </div>

      {composing && <GrantForm onClose={() => setComposing(false)} />}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-foreground">Your grants</h2>

        {isPending && <Skeleton className="h-32 w-full rounded-xl" />}

        {grants?.length === 0 && !composing && (
          <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
            No grants yet. Post one to start receiving applications.
          </p>
        )}

        {grants?.map((grant) => (
          <FunderGrantRow key={grant.id} grant={grant} />
        ))}
      </section>
    </div>
  );
}

function FunderGrantRow({ grant }: { grant: GrantCardType }) {
  const setStatus = useSetGrantStatus();
  const deleteGrant = useDeleteGrant();
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingComplete, setConfirmingComplete] = useState(false);
  const { toast } = useToast();

  const deadline = deadlineLabel(grant.deadline);

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-subtle">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge
              variant={
                grant.status === "OPEN"
                  ? "success"
                  : grant.status === "DRAFT"
                    ? "outline"
                    : "default"
              }
            >
              {grant.status.toLowerCase()}
            </Badge>
            {grant.categories.slice(0, 2).map((c) => (
              <Badge key={c.id} variant="default">
                {c.name}
              </Badge>
            ))}
          </div>

          <h3 className="mt-2 font-medium text-foreground">{grant.title}</h3>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Coins className="h-3 w-3" />
              {formatMoney(grant.amountMinor, grant.currency)}
            </span>
            <span>{deadline.text}</span>
            <span>
              {grant.applicationCount}{" "}
              {grant.applicationCount === 1 ? "applicant" : "applicants"}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          {grant.status !== "DRAFT" && grant.applicationCount > 0 && (
            <Link
              to={`/funder/grants/${grant.id}/applicants`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Users className="h-3.5 w-3.5" />
              {grant.applicationCount} applicant
              {grant.applicationCount === 1 ? "" : "s"}
            </Link>
          )}

          {grant.status !== "DRAFT" && (
            <Link
              to={`/grants/${grant.slug}`}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
            >
              <Eye className="h-3.5 w-3.5" />
              View
            </Link>
          )}

          {grant.status === "DRAFT" && (
            <Button
              type="button"
              disabled={setStatus.isPending}
              onClick={() =>
                void run(() =>
                  setStatus.mutateAsync({ id: grant.id, status: "OPEN" }),
                )
              }
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Publish
            </Button>
          )}

          {grant.status === "OPEN" && (
            <Button
              type="button"
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() =>
                void run(() =>
                  setStatus.mutateAsync({ id: grant.id, status: "CLOSED" }),
                )
              }
            >
              Close
            </Button>
          )}

          {/*
            Closing stops new applications; completing closes the book. The
            server refuses unless every application has actually been resolved,
            so this button asks a question the API answers — it does not decide.
          */}
          {grant.status === "CLOSED" && (
            <Button
              type="button"
              variant="secondary"
              disabled={setStatus.isPending}
              onClick={() => setConfirmingComplete(true)}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Mark complete
            </Button>
          )}

          {/* Deleting is only offered while nothing is at stake; the server
              enforces the same rule regardless of what the UI shows. */}
          {grant.applicationCount === 0 && (
            <button
              type="button"
              aria-label={`Delete ${grant.title}`}
              disabled={deleteGrant.isPending}
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}

      {/*
        Deletion used to fire on a single click. The API only permits it while
        a grant has no applications, so the damage was bounded — but losing a
        drafted grant to a mis-tap is still losing work.
      */}
      <ConfirmDialog
        open={confirmingDelete}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={() => {
          void run(async () => {
            await deleteGrant.mutateAsync(grant.id);
            setConfirmingDelete(false);
            toast(`"${grant.title}" was deleted.`, "success");
          });
        }}
        isPending={deleteGrant.isPending}
        title="Delete this grant?"
        description={
          <>
            <strong className="text-foreground">{grant.title}</strong> will be
            removed permanently. This cannot be undone.
          </>
        }
      />

      {/* Completing is terminal — a completed grant cannot be reopened. */}
      <ConfirmDialog
        open={confirmingComplete}
        onCancel={() => setConfirmingComplete(false)}
        onConfirm={() => {
          void run(async () => {
            await setStatus.mutateAsync({ id: grant.id, status: "COMPLETED" });
            setConfirmingComplete(false);
            toast(`"${grant.title}" is marked complete.`, "success");
          });
        }}
        isPending={setStatus.isPending}
        confirmLabel="Mark complete"
        confirmVariant="primary"
        title="Mark this grant complete?"
        description={
          <>
            <strong className="text-foreground">{grant.title}</strong> will be
            closed for good — every application resolved and the fund
            accounted for. A completed grant cannot be reopened.
          </>
        }
      />
    </div>
  );
}

function GrantForm({ onClose }: { onClose: () => void }) {
  const { data: categories } = useCategories();
  const createGrant = useCreateGrant();
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [questionDraft, setQuestionDraft] = useState("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GrantFormValues, unknown, UpsertGrantInput>({
    resolver: zodResolver(upsertGrantSchema),
    defaultValues: {
      title: "",
      summary: "",
      description: "",
      amountMinor: 0,
      maxAwardMinor: null,
      categoryIds: [],
      deadline: defaultDeadline(),
      eligibility: { verifiedOnly: false, states: [], notes: "" },
      questions: [],
    },
  });

  const categoryIds = watch("categoryIds");

  async function onSubmit(values: UpsertGrantInput) {
    setError(null);
    try {
      await createGrant.mutateAsync({ ...values, questions });
      onClose();
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not create the grant.",
      );
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">New grant</h2>
        <Button type="button" variant="ghost" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <p className="mt-1 text-sm text-muted-foreground">
        Saved as a draft — nothing is visible to nonprofits until you publish.
      </p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
        <Field label="Title" htmlFor="grant-title" error={errors.title?.message}>
          <Input
            id="grant-title"
            placeholder="Rural Water Access Fund 2026"
            {...register("title")}
          />
        </Field>

        <Field
          label="Summary"
          htmlFor="grant-summary"
          hint="One or two sentences, shown on the grant card"
          error={errors.summary?.message}
        >
          <textarea
            id="grant-summary"
            rows={2}
            {...register("summary")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>

        <Field
          label="Full description"
          htmlFor="grant-description"
          hint="Optional"
          error={errors.description?.message}
        >
          <textarea
            id="grant-description"
            rows={4}
            {...register("description")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Total fund (₹)"
            htmlFor="grant-amount"
            error={errors.amountMinor?.message}
          >
            <Input
              id="grant-amount"
              type="number"
              min={1000}
              placeholder="5000000"
              // Rupees in the input, paise in the payload.
              {...register("amountMinor", {
                setValueAs: (v) => (v === "" ? 0 : Math.round(Number(v) * 100)),
              })}
            />
          </Field>

          <Field
            label="Max per award (₹)"
            htmlFor="grant-max"
            hint="Leave blank for no cap"
            error={errors.maxAwardMinor?.message}
          >
            <Input
              id="grant-max"
              type="number"
              min={0}
              {...register("maxAwardMinor", {
                setValueAs: (v) =>
                  v === "" || v == null ? null : Math.round(Number(v) * 100),
              })}
            />
          </Field>
        </div>

        <Field
          label="Application deadline"
          htmlFor="grant-deadline"
          error={errors.deadline?.message}
        >
          <Input id="grant-deadline" type="date" {...register("deadline")} />
        </Field>

        <Field
          label="Causes"
          htmlFor="grant-categories"
          hint="Pick every cause this grant covers"
          error={errors.categoryIds?.message}
        >
          <div id="grant-categories" className="flex flex-wrap gap-2">
            {categories?.map((category) => {
              const selected = categoryIds.includes(category.id);

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() =>
                    setValue(
                      "categoryIds",
                      selected
                        ? categoryIds.filter((id) => id !== category.id)
                        : [...categoryIds, category.id],
                      { shouldValidate: true },
                    )
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:bg-secondary",
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </Field>

        <fieldset className="rounded-lg border border-border p-4">
          <legend className="px-1 text-sm font-medium text-foreground">
            Eligibility
          </legend>

          <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              {...register("eligibility.verifiedOnly")}
              className="h-4 w-4 rounded border-border"
            />
            Only verified organisations may apply
          </label>

          <Field
            label="Minimum years active"
            htmlFor="grant-min-years"
            hint="Optional"
            className="mt-3"
          >
            <Input
              id="grant-min-years"
              type="number"
              min={0}
              {...register("eligibility.minYearsActive", {
                setValueAs: (v) => (v === "" ? undefined : Number(v)),
              })}
            />
          </Field>

          <Field
            label="Additional conditions"
            htmlFor="grant-notes"
            hint="Optional"
            className="mt-3"
          >
            <textarea
              id="grant-notes"
              rows={2}
              {...register("eligibility.notes")}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>
        </fieldset>

        <Field
          label="Application questions"
          htmlFor="grant-question"
          hint="Applicants answer these in their proposal"
        >
          <div className="flex gap-2">
            <Input
              id="grant-question"
              value={questionDraft}
              placeholder="How many people will this reach?"
              onChange={(e) => setQuestionDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter would otherwise submit the whole form.
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (questionDraft.trim().length >= 4) {
                    setQuestions((q) => [...q, questionDraft.trim()]);
                    setQuestionDraft("");
                  }
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={questionDraft.trim().length < 4 || questions.length >= 10}
              onClick={() => {
                setQuestions((q) => [...q, questionDraft.trim()]);
                setQuestionDraft("");
              }}
            >
              Add
            </Button>
          </div>
        </Field>

        {questions.length > 0 && (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            {questions.map((question, index) => (
              <li key={question} className="flex items-start justify-between gap-2">
                <span>{question}</span>
                <button
                  type="button"
                  aria-label={`Remove question ${index + 1}`}
                  onClick={() =>
                    setQuestions((q) => q.filter((_, i) => i !== index))
                  }
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="flex gap-2 border-t border-border pt-4">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Save as draft
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </section>
  );
}
