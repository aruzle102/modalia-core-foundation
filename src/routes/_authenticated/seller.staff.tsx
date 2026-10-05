import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { queryOptions, useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminCard, EmptyState, Field, StatusPill, TableSkeleton, fmtDateTime } from "@/components/admin/ui";
import { SellerShell } from "@/components/seller/SellerShell";
import { STAFF_PERMISSIONS, STAFF_TITLES, STAFF_TITLE_SUGGESTIONS, inviteStaff, listStaff, updateStaff, type StaffTitle } from "@/lib/seller-team.functions";
import type { SellerPermission } from "@/lib/seller-auth";
import { getLocale, getTranslations } from "@/lib/i18n";

const q = queryOptions({ queryKey: ["seller-staff"], queryFn: () => listStaff() });

export const Route = createFileRoute("/_authenticated/seller/staff")({
  validateSearch: (search: Record<string, unknown>) => ({ locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined) }),
  loader: ({ context }) => context.queryClient.ensureQueryData(q),
  pendingComponent: TableSkeleton,
  component: StaffPage,
});

function StaffPage() {
  const { locale } = Route.useSearch();
  const t = getTranslations(locale);
  const { data } = useSuspenseQuery(q);

  return (
    <SellerShell
      eyebrow="Seller workspace"
      title="Staff & permissions"
    >
      <p className="text-body text-muted-foreground">Invite team members, assign role titles and fine-grained permissions. Deactivated members lose access immediately.</p>
      {data.isOwner ? <InviteForm /> : null}
      <StaffTable />
    </SellerShell>
  );
}

const GROUPS = [...new Set(STAFF_PERMISSIONS.map((p) => p.group))];

function InviteForm() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [title, setTitle] = useState<StaffTitle>("Support");
  const [permissions, setPermissions] = useState<SellerPermission[]>(STAFF_TITLE_SUGGESTIONS["Support"]);
  const [message, setMessage] = useState<string | null>(null);

  const toggle = (key: SellerPermission) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));

  const mutation = useMutation({
    mutationFn: () => inviteStaff({ data: { email, title, permissions } }),
    onSuccess: () => {
      setMessage("Invitation sent.");
      setEmail("");
      setPermissions(STAFF_TITLE_SUGGESTIONS[title]);
      qc.invalidateQueries({ queryKey: ["seller-staff"] });
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "Invitation failed."),
  });

  return (
    <AdminCard
      title="Invite a staff member"
      subtitle="They receive an email invite and appear in your team once they sign in."
      className="mb-8"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email address">
          <Input type="email" required placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Role title" hint="Preset permissions update when you change the title.">
          <Select
            value={title}
            onValueChange={(v) => {
              const next = v as StaffTitle;
              setTitle(next);
              setPermissions(STAFF_TITLE_SUGGESTIONS[next]);
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {STAFF_TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>
      <div className="mt-5 space-y-4">
        {GROUPS.map((group) => (
          <fieldset key={group}>
            <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {STAFF_PERMISSIONS.filter((p) => p.group === group).map((p) => (
                <label key={p.key} className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-2.5 text-small">
                  <Checkbox className="mt-0.5" checked={permissions.includes(p.key)} onCheckedChange={() => toggle(p.key)} />
                  <span>
                    <span className="block font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button disabled={!email || mutation.isPending} onClick={() => mutation.mutate()}>
          {mutation.isPending ? "Sending…" : "Send invitation"}
        </Button>
        {message ? <p className="text-small text-muted-foreground">{message}</p> : null}
      </div>
    </AdminCard>
  );
}

function StaffTable() {
  const { data } = useSuspenseQuery(q);
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (input: { staffId: string; active: boolean }) => updateStaff({ data: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seller-staff"] }),
  });

  if (!data.staff.length) {
    return (
      <AdminCard>
        <EmptyState title="No staff members yet" text="Invite your first team member above to delegate products, orders or support." />
      </AdminCard>
    );
  }

  const permissionLabel = (key: string) => STAFF_PERMISSIONS.find((p) => p.key === key)?.label ?? key;

  return (
    <AdminCard title="Team members" subtitle={`${data.staff.length} member${data.staff.length === 1 ? "" : "s"}`}>
      <div className="divide-y divide-border">
        {data.staff.map((member) => (
          <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4">
            <div className="min-w-0">
              <p className="font-medium">{member.title ?? "Staff"}</p>
              <p className="text-caption text-muted-foreground" dir="ltr">
                {member.userId.slice(0, 8)}… · joined {fmtDateTime(member.createdAt)}
              </p>
              <div className="mt-2 flex max-w-xl flex-wrap gap-1.5">
                {member.permissions.slice(0, 6).map((p) => (
                  <span key={p} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{permissionLabel(p)}</span>
                ))}
                {member.permissions.length > 6 ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">+{member.permissions.length - 6} more</span>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusPill status={member.active ? "active" : "inactive"} />
              {data.isOwner ? (
                <label className="flex items-center gap-2 text-small text-muted-foreground">
                  Active
                  <Switch
                    checked={member.active}
                    disabled={mutation.isPending}
                    onCheckedChange={(active) => mutation.mutate({ staffId: member.id, active })}
                  />
                </label>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </AdminCard>
  );
}
