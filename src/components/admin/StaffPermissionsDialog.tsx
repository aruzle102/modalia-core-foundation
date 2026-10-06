import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/admin/ui";
import {
  updateStaffPermissions,
  WIZARD_STAFF_PERMISSIONS,
  type WizardPermissionGroup,
} from "@/lib/admin-sellers.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { errMsg } from "@/routes/admin/_shared";

const PERMISSION_GROUP_ORDER: WizardPermissionGroup[] = [
  "products",
  "orders",
  "marketing",
  "customers",
  "store",
  "team",
  "reports",
  "support",
];

export type StaffPermissionsInitial = {
  id: string;
  title: string | null;
  permissions: string[];
  active: boolean;
};

/**
 * Admin dialog to view and update a seller staff member's permissions and
 * active flag after provisioning (registry #230). Permission keys and labels
 * are the same real set used by the provisioning wizard.
 */
export function StaffPermissionsDialog({
  staff,
  onClose,
  onSaved,
}: {
  staff: StaffPermissionsInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useAdminT();
  const p = t.sellers.profile;
  const wizard = t.sellers.sellerWizard;
  const [permissions, setPermissions] = useState<string[]>(staff.permissions ?? []);
  const [active, setActive] = useState(staff.active);

  const mutation = useMutation({
    mutationFn: () =>
      updateStaffPermissions({
        data: { staffId: staff.id, permissions, active },
      }),
    onSuccess: () => {
      toast.success(p.staffPermsUpdated);
      onSaved();
      onClose();
    },
    onError: (error) => toast.error(errMsg(error) || p.staffPermsError),
  });

  const toggle = (key: string) =>
    setPermissions((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {p.staffPermsTitle}
            {staff.title ? ` — ${staff.title}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={p.staffPermsActive}>
            <Switch checked={active} onCheckedChange={setActive} />
          </Field>
          {PERMISSION_GROUP_ORDER.map((group) => {
            const perms = WIZARD_STAFF_PERMISSIONS.filter((perm) => perm.group === group);
            if (!perms.length) return null;
            return (
              <div key={group}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {(wizard.permissionGroups as Record<string, string>)[group]}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {perms.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <Checkbox
                        checked={permissions.includes(perm.key)}
                        onCheckedChange={() => toggle(perm.key)}
                      />
                      <span dir="ltr">
                        {(wizard.permissionLabels as Record<string, string>)[perm.key]}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
          {permissions.length === 0 ? (
            <p className="text-sm text-destructive">{p.staffPermsPickOne}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {p.staffPermsCancel}
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || permissions.length === 0}
          >
            {mutation.isPending ? "…" : p.staffPermsSave}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
