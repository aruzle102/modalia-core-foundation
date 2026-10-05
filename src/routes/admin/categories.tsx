import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  listAdminCategories,
  upsertCategory,
  deleteCategory,
  reorderCategories,
  type CategoryNode,
  type CategoryRow,
} from "@/lib/admin-catalog.functions";
import { strParam, useUrlState } from "@/hooks/use-url-state";
import { errMsg, pickName } from "./_shared";

export const Route = createFileRoute("/admin/categories")({
  validateSearch: (search: Record<string, unknown>) => ({
    create: strParam(search["create"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: AdminCategoriesPage,
});

type FlatCategory = CategoryRow;

function AdminCategoriesPage() {
  return (
    <AdminGate>
      <AdminShell title="Categories" subtitle="Manage the catalog taxonomy: tree, slugs and display order.">
        <CategoriesManager />
      </AdminShell>
    </AdminGate>
  );
}

function CategoriesManager() {
  const queryClient = useQueryClient();
  const url = useUrlState();
  const [editing, setEditing] = useState<FlatCategory | null | "new">(null);
  const [deleting, setDeleting] = useState<FlatCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [orders, setOrders] = useState<Record<string, number>>({});

  // Deep link: /admin/categories?create=category opens the new-category dialog.
  useEffect(() => {
    if (strParam(url.search["create"]) === "category") setEditing("new");
  }, [url.search["create"]]);

  const categoriesQuery = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => listAdminCategories(),
    retry: false,
  });
  const invalidate = () => {
    setOrders({});
    queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
  };

  const del = useMutation({
    mutationFn: (id: string) => deleteCategory({ data: { id } }),
    onSuccess: () => {
      toast.success("Category deleted.");
      setDeleting(null);
      setDeleteError(null);
      invalidate();
    },
    onError: (e) => setDeleteError(errMsg(e)),
  });

  const reorder = useMutation({
    mutationFn: (payload: { id: string; sort_order: number; parent_id: string | null }[]) =>
      reorderCategories({ data: { orders: payload } }),
    onSuccess: () => {
      toast.success("Order saved.");
      invalidate();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const tree = categoriesQuery.data?.tree ?? [];
  const flat = categoriesQuery.data?.flat ?? [];

  const handleSaveOrder = () => {
    const payload = flat.map((c) => ({
      id: c.id as string,
      sort_order: orders[c.id] ?? Number(c.sort_order),
      parent_id: (c.parent_id as string | null) ?? null,
    }));
    reorder.mutate(payload);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-small text-muted-foreground">
          {flat.length} categor{flat.length === 1 ? "y" : "ies"}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveOrder} disabled={reorder.isPending}>
            {reorder.isPending ? "Saving…" : "Save display order"}
          </Button>
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4" /> New category
          </Button>
        </div>
      </div>

      <AdminCard title="Category tree">
        {categoriesQuery.isPending ? (
          <TableSkeleton />
        ) : categoriesQuery.isError ? (
          <EmptyState title="Could not load categories" text={errMsg(categoriesQuery.error)} />
        ) : tree.length === 0 ? (
          <EmptyState title="No categories" text="Create the first category to organize the catalog." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-small">
              <thead>
                <tr className="border-b border-border text-caption text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Slug</th>
                  <th className="px-3 py-2 font-medium">Sort order</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {flattenTree(tree).map(({ node, depth }) => (
                  <tr key={node.id}>
                    <td className="px-3 py-3" style={{ paddingInlineStart: `${0.75 + depth * 1.5}rem` }}>
                      <p className="font-medium">{pickName(node.name) || node.slug}</p>
                      <p className="text-caption text-muted-foreground">
                        {pickNameFrEnAr(node.name)}
                      </p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{node.slug}</td>
                    <td className="px-3 py-3">
                      <Input
                        type="number"
                        min={0}
                        className="w-20"
                        value={orders[node.id] ?? Number(node.sort_order)}
                        onChange={(e) =>
                          setOrders((prev) => ({ ...prev, [node.id]: Number(e.target.value) || 0 }))
                        }
                      />
                    </td>
                    <td className="px-3 py-3"><StatusPill status={node.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex justify-end gap-1.5">
                        <Button size="sm" variant="ghost" onClick={() => setEditing(node)}>
                          <Pencil className="size-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            setDeleteError(null);
                            setDeleting(node);
                          }}
                        >
                          <Trash2 className="size-3.5" /> Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-caption text-muted-foreground">
          Adjust the sort order numbers, then press “Save display order”. Parents and children are ordered by sort_order.
        </p>
      </AdminCard>

      {editing !== null ? (
        <CategoryDialog
          key={editing === "new" ? "new" : (editing as FlatCategory).id}
          category={editing === "new" ? null : (editing as FlatCategory)}
          flat={flat}
          onClose={() => {
            setEditing(null);
            url.set({ create: undefined });
          }}
          onSaved={invalidate}
        />
      ) : null}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
        title="Delete category?"
        description={
          deleting
            ? `“${pickName(deleting.name) || deleting.slug}” will be permanently removed. ` +
              "The server blocks this if the category has sub-categories or products."
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={() => deleting && del.mutate(deleting.id)}
      />
      {deleteError ? (
        <p role="alert" className="text-small text-destructive">{deleteError}</p>
      ) : null}
    </div>
  );
}

function flattenTree(tree: CategoryNode[], depth = 0): { node: FlatCategory; depth: number }[] {
  const out: { node: FlatCategory; depth: number }[] = [];
  for (const node of tree) {
    out.push({ node, depth });
    out.push(...flattenTree(node.children ?? [], depth + 1));
  }
  return out;
}

function pickNameFrEnAr(name: unknown): string {
  if (!name || typeof name !== "object") return "";
  const n = name as Record<string, unknown>;
  const parts = ["fr", "en", "ar"]
    .map((k) => (typeof n[k] === "string" ? (n[k] as string).trim() : ""))
    .filter(Boolean);
  return parts.join(" · ");
}

function CategoryDialog({
  category,
  flat,
  onClose,
  onSaved,
}: {
  category: FlatCategory | null;
  flat: FlatCategory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [slug, setSlug] = useState(category?.slug ?? "");
  const nameMap = (category?.name ?? {}) as { fr?: unknown; en?: unknown; ar?: unknown };
  const [nameFr, setNameFr] = useState(String(nameMap.fr ?? ""));
  const [nameEn, setNameEn] = useState(String(nameMap.en ?? ""));
  const [nameAr, setNameAr] = useState(String(nameMap.ar ?? ""));
  const [parentId, setParentId] = useState<string>(category?.parent_id ?? "none");
  const [status, setStatus] = useState<string>(category?.status ?? "active");
  const [sortOrder, setSortOrder] = useState(String(category?.sort_order ?? 0));
  const [serverError, setServerError] = useState<string | null>(null);

  const eligibleParents = flat.filter((c) => !category || c.id !== category.id);
  const nameError = !nameFr.trim() && !nameEn.trim() && !nameAr.trim() ? "At least one name is required." : null;
  const slugError =
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug.trim()) ? "Lowercase letters, digits and hyphens only." : null;

  const save = useMutation({
    mutationFn: () =>
      upsertCategory({
        data: {
          id: category?.id,
          parent_id: parentId === "none" ? null : parentId,
          slug: slug.trim(),
          name: { fr: nameFr.trim(), en: nameEn.trim(), ar: nameAr.trim() },
          status: status as "active" | "inactive",
          sort_order: Number(sortOrder) || 0,
        },
      }),
    onSuccess: () => {
      toast.success(category ? "Category updated." : "Category created.");
      onSaved();
      onClose();
    },
    onError: (e) => setServerError(errMsg(e)),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Edit category" : "New category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Slug" error={slugError ?? undefined} hint="URL-safe identifier, unique across categories.">
            <Input dir="ltr" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="electronics" />
          </Field>
          <Field label="Name (French)" error={nameError ?? undefined}>
            <Input value={nameFr} onChange={(e) => setNameFr(e.target.value)} placeholder="Électronique" />
          </Field>
          <Field label="Name (English)">
            <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Electronics" />
          </Field>
          <Field label="Name (Arabic)">
            <Input dir="rtl" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="إلكترونيات" />
          </Field>
          <Field label="Parent category">
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger><SelectValue placeholder="None (top level)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None (top level)</SelectItem>
                {eligibleParents.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.parent_id ? "— " : ""}{pickName(c.name) || c.slug}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Field label="Sort order">
              <Input type="number" min={0} value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </Field>
          </div>
          {serverError ? (
            <p role="alert" className="text-small text-destructive">{serverError}</p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              setServerError(null);
              if (nameError || slugError) return;
              save.mutate();
            }}
            disabled={save.isPending}
          >
            {save.isPending ? "Saving…" : "Save category"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
