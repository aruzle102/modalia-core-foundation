import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { AdminGate } from "@/components/admin/AdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  AdminCard,
  EmptyState,
  TableSkeleton,
  ConfirmDialog,
  Field,
} from "@/components/admin/ui";
import {
  listPartnerBanners,
  createPartnerBanner,
  updatePartnerBanner,
  deletePartnerBanner,
} from "@/lib/partner-banners.functions";

export const Route = createFileRoute("/admin/partner-banners")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex,nofollow" }, { title: "Partner banners — Modalia Admin" }],
  }),
  component: PartnerBannersPage,
});

function PartnerBannersPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", imageUrl: "", linkUrl: "", sortOrder: 0, isActive: true });

  const { data, isLoading } = useQuery({
    queryKey: ["partner-banners-admin"],
    queryFn: () => listPartnerBanners(),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["partner-banners-admin"] });
    // Invalidate public homepage banner cache too
    queryClient.invalidateQueries({ queryKey: ["partner-banners"] });
  };

  const save = useMutation({
    mutationFn: () =>
      editing && editing !== "new"
        ? updatePartnerBanner({ data: { id: editing, ...form } })
        : createPartnerBanner({ data: form }),
    onSuccess: () => {
      toast.success("Saved");
      setEditing(null);
      setForm({ title: "", imageUrl: "", linkUrl: "", sortOrder: 0, isActive: true });
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deletePartnerBanner({ data: { id } }),
    onSuccess: () => {
      toast.success("Deleted");
      setDeleting(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (b: { id: string; title: string; imageUrl: string; linkUrl: string; sortOrder: number; isActive: boolean } | null) => {
    if (b) {
      setEditing(b.id);
      setForm({ title: b.title, imageUrl: b.imageUrl, linkUrl: b.linkUrl, sortOrder: b.sortOrder, isActive: b.isActive });
    } else {
      setEditing("new");
      setForm({ title: "", imageUrl: "", linkUrl: "", sortOrder: 0, isActive: true });
    }
  };

  return (
    <AdminGate>
      <AdminShell
        title="Partner banners"
        subtitle="Rotating ads at the top of the homepage"
        actions={
          <Button size="sm" onClick={() => startEdit(null)}>
            <Plus className="mr-1 h-4 w-4" /> Add banner
          </Button>
        }
      >
        <AdminCard>
          {isLoading ? (
            <TableSkeleton />
          ) : !data || data.length === 0 ? (
            <EmptyState
              icon={<ImagePlus className="h-8 w-8" />}
              title="No banners"
              text="Add partner banners to show rotating ads on the homepage."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {data.map((b) => (
                <div key={b.id} className={`overflow-hidden rounded-lg border ${b.isActive ? "" : "opacity-50"}`}>
                  <img src={b.imageUrl} alt={b.title} className="h-28 w-full object-cover" />
                  <div className="p-3">
                    <p className="font-medium">{b.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{b.linkUrl}</p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => startEdit(b)}>
                        <Pencil className="mr-1 h-3 w-3" /> Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => setDeleting(b.id)}>
                        <Trash2 className="mr-1 h-3 w-3" /> Delete
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </AdminCard>

        {editing !== null ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
            <div className="w-full max-w-md rounded-lg bg-background p-6">
              <h3 className="mb-4 text-lg font-semibold">{editing === "new" ? "Add banner" : "Edit banner"}</h3>
              <div className="space-y-3">
                <Field label="Title">
                  <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
                </Field>
                <Field label="Image URL">
                  <Input value={form.imageUrl} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} placeholder="https://" />
                </Field>
                <Field label="Link URL">
                  <Input value={form.linkUrl} onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))} placeholder="https:// or /path" />
                </Field>
                <Field label="Sort order">
                  <Input
                    type="number"
                    value={form.sortOrder}
                    onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))}
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={form.isActive} onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))} />
                  Active
                </label>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                <Button onClick={() => save.mutate()} disabled={save.isPending}>Save</Button>
              </div>
            </div>
          </div>
        ) : null}

        <ConfirmDialog
          open={deleting !== null}
          onOpenChange={(o) => !o && setDeleting(null)}
          title="Delete banner?"
          confirmLabel="Delete"
          danger
          onConfirm={() => deleting && remove.mutate(deleting)}
        />
      </AdminShell>
    </AdminGate>
  );
}
