import { useRef, useState } from "react";
import { Camera, Loader2, Plus, Trash2, Users, X } from "lucide-react";
import {
  MAX_TEAM_MEMBERS,
  type TeamMember,
  type UpsertTeamMemberInput,
} from "@impactbridge/shared";
import {
  useCreateTeamMember,
  useDeleteTeamMember,
  useTeamMembers,
  useUpdateTeamMember,
  useUploadTeamMemberPhoto,
} from "@/api/ngo";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Field } from "@/components/ui/Field";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";

const EMPTY: UpsertTeamMemberInput = {
  name: "",
  role: "",
  bio: "",
  linkedinUrl: "",
};

/** Initials fallback while a member has no photo. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The people behind the organisation.
 *
 * Team members are plain records, not linked User accounts — most founders and
 * trustees an NGO wants to show will never log in, so requiring an account
 * would make the roster unusable.
 */
export function TeamCard() {
  const { data: team, isPending } = useTeamMembers();
  const createMember = useCreateTeamMember();
  const updateMember = useUpdateTeamMember();
  const uploadPhoto = useUploadTeamMemberPhoto();
  const deleteMember = useDeleteTeamMember();

  const [draft, setDraft] = useState<UpsertTeamMemberInput | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoTargetId, setPhotoTargetId] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);

  const atLimit = (team?.length ?? 0) >= MAX_TEAM_MEMBERS;
  const saving = createMember.isPending || updateMember.isPending;

  async function save() {
    if (!draft) return;
    setError(null);

    try {
      if (editingId) {
        await updateMember.mutateAsync({ id: editingId, input: draft });
      } else {
        await createMember.mutateAsync(draft);
      }
      setDraft(null);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save.");
    }
  }

  async function handlePhoto(file?: File) {
    if (!file || !photoTargetId) return;
    setError(null);

    try {
      await uploadPhoto.mutateAsync({ id: photoTargetId, file });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Upload failed.");
    } finally {
      setPhotoTargetId(null);
      // Reset so re-picking the same file still fires onChange.
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    try {
      await deleteMember.mutateAsync(id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete.");
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-subtle">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <Users className="h-4 w-4 text-primary" />
            Team
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            The people donors and funders will be trusting with their money.
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

      {/* One hidden input reused by every row's camera button. */}
      <input
        ref={photoInput}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => void handlePhoto(e.target.files?.[0])}
      />

      {draft && (
        <div className="mt-4 rounded-lg border border-border bg-secondary/40 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="member-name">
              <Input
                id="member-name"
                autoFocus
                placeholder="Ravi Menon"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </Field>
            <Field label="Role" htmlFor="member-role">
              <Input
                id="member-role"
                placeholder="Founder & Director"
                value={draft.role}
                onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Short bio" htmlFor="member-bio" hint="Optional" className="mt-3">
            <textarea
              id="member-bio"
              rows={3}
              maxLength={400}
              placeholder="15 years in community health, previously at…"
              value={draft.bio ?? ""}
              onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>

          <Field label="LinkedIn" htmlFor="member-linkedin" hint="Optional" className="mt-3">
            <Input
              id="member-linkedin"
              placeholder="https://linkedin.com/in/…"
              value={draft.linkedinUrl ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, linkedinUrl: e.target.value })
              }
            />
          </Field>

          <div className="mt-3 flex gap-2">
            <Button type="button" onClick={() => void save()} disabled={saving}>
              {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              {editingId ? "Save changes" : "Add member"}
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

          {!editingId && (
            <p className="mt-2 text-xs text-muted-foreground">
              You can add a photo once the member is saved.
            </p>
          )}
        </div>
      )}

      <div className="mt-4 space-y-2">
        {isPending && <Skeleton className="h-20 w-full rounded-lg" />}

        {!isPending && team?.length === 0 && !draft && (
          <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            No team members yet. Adding a few builds real credibility.
          </p>
        )}

        {team?.map((member: TeamMember) => (
          <div
            key={member.id}
            className="flex items-start gap-4 rounded-lg border border-border p-4"
          >
            <div className="relative shrink-0">
              {member.photoUrl ? (
                <img
                  src={member.photoUrl}
                  alt={member.name}
                  className="h-14 w-14 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-muted-foreground">
                  {initials(member.name)}
                </div>
              )}

              <button
                type="button"
                aria-label={`Change photo for ${member.name}`}
                onClick={() => {
                  setPhotoTargetId(member.id);
                  photoInput.current?.click();
                }}
                className="absolute -bottom-1 -right-1 rounded-full border border-border bg-card p-1.5 text-muted-foreground shadow-sm transition-colors hover:text-foreground"
              >
                {uploadPhoto.isPending && photoTargetId === member.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Camera className="h-3 w-3" />
                )}
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">{member.name}</p>
              <p className="text-sm text-primary">{member.role}</p>
              {member.bio && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {member.bio}
                </p>
              )}
            </div>

            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditingId(member.id);
                  setDraft({
                    name: member.name,
                    role: member.role,
                    bio: member.bio ?? "",
                    linkedinUrl: member.linkedinUrl ?? "",
                  });
                }}
              >
                Edit
              </Button>
              <button
                type="button"
                onClick={() => void remove(member.id)}
                aria-label={`Remove ${member.name}`}
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
