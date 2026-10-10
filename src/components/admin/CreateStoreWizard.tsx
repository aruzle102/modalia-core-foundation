import { useState } from "react";
import { Check, Copy, Loader2, Store } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { createStoreWithCredentials, type CreateStoreResult } from "@/lib/seller-onboarding.functions";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: () => void;
};

const COMMISSION_OPTIONS = [
  { value: "0.05", label: "5%" },
  { value: "0.10", label: "10%" },
  { value: "0.15", label: "15%" },
  { value: "0.20", label: "20%" },
  { value: "custom", label: "Custom…" },
];

/**
 * Simplified "Create Store" wizard for admins.
 * One modal: pick commission → Generate → shows temp credentials to hand to the merchant.
 * The merchant completes onboarding (personal/store info) on first login.
 */
export function CreateStoreWizard({ open, onOpenChange, onCreated }: Props) {
  const [commissionChoice, setCommissionChoice] = useState("0.10");
  const [customRate, setCustomRate] = useState("12");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreateStoreResult | null>(null);
  const [copied, setCopied] = useState<"user" | "pass" | null>(null);

  const reset = () => {
    setCommissionChoice("0.10");
    setCustomRate("12");
    setLoading(false);
    setError("");
    setResult(null);
    setCopied(null);
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const effectiveRate = (): number => {
    if (commissionChoice === "custom") {
      const v = Number(customRate);
      if (!Number.isFinite(v) || v < 0 || v > 100) return NaN;
      return v / 100;
    }
    return Number(commissionChoice);
  };

  const handleGenerate = async () => {
    setError("");
    const rate = effectiveRate();
    if (!Number.isFinite(rate) || rate < 0 || rate > 1) {
      setError("Please enter a valid commission rate between 0 and 100.");
      return;
    }
    setLoading(true);
    try {
      const res = await createStoreWithCredentials({ data: { commissionRate: rate } });
      setResult(res);
      onCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create store.");
    } finally {
      setLoading(false);
    }
  };

  const copyText = async (text: string, which: "user" | "pass") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard unavailable — user can select manually
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Store className="size-5" aria-hidden />
            Create Store
          </DialogTitle>
          <DialogDescription>
            {result
              ? "Store created. Share these credentials with the merchant."
              : "Generate a new seller store with login credentials for the merchant."}
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="commission">Commission rate</Label>
              <Select value={commissionChoice} onValueChange={setCommissionChoice}>
                <SelectTrigger id="commission">
                  <SelectValue placeholder="Select commission" />
                </SelectTrigger>
                <SelectContent>
                  {COMMISSION_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {commissionChoice === "custom" ? (
              <div className="space-y-2">
                <Label htmlFor="custom-rate">Custom rate (%)</Label>
                <Input
                  id="custom-rate"
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                />
              </div>
            ) : null}

            {error ? (
              <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </p>
            ) : null}

            <Button className="w-full" onClick={handleGenerate} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                  Generating…
                </>
              ) : (
                "Generate store + credentials"
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              Creates the seller record, store, and login identity. The merchant will complete
              their profile on first login.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Username
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="text-base font-semibold">{result.username}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyText(result.username, "user")}
                  aria-label="Copy username"
                >
                  {copied === "user" ? (
                    <Check className="size-4 text-green-600" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-muted/50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Temporary password
              </p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="text-base font-semibold">{result.tempPassword}</code>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => copyText(result.tempPassword, "pass")}
                  aria-label="Copy password"
                >
                  {copied === "pass" ? (
                    <Check className="size-4 text-green-600" aria-hidden />
                  ) : (
                    <Copy className="size-4" aria-hidden />
                  )}
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Store slug: <code>{result.storeSlug}</code> · Commission:{" "}
              {commissionChoice === "custom" ? `${customRate}%` : COMMISSION_OPTIONS.find((o) => o.value === commissionChoice)?.label}
            </p>
            <Button className="w-full" onClick={() => handleClose(false)}>
              Done
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
