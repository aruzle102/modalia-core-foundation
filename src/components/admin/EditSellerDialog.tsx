import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field } from "@/components/admin/ui";
import { updateSellerDetails } from "@/lib/admin-sellers.functions";
import { useAdminT } from "@/components/admin/use-admin-t";
import { errMsg } from "@/routes/admin/_shared";

export type EditSellerInitial = {
  legal_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
};

/** Shared dialog to edit a seller's identity/contact details (list + profile). */
export function EditSellerDialog({
  sellerId,
  initial,
  onClose,
  onSaved,
}: {
  sellerId: string;
  initial: EditSellerInitial;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useAdminT().sellers;
  const [legalName, setLegalName] = useState(initial.legal_name ?? "");
  const [firstName, setFirstName] = useState(initial.first_name ?? "");
  const [lastName, setLastName] = useState(initial.last_name ?? "");
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: () =>
      updateSellerDetails({
        data: {
          sellerId,
          legalName: legalName.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.trim() ? phone.trim() : null,
          email: email.trim() ? email.trim() : null,
        },
      }),
    onSuccess: () => {
      toast.success(t.saved);
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  const phoneError =
    phone.trim() !== "" && !/^\+213[5-7][0-9]{8}$/.test(phone.trim())
      ? "Use an Algerian mobile number, for example +213551234567."
      : null;
  const emailError =
    email.trim() !== "" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
      ? "Enter a valid email address."
      : null;
  const hasError =
    Boolean(phoneError) ||
    Boolean(emailError) ||
    legalName.trim().length < 2 ||
    firstName.trim().length < 1 ||
    lastName.trim().length < 1;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.editDetails}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label={t.legalName}>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} maxLength={160} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t.firstName}>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={100} />
            </Field>
            <Field label={t.lastName}>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={100} />
            </Field>
          </div>
          <Field label={t.phone} error={phoneError ?? undefined} hint="+213…">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              dir="ltr"
              placeholder="+213551234567"
              maxLength={20}
            />
          </Field>
          <Field label={t.email} error={emailError ?? undefined}>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              placeholder="seller@example.com"
              maxLength={255}
            />
          </Field>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t.cancel ?? "Cancel"}</Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (hasError) return;
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "…" : t.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
