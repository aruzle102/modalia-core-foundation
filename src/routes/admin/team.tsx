import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Pencil, Plus, ShieldAlert } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  StatusPill,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
} from "@/components/admin/ui";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { useAdminT } from "@/components/admin/use-admin-t";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listAdminMembers,
  createAdminMember,
  updateAdminMember,
  setAdminMemberActive,
  type AdminMemberRow,
} from "@/lib/admin-team.functions";
import { getMyAdminIdentity } from "@/lib/admin-permissions";
import { ALL_ADMIN_PERMISSIONS, ADMIN_ROLE_PRESETS, type AdminRole } from "@/lib/admin-permissions";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/team")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminTeamPage,
});

const ROLE_ORDER: AdminRole[] = ["admin", "supervisor", "viewer"];

/** Group admin permissions for the checkbox UI (mirrors the catalog order). */
const PERMISSION_GROUPS: { group: string; perms: string[] }[] = [
  { group: "dashboard", perms: ["dashboard.view", "analytics.view"] },
  { group: "orders", perms: ["orders.view", "orders.manage"] },
  { group: "products", perms: ["products.view", "products.manage", "reviews.manage", "categories.manage"] },
  { group: "sellers", perms: ["sellers.view", "sellers.manage", "applications.decide", "stores.view", "stores.manage", "customers.view"] },
  { group: "marketing", perms: ["coupons.manage"] },
  { group: "logistics", perms: ["shipping.manage", "settlements.manage"] },
  { group: "content", perms: ["content.manage", "intelligence.manage"] },
  { group: "notifications", perms: ["notifications.view", "notifications.manage"] },
];

function roleLabel(t: ReturnType<typeof useAdminT>["team"], role: string): string {
  if (role === "super_admin") return t.roleSuperAdmin;
  if (role === "admin") return t.roleAdmin;
  if (role === "supervisor") return t.roleSupervisor;
  return t.roleViewer;
}

function AdminTeamPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  const t = useAdminT().team;

  return (
    <AdminGate>
      <RequireSuperAdmin>
        <AdminShell title={t.title} subtitle={t.subtitle} breadcrumbs={[{ label: nav.team }]}>
          <TeamManager />
        </AdminShell>
      </RequireSuperAdmin>
    </AdminGate>
  );
}

/** Super-admin-only gate — server functions enforce independently. */
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const identityQuery = useQuery({ queryKey: ["admin-identity"], queryFn: () => getMyAdminIdentity() });
  if (identityQuery.isLoading) return <TableSkeleton />;
  if (identityQuery.data?.kind !== "super_admin") {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-8 w-8" />}
        title="Access denied"
        text="Only the super admin can manage the team."
      />
    );
  }
  return <>{children}</>;
}

