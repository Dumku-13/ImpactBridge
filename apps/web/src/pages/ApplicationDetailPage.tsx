import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  FileText,
  Loader2,
  Lock,
  MessageSquare,
  Plus,
  Star,
} from "lucide-react";
import {
  REPORT_TYPE_LABELS,
  formatMoney,
  type ApplicationDetail,
  type ReportType,
} from "@impactbridge/shared";
import {
  useAddComment,
  useApplication,
  useCreateReport,
  useReviewers,
  useTransitionApplication,
  useUpsertReview,
} from "@/api/applications";
import { useAuth } from "@/auth/AuthContext";
import {
  useAiStatus,
  useReviewOwnApplication,
  useSummariseApplication,
} from "@/api/ai";
import { AiPanel } from "@/components/ai/AiPanel";
import { ApplicationStatusBadge } from "@/components/grants/ApplicationPipeline";
import { ApplicationTimeline } from "@/components/grants/ApplicationTimeline";
import { TraceFunding } from "@/components/grants/TraceFunding";
import { ApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ApplicationDetailPage() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const { data: application, isPending, error } = useApplication(id);

  if (isPending) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 py-8">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">
          {error instanceof ApiError ? error.message : "Application not found."}
        </Alert>
      </div>
    );
  }

  const isFunder = user?.role === "FUNDER";
  const isNgo = user?.role === "NGO_ADMIN";

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8">
      <Link
        // A platform admin can view any application, but is role-gated out of
        // /funder — sending them there just bounces them to /admin.
        to={
          isNgo
            ? "/ngo/applications"
            : isFunder
              ? "/funder"
              : "/admin"
        }
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </Link>

      <header>
        <div className="flex flex-wrap items-center gap-2">
          <ApplicationStatusBadge status={application.status} />
          <span className="text-xs text-muted-foreground">
            {application.submittedAt
              ? `Submitted ${formatDate(application.submittedAt)}`
              : "Not yet submitted"}
          </span>
        </div>

        <h1
          className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          {application.grant.title}
        </h1>

        <p className="mt-1 text-sm text-muted-foreground">
          {isFunder ? (
            <>
              Application from{" "}
              <Link
                to={`/ngo/${application.organization.slug}`}
                className="text-foreground hover:text-primary hover:underline"
              >
                {application.organization.name}
              </Link>
            </>
          ) : (
            <>Offered by {application.grant.funderName}</>
          )}
        </p>
      </header>

      {/*
        The timeline replaces the old horizontal step tracker, which knew only
        the current status. Every transition is already recorded with its actor
        and timestamp, so the pipeline can show what actually happened rather
        than an abstract progress bar.
      */}
      <section className="rounded-xl border border-border bg-card p-6 shadow-subtle">
        <p className="mb-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Application history
        </p>
        <ApplicationTimeline
          status={application.status}
          events={application.events}
        />
      </section>

      <AiAssistant application={application} isFunder={isFunder} isNgo={isNgo} />

      {/* Hairline band, matching the dashboards and grant detail. */}
      <div className="grid grid-cols-1 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-3">
        <div className="bg-background py-5 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Requested
          </p>
          <p
            className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none text-foreground"
            style={{ fontStretch: "88%" }}
          >
            {formatMoney(application.requestedAmountMinor, application.currency)}
          </p>
        </div>

        <div className="bg-background py-5 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Awarded
          </p>
          <p
            className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none text-foreground"
            style={{ fontStretch: "88%" }}
          >
            {application.awardedAmountMinor
              ? formatMoney(application.awardedAmountMinor, application.currency)
              : "—"}
          </p>
        </div>

        {/* Reviewer scores are funder-only; the API sends null to applicants. */}
        <div className="bg-background py-5 sm:px-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reviewer score
          </p>
          <p
            className="tnum mt-2 font-grotesk text-2xl font-extrabold leading-none text-foreground"
            style={{ fontStretch: "88%" }}
          >
            {application.averageScore != null
              ? `${application.averageScore} / 5`
              : "—"}
          </p>
        </div>
      </div>

      <ActionsCard application={application} />

      {application.proposal && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <FileText className="h-4 w-4 text-primary" />
            Proposal
          </h2>

          <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
            {application.proposal.pitch}
          </p>

          {application.questions.map((question, index) => (
            <div key={question} className="mt-4 border-t border-border pt-3">
              <p className="text-sm font-medium text-foreground">{question}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {application.proposal?.answers[index] || "—"}
              </p>
            </div>
          ))}
        </section>
      )}

      {isFunder && <ReviewCard application={application} />}

      {application.reviews.length > 0 && (
        <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Star className="h-4 w-4 text-primary" />
            Reviews
          </h2>

          <ul className="mt-3 space-y-3">
            {application.reviews.map((review) => (
              <li key={review.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {review.reviewerName}
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    {review.score}/5 {review.recommend ? "· recommends" : ""}
                  </span>
                </div>
                {review.strengths && (
                  <p className="mt-1.5 text-sm text-muted-foreground">
                    <span className="text-foreground">Strengths:</span>{" "}
                    {review.strengths}
                  </p>
                )}
                {review.concerns && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    <span className="text-foreground">Concerns:</span>{" "}
                    {review.concerns}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {application.project && (
        <>
          {/*
            Only offered once funds have actually moved — before that there is
            no chain to follow, and a dead button would be worse than none.
          */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-subtle">
            <TraceFunding application={application} />
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Follow this award from the grant it came from through to the money
              reported as spent.
            </p>
          </div>

          <ProjectCard application={application} canPost={isNgo} />
        </>
      )}

      <CommentsCard application={application} isFunder={isFunder} />

    </div>
  );
}

/**
 * The action buttons.
 *
 * Rendered straight from `availableTransitions`, which the SERVER computed from
 * the state machine. The UI never decides what is possible — it only draws what
 * it was told, so a rule change lands in one place.
 */
function ActionsCard({ application }: { application: ApplicationDetail }) {
  const transition = useTransitionApplication();
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [award, setAward] = useState("");
  const [reviewerId, setReviewerId] = useState("");

  const canAssign = application.availableTransitions.some(
    (t) => t.to === "REVIEWER_ASSIGNED",
  );
  /*
   * Only fetched on the one screen that assigns, and only when assigning is
   * actually on offer. Hooks must run unconditionally, so this sits above the
   * early return below rather than inside the branch that uses it.
   */
  const { data: reviewers } = useReviewers(canAssign);

  if (application.availableTransitions.length === 0) return null;

  async function move(to: string) {
    setError(null);

    try {
      await transition.mutateAsync({
        id: application.id,
        input: {
          toStatus: to as ApplicationDetail["status"],
          note: note.trim() || undefined,
          awardedAmountMinor:
            to === "APPROVED" && award
              ? Math.round(Number(award) * 100)
              : undefined,
          /*
           * Sent only on the transition it belongs to. The server treats a
           * missing reviewer as "assign it to me", which is what an empty
           * selection means here too — so an untouched picker keeps the old
           * self-assign behaviour rather than failing.
           */
          reviewerId:
            to === "REVIEWER_ASSIGNED" && reviewerId ? reviewerId : undefined,
        },
      });
      setNote("");
      setAward("");
      setReviewerId("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update.");
    }
  }

  const canApprove = application.availableTransitions.some(
    (t) => t.to === "APPROVED",
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="text-lg font-semibold text-foreground">Next step</h2>

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}

      {canApprove && (
        <Field
          label="Award amount (₹)"
          htmlFor="award"
          hint={`Leave blank to award the full ${formatMoney(application.requestedAmountMinor, application.currency)} requested`}
          className="mt-3"
        >
          <Input
            id="award"
            type="number"
            min={1}
            value={award}
            onChange={(e) => setAward(e.target.value)}
            placeholder={String(application.requestedAmountMinor / 100)}
          />
        </Field>
      )}

      {/*
        The reviewer picker. `reviewerId` has been accepted by the API since the
        workflow shipped, but nothing ever sent it — so every assignment
        silently went to whoever clicked the button, and "Assign reviewer"
        described something the product could not actually do.
      */}
      {canAssign && (
        <Field
          label="Reviewer"
          htmlFor="reviewer"
          hint="Leave as yourself to take the review on"
          className="mt-3"
        >
          <select
            id="reviewer"
            value={reviewerId}
            onChange={(e) => setReviewerId(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <option value="">Myself</option>
            {reviewers?.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {reviewer.name}
                {reviewer.role === "PLATFORM_ADMIN" ? " (platform)" : ""}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Note" htmlFor="note" hint="Optional — saved to the history" className="mt-3">
        <Input
          id="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why are you making this decision?"
        />
      </Field>

      <div className="mt-4 flex flex-wrap gap-2">
        {application.availableTransitions.map((option) => (
          <Button
            key={option.to}
            type="button"
            variant={
              option.to === "REJECTED" || option.to === "WITHDRAWN"
                ? "outline"
                : "primary"
            }
            disabled={transition.isPending}
            onClick={() => void move(option.to)}
          >
            {transition.isPending && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            {option.label}
          </Button>
        ))}
      </div>
    </section>
  );
}

function ReviewCard({ application }: { application: ApplicationDetail }) {
  const upsertReview = useUpsertReview();
  const [score, setScore] = useState(4);
  const [strengths, setStrengths] = useState("");
  const [concerns, setConcerns] = useState("");
  const [recommend, setRecommend] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit() {
    setError(null);

    try {
      await upsertReview.mutateAsync({
        id: application.id,
        input: { score, strengths, concerns, recommend },
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <Star className="h-4 w-4 text-primary" />
        Your assessment
      </h2>

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" className="mt-3">
          Assessment saved.
        </Alert>
      )}

      <div className="mt-3 flex gap-1">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            aria-label={`Score ${value} out of 5`}
            onClick={() => setScore(value)}
            className={cn(
              "h-9 w-9 rounded-lg border text-sm font-medium transition-colors",
              score === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {value}
          </button>
        ))}
      </div>

      <Field label="Strengths" htmlFor="strengths" hint="Optional" className="mt-3">
        <textarea
          id="strengths"
          rows={2}
          value={strengths}
          onChange={(e) => setStrengths(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      <Field label="Concerns" htmlFor="concerns" hint="Optional" className="mt-3">
        <textarea
          id="concerns"
          rows={2}
          value={concerns}
          onChange={(e) => setConcerns(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </Field>

      <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <input
          type="checkbox"
          checked={recommend}
          onChange={(e) => setRecommend(e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        I recommend funding this application
      </label>

      <Button
        type="button"
        className="mt-4"
        disabled={upsertReview.isPending}
        onClick={() => void submit()}
      >
        {upsertReview.isPending && (
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
        )}
        Save assessment
      </Button>
    </section>
  );
}

function ProjectCard({
  application,
  canPost,
}: {
  application: ApplicationDetail;
  canPost: boolean;
}) {
  const createReport = useCreateReport();
  const [composing, setComposing] = useState(false);
  const [type, setType] = useState<ReportType>("UPDATE");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [spent, setSpent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const project = application.project!;

  async function submit() {
    setError(null);

    try {
      await createReport.mutateAsync({
        projectId: project.id,
        input: {
          type,
          title,
          body,
          spentMinor: spent ? Math.round(Number(spent) * 100) : undefined,
          mediaUrls: [],
        },
      });
      setComposing(false);
      setTitle("");
      setBody("");
      setSpent("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            Progress reports
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            How the funded work is going.
          </p>
        </div>

        {canPost && !composing && (
          <Button type="button" variant="secondary" onClick={() => setComposing(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Post update
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}

      {composing && (
        <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="flex gap-1">
            {(Object.keys(REPORT_TYPE_LABELS) as ReportType[]).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setType(option)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  type === option
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary",
                )}
              >
                {REPORT_TYPE_LABELS[option]}
              </button>
            ))}
          </div>

          <Field label="Title" htmlFor="report-title" className="mt-3">
            <Input
              id="report-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="First 20 scholarships awarded"
            />
          </Field>

          <Field label="Details" htmlFor="report-body" className="mt-3">
            <textarea
              id="report-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>

          {type === "EXPENSE" && (
            <Field
              label="Amount spent (₹)"
              htmlFor="report-spent"
              className="mt-3"
            >
              <Input
                id="report-spent"
                type="number"
                min={0}
                value={spent}
                onChange={(e) => setSpent(e.target.value)}
              />
            </Field>
          )}

          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              disabled={createReport.isPending}
              onClick={() => void submit()}
            >
              {createReport.isPending && (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              )}
              Post
            </Button>
            <Button type="button" variant="ghost" onClick={() => setComposing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {project.reports.length === 0 && !composing && (
          <li className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No updates posted yet.
          </li>
        )}

        {project.reports.map((report) => (
          <li key={report.id} className="rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {REPORT_TYPE_LABELS[report.type]}
              </span>
              <span className="text-xs text-muted-foreground">
                {formatDate(report.createdAt)}
              </span>
              {report.spentMinor != null && (
                <span className="text-xs font-medium text-foreground">
                  {formatMoney(report.spentMinor, application.currency)} spent
                </span>
              )}
            </div>

            <p className="mt-2 font-medium text-foreground">{report.title}</p>
            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
              {report.body}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CommentsCard({
  application,
  isFunder,
}: {
  application: ApplicationDetail;
  isFunder: boolean;
}) {
  const addComment = useAddComment();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(isFunder);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!body.trim()) return;
    setError(null);

    try {
      await addComment.mutateAsync({
        id: application.id,
        input: { body, internal: isFunder ? internal : false },
      });
      setBody("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not post.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
        <MessageSquare className="h-4 w-4 text-primary" />
        Discussion
      </h2>

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}

      <ul className="mt-3 space-y-3">
        {application.comments.length === 0 && (
          <li className="text-sm text-muted-foreground">Nothing yet.</li>
        )}

        {application.comments.map((comment) => (
          <li
            key={comment.id}
            className={cn(
              "rounded-lg border p-3",
              comment.internal
                ? "border-dashed border-border bg-secondary/30"
                : "border-border",
            )}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {comment.authorName}
              </span>
              {comment.internal && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Lock className="h-3 w-3" />
                  Internal
                </span>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {formatDate(comment.createdAt)}
              </span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{comment.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-4 space-y-2 border-t border-border pt-4">
        <textarea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note…"
          aria-label="Add a comment"
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />

        <div className="flex items-center gap-3">
          <Button
            type="button"
            disabled={addComment.isPending || !body.trim()}
            onClick={() => void submit()}
          >
            Post
          </Button>

          {/* Only a funder has an "internal" option — internal means internal
              to the funder, so the toggle would be meaningless for the NGO. */}
          {isFunder && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={internal}
                onChange={(e) => setInternal(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border"
              />
              Internal only — hidden from the applicant
            </label>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Role-appropriate AI help.
 *
 * A funder gets a reviewer's summary; the applicant gets a critique of their
 * own draft. Deliberately different prompts — telling an NGO what a reviewer
 * privately thinks, or handing a funder the applicant's coaching notes, would
 * cross the same line the rest of this page is careful about.
 */
function AiAssistant({
  application,
  isFunder,
  isNgo,
}: {
  application: ApplicationDetail;
  isFunder: boolean;
  isNgo: boolean;
}) {
  const { data: status } = useAiStatus(isFunder || isNgo);
  const summarise = useSummariseApplication();
  const review = useReviewOwnApplication();

  // Hide the feature entirely when the server has no AI configured, rather
  // than offering a button that can only fail.
  if (!status?.available) return null;

  if (isFunder) {
    return (
      <AiPanel
        title="Reviewer summary"
        description="A short read of this application, so you can triage faster."
        actionLabel="Summarise"
        isPending={summarise.isPending}
        generate={() => summarise.mutateAsync(application.id)}
      />
    );
  }

  if (isNgo) {
    return (
      <AiPanel
        title="Strengthen this application"
        description={
          application.status === "DRAFT"
            ? "What a funder will look for that you haven't covered yet."
            : "What a funder is likely to ask about this application."
        }
        actionLabel="Check my application"
        isPending={review.isPending}
        generate={() => review.mutateAsync(application.id)}
      />
    );
  }

  return null;
}
