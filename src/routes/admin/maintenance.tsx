import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, TableSkeleton, Field } from "@/components/admin/ui";
import { getMaintenanceSettings, updateMaintenanceSettings } from "@/lib/maintenance.functions";
import { getLocale } from "@/lib/i18n";

export const Route = createFileRoute("/admin/maintenance")({
  validateSearch: (search: Record<string, unknown>) => ({
    locale: getLocale(typeof search["locale"] === "string" ? search["locale"] : undefined),
  }),
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Maintenance — Modalia Admin" }],
  }),
  component: MaintenancePage,
});

function MaintenancePage() {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const { data, isPending } = useQuery({
    queryKey: ["admin-maintenance-settings"],
    queryFn: () => getMaintenanceSettings(),
    retry: false,
  });

  useEffect(() => {
    if (data && !hydrated) {
      setEnabled(data.enabled);
      setTitle(data.title);
      setMessage(data.message);
      setHydrated(true);
    }
  }, [data, hydrated]);

  const save = useMutation({
    mutationFn: () => updateMaintenanceSettings({ data: { enabled, title: title.trim(), message: message.trim() } }),
    onSuccess: () => {
      toast.success("Maintenance settings saved");
      void queryClient.invalidateQueries({ queryKey: ["admin-maintenance-settings"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not save settings"),
  });

  return (
    <AdminGate>
      <SuperAdminGate>
        <AdminShell title="Maintenance mode" subtitle="Take the public storefront offline for maintenance">
          <AdminCard
            title="Storefront status"
            subtitle="Admin, seller and sign-in routes always stay accessible — only the public storefront is affected."
          >
            {isPending ? (
              <TableSkeleton />
            ) : (
              <div className="max-w-xl space-y-5">
                <label className="flex items-center justify-between gap-4 rounded-lg border p-4">
                  <span>
                    <span className="block text-sm font-semibold">Maintenance mode</span>
                    <span className="block text-xs text-muted-foreground">
                      {enabled
                        ? "ON — visitors see the maintenance page."
                        : "OFF — the storefront is live."}
                    </span>
                  </span>
                  <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Maintenance mode" />
                </label>

                <Field label="Title" hint="Shown on the maintenance page.">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
                </Field>

                <Field label="Message" hint="Shown under the title. Keep it short and reassuring.">
                  <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} maxLength={500} />
                </Field>

                <div className="flex items-center gap-3">
                  <Button onClick={() => save.mutate()} disabled={save.isPending || !title.trim() || !message.trim()}>
                    {save.isPending ? "Saving…" : "Save"}
                  </Button>
                  {enabled ? (
                    <p className="flex items-center gap-2 text-sm text-amber-600">
                      <Wrench className="h-4 w-4" /> The storefront is currently in maintenance mode.
                    </p>
                  ) : null}
                </div>
              </div>
            )}
          </AdminCard>
        </AdminShell>
      </SuperAdminGate>
    </AdminGate>
  );
}
