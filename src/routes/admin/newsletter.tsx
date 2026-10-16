import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Plus, Send, Eye, Users, Mail } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { SuperAdminGate } from "@/components/admin/SuperAdminGate";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminCard, TableSkeleton, Field, ConfirmDialog } from "@/components/admin/ui";
import { DataTable, EmptyState } from "@/components/dashboard";
import { useAdminLocale } from "@/components/admin/useAdminLocale";
import { getTranslations } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  listNewsletterSubscribers,
  listNewsletterCampaigns,
  createNewsletterCampaign,
  sendNewsletterTest,
  sendNewsletterCampaign,
} from "@/lib/newsletter.functions";
import { buildNewsletterHtml } from "@/lib/newsletter-template";
import { errMsg, Pager } from "./_shared";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/newsletter")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: strParam(search["tab"]) || "campaigns",
    page: numParam(search["page"], 1),
    q: strParam(search["q"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: NewsletterPage,
});

function NewsletterPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  const search = Route.useSearch();
  const url = useUrlState({ tab: "campaigns", page: 1, q: "" });
  const tab = search.tab || "campaigns";

  return (
    <AdminGate>
      <SuperAdminGate>
        <AdminShell
          title="Newsletter & Campaigns"
          subtitle="Manage subscribers and email campaigns."
          breadcrumbs={[{ label: nav.newsletter ?? "Newsletter" }]}
        >
          <div className="mb-6 flex gap-2">
            <Button
              variant={tab === "campaigns" ? "default" : "outline"}
              size="sm"
              onClick={() => url.set({ tab: "campaigns", page: 1 })}
            >
              <Mail className="me-1.5 h-4 w-4" /> Campaigns
            </Button>
            <Button
              variant={tab === "subscribers" ? "default" : "outline"}
              size="sm"
              onClick={() => url.set({ tab: "subscribers", page: 1 })}
            >
              <Users className="me-1.5 h-4 w-4" /> Subscribers
            </Button>
          </div>

          {tab === "campaigns" && <CampaignsTab />}
          {tab === "subscribers" && <SubscribersTab />}
        </AdminShell>
      </SuperAdminGate>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
// Campaigns
// ---------------------------------------------------------------------------

function CampaignsTab() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [htmlContent, setHtmlContent] = useState("");
  const [locale, setLocale] = useState<"ar" | "fr" | "en">("fr");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState("");
  const [sendId, setSendId] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ["newsletter-campaigns"],
    queryFn: () => listNewsletterCampaigns(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createNewsletterCampaign({
        data: { name, subject, previewText, htmlContent, locale },
      }),
    onSuccess: () => {
      toast.success("Campaign created.");
      setShowCreate(false);
      setName(""); setSubject(""); setPreviewText(""); setHtmlContent("");
      queryClient.invalidateQueries({ queryKey: ["newsletter-campaigns"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => sendNewsletterTest({ data: { id, to: testEmail } }),
    onSuccess: () => toast.success("Test email sent."),
    onError: (e) => toast.error(errMsg(e)),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => sendNewsletterCampaign({ data: { id } }),
    onSuccess: (r) => {
      toast.success(`Sent to ${r.sent} subscribers (${r.failed} failed).`);
      setSendId(null);
      queryClient.invalidateQueries({ queryKey: ["newsletter-campaigns"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const previewCampaign = campaigns.find((c: any) => c.id === previewId);

  return (
    <>
      <AdminCard
        title={`Campaigns (${campaigns.length})`}
        actions={
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="me-1.5 h-4 w-4" /> New Campaign
          </Button>
        }
      >
        {campaignsQuery.isPending ? (
          <TableSkeleton />
        ) : campaigns.length === 0 ? (
          <EmptyState title="No campaigns" description="Create your first newsletter campaign." />
        ) : (
          <DataTable>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-start">Name</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-4 py-3 text-start">Sent</th>
                  <th className="px-4 py-3 text-start">Actions</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c: any) => (
                  <tr key={c.id} className="border-b">
                    <td className="px-4 py-3">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.subject}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">{c.status}</span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {c.sent_count}/{c.recipient_count}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => setPreviewId(c.id)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        {c.status === "draft" && (
                          <Button size="sm" variant="outline" onClick={() => setSendId(c.id)}>
                            <Send className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
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
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Field label="Campaign name"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Subject"><Input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
            <Field label="Preview text"><Input value={previewText} onChange={(e) => setPreviewText(e.target.value)} /></Field>
            <Field label="Language">
              <Select value={locale} onValueChange={(v) => setLocale(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ar">العربية</SelectItem>
                  <SelectItem value="fr">Français</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Content (HTML)">
              <Textarea value={htmlContent} onChange={(e) => setHtmlContent(e.target.value)} rows={8} className="font-mono text-sm" dir="ltr" />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createMutation.mutate()} disabled={!name || !subject || !htmlContent || createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewId} onOpenChange={(o) => !o && setPreviewId(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Email Preview</DialogTitle></DialogHeader>
          {previewCampaign && (
            <div>
              <div className="mb-4 flex gap-2">
                <Input placeholder="Test email..." value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1" dir="ltr" />
                <Button size="sm" onClick={() => testMutation.mutate(previewCampaign.id)} disabled={!testEmail || testMutation.isPending}>
                  {testMutation.isPending ? "Sending..." : "Send Test"}
                </Button>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <iframe
                  title="preview"
                  className="w-full"
                  style={{ height: "500px", border: "none" }}
                  srcDoc={buildNewsletterHtml({
                    title: previewCampaign.name,
                    previewText: previewCampaign.subject,
                    contentHtml: "<p>Preview content...</p>",
                    locale: previewCampaign.locale,
                    unsubscribeUrl: "#",
                    siteUrl: "https://modalia-core-foundation.lovable.app",
                    logoUrl: "https://modalia-core-foundation.lovable.app/brand/modalia-logo.png",
                  })}
                />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Send confirm */}
      <ConfirmDialog
        open={!!sendId}
        onOpenChange={(o) => !o && setSendId(null)}
        title="Send campaign?"
        description="This will send to ALL active subscribers. This cannot be undone."
        confirmLabel={sendMutation.isPending ? "Sending..." : "Send to All"}
        onConfirm={() => sendId && sendMutation.mutate(sendId)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Subscribers
// ---------------------------------------------------------------------------

function SubscribersTab() {
  const search = Route.useSearch();
  const url = useUrlState({ tab: "subscribers", page: 1, q: "" });
  const page = search.page || 1;
  const q = search.q || "";

  const subsQuery = useQuery({
    queryKey: ["newsletter-subscribers", page, q],
    queryFn: () => listNewsletterSubscribers({ data: { page, pageSize: 25, ...(q ? { query: q } : {}) } }),
  });

  return (
    <AdminCard
      title="Subscribers"
      actions={
        <Input placeholder="Search email..." value={q} onChange={(e) => url.set({ q: e.target.value, page: 1 })} className="w-64" dir="ltr" />
      }
    >
      {subsQuery.isPending ? (
        <TableSkeleton />
      ) : (subsQuery.data?.subscribers ?? []).length === 0 ? (
        <EmptyState title="No subscribers" description="No newsletter subscribers yet." />
      ) : (
        <>
          <DataTable>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-start">Email</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-4 py-3 text-start">Locale</th>
                  <th className="px-4 py-3 text-start">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {(subsQuery.data?.subscribers ?? []).map((s: any) => (
                  <tr key={s.id} className="border-b">
                    <td className="px-4 py-3 text-sm" dir="ltr">{s.email}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">{s.locale.toUpperCase()}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(s.subscribed_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <div className="mt-4">
            <Pager page={page} total={subsQuery.data?.total ?? 0} pageSize={25} onPage={(p) => url.set({ page: p })} />
          </div>
        </>
      )}
    </AdminCard>
  );
}
