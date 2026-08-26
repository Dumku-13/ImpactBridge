import { useState } from "react";
import { Loader2, Plus, Trash2, TrendingUp, X } from "lucide-react";
import {
  MAX_IMPACT_METRICS,
  type ImpactMetricDetail,
  type UpsertImpactMetricInput,
} from "@impactbridge/shared";
import {
  useCreateImpactMetric,
  useDeleteImpactMetric,
  useImpactMetrics,
  useUpdateImpactMetric,
} from "@/api/ngo";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";

const EMPTY: UpsertImpactMetricInput = { label: "", value: "", unit: "" };

/**
 * The headline numbers on an NGO's public profile — "146,000 people reached".
 *
 * `value` is free text rather than a number because impact is reported in
 * shapes a number can't hold: "2 in 3", "31 hrs", "98%". Constraining it would
 * force NGOs to misrepresent their own results.
 */
export function ImpactMetricsCard() {
  const { data: metrics, isPending } = useImpactMetrics();
  const createMetric = useCreateImpactMetric();
  const updateMetric = useUpdateImpactMetric();
  const deleteMetric = useDeleteImpactMetric();

  const [draft, setDraft] = useState<UpsertImpactMetricInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const atLimit = (metrics?.length ?? 0) >= MAX_IMPACT_METRICS;

  async function save() {
    if (!draft) return;
    setError(null);

    try {
      if (editingId) {
        await updateMetric.mutateAsync({ id: editingId, input: draft });
      } else {
        await createMetric.mutateAsync(draft);
      }
      setDraft(null);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMetric.mutateAsync(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
    }
  }

  const saving = createMetric.isPending || updateMetric.isPending;

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <TrendingUp className="h-4 w-4 text-primary" />
            Impact metrics
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The headline numbers donors see first. Up to {MAX_IMPACT_METRICS}.
          </p>
        </div>

        {!draft && (
          <Button
            type="button"
            variant="secondary"
            disabled={atLimit}
            onClick={() => {
              setEditingId(null);
              setDraft(EMPTY);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Add
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      {atLimit && !draft && (
        <p className="mt-3 text-xs text-muted-foreground">
          You've reached the maximum. Delete one to add another.
        </p>
      )}

      {draft && (
        <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Label" htmlFor="metric-label">
              <Input
                id="metric-label"
                autoFocus
                placeholder="People reached"
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>
            <Field label="Value" htmlFor="metric-value">
              <Input
                id="metric-value"
                placeholder="146,000"
                value={draft.value}
                onChange={(e) => setDraft({ ...draft, value: e.target.value })}
              />
            </Field>
            <Field label="Unit / note" htmlFor="metric-unit" hint="Optional">
              <Input
                id="metric-unit"
                placeholder="lifetime"
                value={draft.unit ?? ""}
                onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
              />
            </Field>
          </div>

          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Add metric"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setEditingId(null);
                setError(null);
              }}
            >
              <X className="mr-1.5 h-4 w-4" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {isPending && <Skeleton className="h-16 w-full rounded-lg" />}

        {!isPending && metrics?.length === 0 && !draft && (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No metrics yet. Add your first one to show donors your impact.
          </p>
        )}

        {metrics?.map((metric: ImpactMetricDetail) => (
          <div
            key={metric.id}
            className="flex items-center justify-between gap-4 rounded-lg border border-border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-lg font-semibold text-foreground">
                {metric.value}
                {metric.unit && (
                  <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                    {metric.unit}
                  </span>
                )}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {metric.label}
              </p>
            </div>

            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(metric.id);
                  setDraft({
                    label: metric.label,
                    value: metric.value,
                    unit: metric.unit ?? "",
                  });
                }}
              >
                Edit
              </Button>
              <button
                type="button"
                onClick={() => void remove(metric.id)}
                aria-label={`Delete ${metric.label}`}
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
