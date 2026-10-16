import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, Ban, Mail } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  TableSkeleton,
  Field,
  ConfirmDialog,
} from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
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
  createAdminInvitation,
  listAdminInvitations,
  revokeAdminInvitation,
} from "@/lib/admin-invitations.functions";
import { sendEmail } from "@/lib/email.functions";
import { ALL_ADMIN_PERMISSIONS, type AdminRole } from "@/lib/admin-permissions";
import { errMsg } from "./_shared";

export const Route = createFileRoute("/admin/invitations")({
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: InvitationsPage,
});

const ROLE_ORDER: AdminRole[] = ["admin", "supervisor", "viewer"];

function InvitationsPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("viewer");
  const [permissions, setPermissions] = useState<string[]>([]);
  const [revokeId, setRevokeId] = useState<string | null>(null);
  const [lastToken, setLastToken] = useState<string | null>(null);

  const invitationsQuery = useQuery({
    queryKey: ["admin-invitations"],
    queryFn: () => listAdminInvitations(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminInvitation({
        data: { email: email.trim(), role, permissions },
      }),
    onSuccess: async (result) => {
      // Send invitation email with the token link
      const appUrl = window.location.origin;
      const invitationLink = `${appUrl}/invite/${result.token}`;
      try {
        await sendEmail({
          data: {
            to: email.trim(),
            subject: "You are invited to join the Modalia admin team",
            html: `<h2>Hello,</h2><p>You have been invited to join the Modalia admin team as <strong>${role}</strong>.</p><p><a href="${invitationLink}">Click here to accept and set your password</a> (expires in 7 days).</p><p>If you did not expect this, please ignore this email.</p>`,
            variables: { role, invitation_link: invitationLink },
          },
        });
        toast.success("Invitation created and email sent.");
      } catch {
        // Invitation created but email failed — show token for manual sending
        setLastToken(result.token);
        toast.warning("Invitation created but email failed. Copy the link manually.");
      }
      setShowCreate(false);
      setEmail("");
      setPermissions([]);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => revokeAdminInvitation({ data: { id } }),
    onSuccess: () => {
      toast.success("Invitation revoked.");
      setRevokeId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-invitations"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const togglePermission = (perm: string) => {
    setPermissions((p) =>
      p.includes(perm) ? p.filter((x) => x !== perm) : [...p, perm]
    );
  };

  const invitations = invitationsQuery.data?.invitations ?? [];

  return (
    <AdminGate>
      <SuperAdminGate>
        <AdminShell
          title="Admin Invitations"
          subtitle="Invite team members with secure, expiring, single-use links."
          breadcrumbs={[{ label: nav.team ?? "Team" }, { label: "Invitations" }]}
          actions={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <UserPlus className="me-1.5 h-4 w-4" /> Invite Admin
            </Button>
          }
        >
          {lastToken && (
            <AdminCard title="Manual Invitation Link" className="mb-6 border-amber-500">
              <p className="mb-2 text-sm text-muted-foreground">
                Email delivery failed. Copy this link and send it manually:
              </p>
              <div className="flex gap-2">
                <Input
                  value={`${window.location.origin}/invite/${lastToken}`}
                  readOnly
                  dir="ltr"
                  className="font-mono text-xs"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/invite/${lastToken}`
                    );
                    toast.success("Copied.");
                  }}
                >
                  Copy
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setLastToken(null)}>
                  Dismiss
                </Button>
              </div>
            </AdminCard>
          )}

          <AdminCard title={`Invitations (${invitations.length})`}>
            {invitationsQuery.isPending ? (
              <TableSkeleton />
            ) : invitationsQuery.isError ? (
              <p className="text-destructive">{errMsg(invitationsQuery.error)}</p>
            ) : invitations.length === 0 ? (
              <EmptyState
                title="No invitations"
                description="No admin invitations have been sent yet."
              />
            ) : (
              <DataTable>
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="px-4 py-3 text-start">Email</th>
                      <th className="px-4 py-3 text-start">Role</th>
                      <th className="px-4 py-3 text-start">Status</th>
                      <th className="px-4 py-3 text-start">Expires</th>
                      <th className="px-4 py-3 text-start">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invitations.map((inv: any) => (
                      <tr key={inv.id} className="border-b">
                        <td className="px-4 py-3 text-sm" dir="ltr">{inv.email}</td>
                        <td className="px-4 py-3 text-sm capitalize">{inv.role}</td>
                        <td className="px-4 py-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            inv.status === "accepted"
                              ? "bg-green-100 text-green-800"
                              : inv.status === "pending"
                                ? "bg-yellow-100 text-yellow-800"
                                : "bg-gray-100 text-gray-600"
                          }`}>
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {new Date(inv.expires_at).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          {inv.status === "pending" ? (
                            <Button size="sm" variant="outline" onClick={() => setRevokeId(inv.id)}>
                              <Ban className="me-1 h-3 w-3" /> Revoke
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </DataTable>
            )}
          </AdminCard>

          {/* Create dialog */}
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Invite Admin</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <Field label="Email address">
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    dir="ltr"
                  />
                </Field>
                <Field label="Role">
                  <Select value={role} onValueChange={(v) => setRole(v as AdminRole)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLE_ORDER.map((r) => (
                        <SelectItem key={r} value={r} className="capitalize">
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Granular permissions">
                  <div className="grid max-h-48 grid-cols-2 gap-1 overflow-y-auto rounded-lg border p-3">
                    {ALL_ADMIN_PERMISSIONS.map((perm) => (
                      <label key={perm} className="flex items-center gap-2 text-xs">
                        <Checkbox
                          checked={permissions.includes(perm)}
                          onCheckedChange={() => togglePermission(perm)}
                        />
                        <span className="font-mono">{perm}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createMutation.mutate()}
                  disabled={!email || createMutation.isPending}
                >
                  <Mail className="me-1.5 h-4 w-4" />
                  {createMutation.isPending ? "Sending..." : "Send Invitation"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <ConfirmDialog
            open={!!revokeId}
            onOpenChange={(o) => !o && setRevokeId(null)}
            title="Revoke invitation?"
            description="The invitation link will stop working immediately."
            confirmLabel="Revoke"
            onConfirm={() => revokeId && revokeMutation.mutate(revokeId)}
          />
        </AdminShell>
      </SuperAdminGate>
    </AdminGate>
  );
}