function TeamManager() {
  const t = useAdminT().team;
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<null | { mode: "create" } | { mode: "edit"; member: AdminMemberRow }>(null);
  const [toggling, setToggling] = useState<AdminMemberRow | null>(null);

  const membersQuery = useQuery({ queryKey: ["admin-team"], queryFn: () => listAdminMembers() });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-team"] });

  const toggleMutation = useMutation({
    mutationFn: (m: AdminMemberRow) => setAdminMemberActive({ data: { userId: m.userId, active: !m.active } }),
    onSuccess: () => { refresh(); setToggling(null); },
    onError: (e) => toast.error(errMsg(e)),
  });

  const members = membersQuery.data ?? [];

  return (
    <AdminCard
      actions={
        <Button onClick={() => setDialog({ mode: "create" })}>
          <Plus className="me-2 h-4 w-4" /> {t.addMember}
        </Button>
      }
    >
      {membersQuery.isLoading ? (
        <TableSkeleton />
      ) : membersQuery.isError ? (
        <EmptyState title={t.title} text={String(membersQuery.error)} />
      ) : members.length === 0 ? (
        <EmptyState title={t.title} text={t.subtitle} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-start text-muted-foreground">
                <th className="py-2 pe-4 text-start font-medium">{t.email}</th>
                <th className="py-2 pe-4 text-start font-medium">{t.role}</th>
                <th className="py-2 pe-4 text-start font-medium">{t.status}</th>
                <th className="py-2 text-end font-medium">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId} className="border-b last:border-0">
                  <td className="py-2 pe-4">
                    <span className="font-medium">{m.email || m.userId.slice(0, 8)}</span>
                    {m.locked ? (
                      <span className="ms-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Lock className="h-3 w-3" /> {t.locked}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pe-4">
                    <StatusPill status={roleLabel(t, m.role)} />
                  </td>
                  <td className="py-2 pe-4">
                    <StatusPill status={m.active ? t.active : t.inactive} />
                  </td>
                  <td className="py-2 text-end">
                    {m.locked ? null : (
                      <div className="flex items-center justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setDialog({ mode: "edit", member: m })}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setToggling(m)}>
                          {m.active ? t.deactivate : t.activate}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dialog ? (
        <MemberDialog
          key={dialog.mode === "edit" ? dialog.member.userId : "new"}
          initial={dialog.mode === "edit" ? dialog.member : null}
          onClose={() => setDialog(null)}
          onSaved={() => { refresh(); setDialog(null); }}
        />
      ) : null}

      {toggling ? (
        <ConfirmDialog
          open
          onOpenChange={(open) => { if (!open) setToggling(null); }}
          title={toggling.active ? t.deactivate : t.activate}
          description={toggling.email}
          confirmLabel={toggling.active ? t.deactivate : t.activate}
          danger={toggling.active}
          onConfirm={() => toggleMutation.mutate(toggling)}
        />
      ) : null}
    </AdminCard>
  );
}

function MemberDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: AdminMemberRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useAdminT().team;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>((initial?.role as AdminRole) ?? "viewer");
  const [permissions, setPermissions] = useState<string[]>(
    initial ? initial.permissions : [...ADMIN_ROLE_PRESETS.viewer],
  );

  const applyRole = (r: AdminRole) => {
    setRole(r);
    setPermissions([...ADMIN_ROLE_PRESETS[r]]);
  };

  const toggle = (key: string) =>
    setPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const mutation = useMutation({
    mutationFn: () =>
      initial
        ? updateAdminMember({ data: { userId: initial.userId, role, permissions } })
        : createAdminMember({ data: { email, role, permissions } }),
    onSuccess: () => { onSaved(); },
    onError: (e) => toast.error(errMsg(e) || t.userNotFound),
  });

  const roleHint =
    role === "admin" ? t.roleAdminHint : role === "supervisor" ? t.roleSupervisorHint : t.roleViewerHint;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? t.editMember : t.addMember}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {!initial ? (
            <Field label={t.emailLabel} hint={t.emailHint}>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.emailPlaceholder}
                dir="ltr"
              />
            </Field>
          ) : null}
          <Field label={t.roleLabel} hint={roleHint}>
            <Select value={role} onValueChange={(v) => applyRole(v as AdminRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLE_ORDER.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r === "admin" ? t.roleAdmin : r === "supervisor" ? t.roleSupervisor : t.roleViewer}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label={t.permissionsLabel}>
            <div className="space-y-4">
              {PERMISSION_GROUPS.map(({ group, perms }) => (
                <div key={group}>
                  <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">{group}</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {perms
                      .filter((p) => (ALL_ADMIN_PERMISSIONS as readonly string[]).includes(p))
                      .map((p) => (
                        <label key={p} className="flex cursor-pointer items-center gap-2 text-sm">
                          <Checkbox checked={permissions.includes(p)} onCheckedChange={() => toggle(p)} />
                          <span className="font-mono text-xs" dir="ltr">{p}</span>
                        </label>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel}</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending || (!initial && !email.trim())}>
            {t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
