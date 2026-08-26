import { useEffect, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Building2,
  Camera,
  ExternalLink,
  FileText,
  ImageIcon,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import {
  DOCUMENT_TYPE_LABELS,
  LEGAL_DOCUMENT_TYPES,
  formatMoney,
  updateOrganizationSchema,
  type DocumentType,
  type UpdateOrganizationInput,
} from "@impactbridge/shared";
import {
  useCategories,
  useDeleteDocument,
  useMyDocuments,
  useMyOrganization,
  useUpdateOrganization,
  useUploadDocument,
  useUploadOrganizationImage,
} from "@/api/ngo";
import { AnalyticsCard } from "@/components/ngo/AnalyticsCard";
import { DonationsReceivedCard } from "@/components/ngo/DonationsReceivedCard";
import { ImpactMetricsCard } from "@/components/ngo/ImpactMetricsCard";
import { TeamCard } from "@/components/ngo/TeamCard";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatBlock } from "@/components/editorial/StatBlock";
import { cn } from "@/lib/utils";

/** Bytes → "2.4 MB", for the document list. */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function NgoDashboard() {
  const { data: organization, isPending, error } = useMyOrganization();

  if (isPending) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 py-8">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <Alert variant="error">
          {error instanceof ApiError
            ? error.message
            : "Couldn't load your organisation."}
        </Alert>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            Organisation dashboard
          </p>
          <h1
            className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground sm:text-4xl"
            style={{ fontVariationSettings: '"SOFT" 12' }}
          >
            {organization.name}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          {organization.verified ? (
            <Badge variant="success">
              <BadgeCheck className="mr-1 h-3 w-3" />
              Verified
            </Badge>
          ) : (
            <Badge variant="outline">Pending verification</Badge>
          )}
          <Link
            to={`/ngo/${organization.slug}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
          >
            View public page
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <StatsRow organization={organization} />
      <AnalyticsCard />
      <DonationsReceivedCard />
      <BrandingCard organization={organization} />
      <ProfileForm organization={organization} />
      <ImpactMetricsCard />
      <TeamCard />
      <DocumentsCard />
    </div>
  );
}

function StatsRow({
  organization,
}: {
  organization: { totalRaisedMinor: number; donorCount: number; fundingGoalMinor: number };
}) {
  const pct =
    organization.fundingGoalMinor > 0
      ? Math.min(
          100,
          Math.round(
            (organization.totalRaisedMinor / organization.fundingGoalMinor) *
              100,
          ),
        )
      : 0;

  const stats = [
    { label: "Raised", value: formatMoney(organization.totalRaisedMinor, "inr") },
    { label: "Donors", value: String(organization.donorCount) },
    { label: "Goal reached", value: `${pct}%` },
  ];

  return (
    // Hairline band rather than three boxes — see the note in FunderDashboard.
    <div className="grid grid-cols-1 gap-px overflow-hidden border-y border-border bg-border sm:grid-cols-3">
      {stats.map((s) => (
        <div key={s.label} className="bg-background py-5 sm:px-5">
          <StatBlock label={s.label} size="sm">
            {s.value}
          </StatBlock>
        </div>
      ))}
    </div>
  );
}

/** Logo + cover image upload. */
function BrandingCard({
  organization,
}: {
  organization: { logoUrl: string | null; coverUrl: string | null };
}) {
  const uploadImage = useUploadOrganizationImage();
  const [error, setError] = useState<string | null>(null);
  const logoInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  async function handle(kind: "logo" | "cover", file?: File) {
    if (!file) return;
    setError(null);
    try {
      await uploadImage.mutateAsync({ kind, file });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="text-lg font-semibold text-foreground">Branding</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown on your profile and on every card donors see.
      </p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 space-y-4">
        <div
          className="relative h-36 overflow-hidden rounded-lg border border-border bg-secondary"
          style={
            organization.coverUrl
              ? {
                  backgroundImage: `url(${organization.coverUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
        >
          {!organization.coverUrl && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <ImageIcon className="mr-2 h-4 w-4" />
              No cover image
            </div>
          )}
          <button
            type="button"
            onClick={() => coverInput.current?.click()}
            disabled={uploadImage.isPending}
            className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-background/90 px-3 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-background disabled:opacity-60"
          >
            <Camera className="h-4 w-4" />
            {organization.coverUrl ? "Replace cover" : "Add cover"}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary">
            {organization.logoUrl ? (
              <img
                src={organization.logoUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <Building2 className="h-6 w-6 text-muted-foreground" />
            )}
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => logoInput.current?.click()}
            disabled={uploadImage.isPending}
          >
            {uploadImage.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Camera className="mr-2 h-4 w-4" />
            )}
            {organization.logoUrl ? "Replace logo" : "Add logo"}
          </Button>
        </div>
      </div>

      <input
        ref={logoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle("logo", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <input
        ref={coverInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void handle("cover", e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </section>
  );
}

function ProfileForm({
  organization,
}: {
  organization: {
    name: string;
    mission: string;
    description: string | null;
    city: string | null;
    state: string | null;
    country: string;
    website: string | null;
    contactEmail: string | null;
    phone: string | null;
    foundedYear: number | null;
    fundingGoalMinor: number;
    categories: Array<{ id: string; name: string }>;
  };
}) {
  const updateOrg = useUpdateOrganization();
  const { data: categories } = useCategories();
  const [saved, setSaved] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UpdateOrganizationInput>({
    resolver: zodResolver(updateOrganizationSchema),
    defaultValues: {
      name: organization.name,
      mission: organization.mission,
      description: organization.description ?? "",
      city: organization.city ?? "",
      state: organization.state ?? "",
      country: organization.country,
      website: organization.website ?? "",
      contactEmail: organization.contactEmail ?? "",
      phone: organization.phone ?? "",
      foundedYear: organization.foundedYear,
      // Rupees in the input, paise in the database.
      fundingGoalMinor: organization.fundingGoalMinor,
      categoryIds: organization.categories.map((c) => c.id),
    },
  });

  /*
   * `useWatch` subscribes to ONE field. The `watch("categoryIds")` this
   * replaces re-rendered this entire ~230-line form — six-row textarea and all
   * — on every keystroke in every field, which is exactly the isolation
   * react-hook-form exists to provide.
   */
  const selectedCategories = useWatch({ control, name: "categoryIds" });

  /*
   * Clear the "Saved" confirmation once the user edits again.
   *
   * Only subscribe while the banner is actually showing: otherwise this fires
   * `setSaved(false)` — a state update, so another full render — on every
   * single keystroke, to set a value that is already false.
   */
  useEffect(() => {
    if (!saved) return;
    const sub = watch(() => setSaved(false));
    return () => sub.unsubscribe();
  }, [watch, saved]);

  async function onSubmit(values: UpdateOrganizationInput) {
    setFormError(null);
    try {
      await updateOrg.mutateAsync(values);
      setSaved(true);
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Couldn't save your changes.",
      );
    }
  }

  function toggleCategory(id: string) {
    const current = selectedCategories ?? [];
    setValue(
      "categoryIds",
      current.includes(id)
        ? current.filter((c) => c !== id)
        : [...current, id],
      { shouldDirty: true },
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="text-lg font-semibold text-foreground">Profile</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        This is what donors read before they give.
      </p>

      {formError && (
        <Alert variant="error" className="mt-4">
          {formError}
        </Alert>
      )}
      {saved && (
        <Alert variant="success" className="mt-4">
          Profile saved.
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-5">
        <Field label="Organisation name" htmlFor="name" error={errors.name?.message}>
          <Input id="name" {...register("name")} />
        </Field>

        <Field
          label="Mission"
          htmlFor="mission"
          hint="One line, shown on your card in search results."
          error={errors.mission?.message}
        >
          <Input id="mission" {...register("mission")} />
        </Field>

        <Field label="About" htmlFor="description" error={errors.description?.message}>
          <textarea
            id="description" {...register("description")}
            rows={6}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            placeholder="What you do, who you serve, and how you measure success."
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City" htmlFor="city" error={errors.city?.message}>
            <Input id="city" {...register("city")} />
          </Field>
          <Field label="State" htmlFor="state" error={errors.state?.message}>
            <Input id="state" {...register("state")} />
          </Field>
          <Field label="Country" htmlFor="country" error={errors.country?.message}>
            <Input id="country" {...register("country")} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Website" htmlFor="website" error={errors.website?.message}>
            <Input id="website" {...register("website")} placeholder="https://" />
          </Field>
          <Field label="Contact email" htmlFor="contactEmail" error={errors.contactEmail?.message}>
            <Input id="contactEmail" {...register("contactEmail")} type="email" />
          </Field>
          <Field label="Phone" htmlFor="phone" error={errors.phone?.message}>
            <Input id="phone" {...register("phone")} />
          </Field>
          <Field label="Founded year" htmlFor="foundedYear" error={errors.foundedYear?.message}>
            <Input
              id="foundedYear"
              type="number"
              {...register("foundedYear", {
                setValueAs: (v) => (v === "" ? null : Number(v)),
              })}
            />
          </Field>
        </div>

        <Field
          label="Funding goal (₹)"
          htmlFor="fundingGoal"
          hint="Entered in rupees; stored in paise."
          error={errors.fundingGoalMinor?.message}
        >
          <Input
            id="fundingGoal"
            type="number"
            {...register("fundingGoalMinor", {
              // The form works in rupees, the API in paise.
              setValueAs: (v) => (v === "" ? 0 : Math.round(Number(v) * 100)),
            })}
            defaultValue={organization.fundingGoalMinor / 100}
          />
        </Field>

        <Field label="Causes" htmlFor="causes" error={errors.categoryIds?.message}>
          <div id="causes" className="flex flex-wrap gap-2">
            {categories?.map((category) => {
              const active = selectedCategories?.includes(category.id);
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => toggleCategory(category.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-sm transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-foreground hover:bg-secondary",
                  )}
                >
                  {category.name}
                </button>
              );
            })}
          </div>
        </Field>

        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </form>
    </section>
  );
}

function DocumentsCard() {
  const { data, isPending } = useMyDocuments();
  const uploadDocument = useUploadDocument();
  const deleteDocument = useDeleteDocument();
  const fileInput = useRef<HTMLInputElement>(null);

  const [type, setType] = useState<DocumentType>("REGISTRATION_CERTIFICATE");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file?: File) {
    if (!file) return;
    setError(null);

    try {
      await uploadDocument.mutateAsync({
        file,
        type,
        // Fall back to the file's own name so a title is never required.
        title: title.trim() || file.name,
      });
      setTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <h2 className="text-lg font-semibold text-foreground">Documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Legal paperwork stays private to you and platform admins. Gallery images
        appear on your public profile.
      </p>

      {error && (
        <Alert variant="error" className="mt-4">
          {error}
        </Alert>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-[200px_1fr_auto] sm:items-end">
        <Field label="Type" htmlFor="docType">
          <select
            id="docType"
            value={type}
            onChange={(e) => setType(e.target.value as DocumentType)}
            className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary"
          >
            {[...LEGAL_DOCUMENT_TYPES, "GALLERY_IMAGE" as const].map((t) => (
              <option key={t} value={t}>
                {DOCUMENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title" htmlFor="docTitle" hint="Optional — defaults to the file name.">
          <Input
            id="docTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Annual Report 2025"
          />
        </Field>

        <Button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={uploadDocument.isPending}
        >
          {uploadDocument.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Upload
        </Button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept={type === "GALLERY_IMAGE" ? "image/*" : "image/*,application/pdf"}
        className="hidden"
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />

      <div className="mt-6">
        {isPending ? (
          <Skeleton className="h-20 w-full rounded-lg" />
        ) : !data?.items.length ? (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No documents uploaded yet.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {data.items.map((doc) => (
              <li key={doc.id} className="flex items-center gap-3 py-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  {doc.type === "GALLERY_IMAGE" ? (
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {doc.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {DOCUMENT_TYPE_LABELS[doc.type]} · {formatBytes(doc.bytes)}
                    {doc.isPublic ? " · Public" : " · Private"}
                  </p>
                </div>

                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`Open ${doc.title}`}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>

                <button
                  type="button"
                  onClick={() => deleteDocument.mutate(doc.id)}
                  disabled={deleteDocument.isPending}
                  aria-label={`Delete ${doc.title}`}
                  className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
