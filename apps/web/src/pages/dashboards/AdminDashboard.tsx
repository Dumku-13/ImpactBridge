import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck,
  Ban,
  Building2,
  History,
  RotateCcw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { formatMoney } from "@impactbridge/shared";
import {
  useAdminOrganizations,
  useAdminUsers,
  useAuditLog,
  usePlatformStats,
  useSuspendOrganization,
  useSuspendUser,
  useVerifyOrganization,
  type AdminOrganization,
  type AdminUser,
} from "@/api/admin";
import { ApiError } from "@/lib/api";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { cn } from "@/lib/utils";

type Tab = "organizations" | "users" | "audit";

export function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("organizations");
  const { data: stats, isPending } = usePlatformStats();

  return (
    <div className="mx-auto max-w-5xl space-y-6 py-8">
      {/*
        Deliberately the plainest surface in the product. An admin is here to
        clear a queue and read a log, and decoration would only get between them
        and the record. The editorial voice stops at the eyebrow.
      */}
      <header>
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          Platform admin
        </p>
        <h1
          className="mt-3 font-display text-3xl font-semibold tracking-[-0.02em] text-foreground"
          style={{ fontVariationSettings: '"SOFT" 12' }}
        >
          Verification and audit
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Verify organisations, manage accounts, and review the audit trail.
        </p>
      </header>

      {isPending && <Skeleton className="h-24 w-full rounded-xl" />}

      {stats && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Users",
                value: String(stats.users.total),
                sub: `${stats.users.donors} donors · ${stats.users.ngoAdmins} NGOs · ${stats.users.funders} funders`,
              },
              {
                label: "Organisations",
                value: String(stats.organizations.total),
                sub: `${stats.organizations.verified} verified · ${stats.organizations.suspended} suspended`,
              },
              {
                label: "Donations",
                value: formatMoney(stats.donations.totalMinor, stats.currency),
                sub: `${stats.donations.count} gifts`,
              },
              {
                label: "Grants released",
                value: formatMoney(stats.grants.releasedMinor, stats.currency),
                sub: `${formatMoney(stats.grants.committedMinor, stats.currency)} committed`,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded-xl border border-border bg-card p-4 shadow-subtle"
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                  {stat.label}
                </p>
                <p className="tnum mt-1 font-display text-2xl font-semibold text-foreground">
                  {stat.value}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex gap-1 border-b border-border">
        {(
          [
            ["organizations", "Organisations", Building2],
            ["users", "Users", Users],
            ["audit", "Audit log", History],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              "-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors",
              tab === value
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "organizations" && <OrganizationsTab />}
      {tab === "users" && <UsersTab />}
      {tab === "audit" && <AuditTab />}
    </div>
  );
}

function OrganizationsTab() {
  const [filter, setFilter] = useState("all");
  const { data, isPending } = useAdminOrganizations(filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {[
          ["all", "All"],
          ["unverified", "Awaiting verification"],
          ["suspended", "Suspended"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value!)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              filter === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending && <Skeleton className="h-48 w-full rounded-xl" />}

      {data?.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          Nothing here.
        </p>
      )}

      {data?.items.map((organization) => (
        <OrganizationRow key={organization.id} organization={organization} />
      ))}
    </div>
  );
}

function OrganizationRow({
  organization,
}: {
  organization: AdminOrganization;
}) {
  const verifyOrganization = useVerifyOrganization();
  const suspendOrganization = useSuspendOrganization();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [askingReason, setAskingReason] = useState(false);

  const suspended = organization.status === "SUSPENDED";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setAskingReason(false);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-subtle">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            {organization.verified ? (
              <Badge variant="success">
                <BadgeCheck className="mr-1 h-3 w-3" />
                Verified
              </Badge>
            ) : (
              <Badge variant="outline">Unverified</Badge>
            )}
            {suspended && <Badge variant="outline">Suspended</Badge>}
          </div>

          <Link
            to={`/ngo/${organization.slug}`}
            className="mt-2 block font-medium text-foreground hover:text-primary hover:underline"
          >
            {organization.name}
          </Link>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {organization.owner.email} ·{" "}
            {[organization.city, organization.state].filter(Boolean).join(", ") ||
              "no location"}{" "}
            · {organization.documentCount} documents ·{" "}
            {formatMoney(organization.totalRaisedMinor, "inr")} raised
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap gap-1">
          <Button
            type="button"
            variant={organization.verified ? "outline" : "primary"}
            disabled={verifyOrganization.isPending}
            onClick={() =>
              void run(() =>
                verifyOrganization.mutateAsync({
                  id: organization.id,
                  verified: !organization.verified,
                }),
              )
            }
          >
            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
            {organization.verified ? "Un-verify" : "Verify"}
          </Button>

          {suspended ? (
            <Button
              type="button"
              variant="secondary"
              disabled={suspendOrganization.isPending}
              onClick={() =>
                void run(() =>
                  suspendOrganization.mutateAsync({
                    id: organization.id,
                    suspended: false,
                  }),
                )
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reinstate
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAskingReason((v) => !v)}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Suspend
            </Button>
          )}
        </div>
      </div>

      {/* A suspension without a reason is useless later, so the server rejects
          it — the form asks for one rather than letting that 400 surprise you. */}
      {askingReason && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <Input
            autoFocus
            value={reason}
            placeholder="Why is this organisation being suspended?"
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            disabled={!reason.trim() || suspendOrganization.isPending}
            onClick={() =>
              void run(() =>
                suspendOrganization.mutateAsync({
                  id: organization.id,
                  suspended: true,
                  reason,
                }),
              )
            }
          >
            Confirm
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const { data, isPending } = useAdminUsers(debouncedSearch, role);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or email…"
            className="pl-9"
            aria-label="Search users"
          />
        </div>

        {[
          ["", "All roles"],
          ["DONOR", "Donors"],
          ["NGO_ADMIN", "NGOs"],
          ["FUNDER", "Funders"],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            onClick={() => setRole(value!)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              role === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isPending && <Skeleton className="h-48 w-full rounded-xl" />}

      {data?.items.map((user) => <UserRow key={user.id} user={user} />)}
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  const suspendUser = useSuspendUser();
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [askingReason, setAskingReason] = useState(false);

  const suspended = user.status === "SUSPENDED";

  async function run(action: () => Promise<unknown>) {
    setError(null);
    try {
      await action();
      setAskingReason(false);
      setReason("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-subtle">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-foreground">{user.name}</span>
            <Badge variant="outline">{user.role.replace("_", " ")}</Badge>
            {suspended && <Badge variant="outline">Suspended</Badge>}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {user.email}
            {!user.emailVerified && " · email unverified"}
          </p>
        </div>

        {/* Platform admins are deliberately not suspendable from here — the
            server refuses too, so the platform can't lock itself out. */}
        {user.role !== "PLATFORM_ADMIN" &&
          (suspended ? (
            <Button
              type="button"
              variant="secondary"
              disabled={suspendUser.isPending}
              onClick={() =>
                void run(() =>
                  suspendUser.mutateAsync({ id: user.id, suspended: false }),
                )
              }
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reinstate
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => setAskingReason((v) => !v)}
            >
              <Ban className="mr-1.5 h-3.5 w-3.5" />
              Suspend
            </Button>
          ))}
      </div>

      {askingReason && (
        <div className="mt-3 flex gap-2 border-t border-border pt-3">
          <Input
            autoFocus
            value={reason}
            placeholder="Reason for suspension"
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            type="button"
            disabled={!reason.trim() || suspendUser.isPending}
            onClick={() =>
              void run(() =>
                suspendUser.mutateAsync({
                  id: user.id,
                  suspended: true,
                  reason,
                }),
              )
            }
          >
            Confirm
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="error" className="mt-3">
          {error}
        </Alert>
      )}
    </div>
  );
}

function AuditTab() {
  const { data, isPending } = useAuditLog();

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Every privileged action, newest first. Append-only — entries are never
        edited or removed.
      </p>

      {isPending && <Skeleton className="h-48 w-full rounded-xl" />}

      {data?.items.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
          No admin actions recorded yet.
        </p>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {data?.items.map((entry) => (
          <li key={entry.id} className="px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs text-primary">
                {entry.action.replace(/_/g, " ").toLowerCase()}
              </span>
              <span className="text-sm text-foreground">
                {entry.targetName ?? entry.targetId}
              </span>
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString("en-IN")}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              by {entry.actorName}
              {entry.reason && ` — “${entry.reason}”`}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
