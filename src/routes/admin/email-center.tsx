import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, Send, History, FileText, Eye } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
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
import { Label } from "@/components/ui/label";
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
  listEmailTemplates,
  getEmailTemplate,
  sendEmail,
  listEmailHistory,
  renderTemplate,
} from "@/lib/email.functions";
import { errMsg, Pager } from "./_shared";
import { numParam, strParam, useUrlState } from "@/hooks/use-url-state";

export const Route = createFileRoute("/admin/email-center")({
  validateSearch: (search: Record<string, unknown>) => ({
    tab: strParam(search["tab"]) || "compose",
    page: numParam(search["page"], 1),
    q: strParam(search["q"]),
  }),
  head: () => ({ meta: [{ name: "robots", content: "noindex,nofollow" }] }),
  component: EmailCenterPage,
});

function EmailCenterPage() {
  const locale = useAdminLocale();
  const nav = getTranslations(locale).adminNav.items;
  const search = Route.useSearch();
  const url = useUrlState({ tab: "compose", page: 1, q: "" });
  const tab = search.tab || "compose";

  return (
    <AdminGate>
      <AdminShell
        title="Email Center"
        subtitle="Send emails via Resend, manage templates, view delivery history."
        breadcrumbs={[{ label: nav.emailCenter ?? "Email Center" }]}
      >
        <div className="mb-6 flex gap-2">
          <Button
            variant={tab === "compose" ? "default" : "outline"}
            size="sm"
            onClick={() => url.set({ tab: "compose", page: 1 })}
          >
            <Send className="me-1.5 h-4 w-4" /> Compose
          </Button>
          <Button
            variant={tab === "templates" ? "default" : "outline"}
            size="sm"
            onClick={() => url.set({ tab: "templates", page: 1 })}
          >
            <FileText className="me-1.5 h-4 w-4" /> Templates
          </Button>
          <Button
            variant={tab === "history" ? "default" : "outline"}
            size="sm"
            onClick={() => url.set({ tab: "history", page: 1 })}
          >
            <History className="me-1.5 h-4 w-4" /> History
          </Button>
        </div>

        {tab === "compose" && <ComposeTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "history" && <HistoryTab />}
      </AdminShell>
    </AdminGate>
  );
}

// ---------------------------------------------------------------------------
// Compose tab
// ---------------------------------------------------------------------------

function ComposeTab() {
  const queryClient = useQueryClient();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [html, setHtml] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [variables, setVariables] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listEmailTemplates(),
  });

  const loadTemplate = async (id: string) => {
    if (!id) return;
    try {
      const { template } = await getEmailTemplate({ data: { id } });
      setTemplateId(id);
      setSubject(template.subject);
      setHtml(template.html_body);
      const vars: Record<string, string> = {};
      for (const v of template.variables ?? []) vars[v] = "";
      setVariables(vars);
      toast.success("Template loaded.");
    } catch (e) {
      toast.error(errMsg(e));
    }
  };

  const renderedHtml = renderTemplate(html, variables);
  const renderedSubject = renderTemplate(subject, variables);

  const sendMutation = useMutation({
    mutationFn: () =>
      sendEmail({
        data: {
          to: to.trim(),
          subject: renderedSubject,
          html: renderedHtml,
          ...(templateId ? { templateId } : {}),
          ...(Object.keys(variables).length ? { variables } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Email sent successfully.");
      setShowConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["email-history"] });
      // Clear form
      setTo("");
      setSubject("");
      setHtml("");
      setTemplateId("");
      setVariables({});
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const templates = templatesQuery.data?.templates ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <AdminCard title="Compose Email">
        <div className="space-y-4">
          <Field label="Template (optional)">
            <Select value={templateId} onValueChange={loadTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a template..." />
              </SelectTrigger>
              <SelectContent>
                {templates.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name} ({t.locale.toUpperCase()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="To (recipient email)">
            <Input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="seller@example.com"
              dir="ltr"
            />
          </Field>

          <Field label="Subject">
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject..."
            />
          </Field>

          {Object.keys(variables).length > 0 && (
            <div className="rounded-lg border p-4">
              <p className="mb-3 text-sm font-medium">Template variables</p>
              <div className="space-y-2">
                {Object.keys(variables).map((key) => (
                  <div key={key} className="flex items-center gap-2">
                    <code className="w-32 shrink-0 text-xs text-muted-foreground">
                      {`{{${key}}}`}
                    </code>
                    <Input
                      value={variables[key] ?? ""}
                      onChange={(e) =>
                        setVariables((v) => ({ ...v, [key]: e.target.value }))
                      }
                      placeholder={`Value for ${key}`}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Content (HTML)">
            <Textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              placeholder="<h2>Hello {{seller_name}}</h2><p>...</p>"
              rows={10}
              className="font-mono text-sm"
              dir="ltr"
            />
          </Field>

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowPreview(true)}
              disabled={!html}
            >
              <Eye className="me-1.5 h-4 w-4" /> Preview
            </Button>
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!to || !subject || !html || sendMutation.isPending}
            >
              <Send className="me-1.5 h-4 w-4" />
              {sendMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </div>
        </div>
      </AdminCard>

      <AdminCard title="Live Preview">
        {renderedHtml ? (
          <div>
            <p className="mb-2 text-sm font-medium">Subject: {renderedSubject}</p>
            <div
              className="prose prose-sm max-w-none rounded-lg border p-4"
              dangerouslySetInnerHTML={{ __html: renderedHtml }}
            />
          </div>
        ) : (
          <EmptyState
            title="No content"
            description="Write your email to see a live preview here."
          />
        )}
      </AdminCard>

      {/* Preview dialog */}
      <Dialog open={showPreview} onOpenChange={setShowPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Email Preview</DialogTitle>
          </DialogHeader>
          <p className="text-sm font-medium">To: {to || "(no recipient)"}</p>
          <p className="text-sm font-medium">Subject: {renderedSubject}</p>
          <div
            className="prose prose-sm max-w-none rounded-lg border p-4"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        </DialogContent>
      </Dialog>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title="Send this email?"
        description={`Send to ${to} with subject "${renderedSubject}"?`}
        confirmLabel={sendMutation.isPending ? "Sending..." : "Send"}
        onConfirm={() => sendMutation.mutate()}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Templates tab
// ---------------------------------------------------------------------------

function TemplatesTab() {
  const templatesQuery = useQuery({
    queryKey: ["email-templates"],
    queryFn: () => listEmailTemplates(),
  });

  if (templatesQuery.isPending) return <TableSkeleton />;
  if (templatesQuery.isError)
    return <p className="text-destructive">{errMsg(templatesQuery.error)}</p>;

  const templates = templatesQuery.data?.templates ?? [];

  return (
    <AdminCard title={`Templates (${templates.length})`}>
      {templates.length === 0 ? (
        <EmptyState title="No templates" description="No email templates found." />
      ) : (
        <DataTable
          columns={["Name", "Category", "Locale", "Variables"]}
          rows={templates.map((t) => [
            <div key={t.id}>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted-foreground">{t.slug}</p>
            </div>,
            t.category,
            t.locale.toUpperCase(),
            (t.variables ?? []).join(", ") || "—",
          ])}
        />
      )}
    </AdminCard>
  );
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab() {
  const search = Route.useSearch();
  const url = useUrlState({ tab: "history", page: 1, q: "" });
  const page = search.page || 1;
  const q = search.q || "";

  const historyQuery = useQuery({
    queryKey: ["email-history", page, q],
    queryFn: () => listEmailHistory({ data: { page, pageSize: 25, ...(q ? { q } : {}) } }),
  });

  return (
    <AdminCard
      title="Email History"
      actions={
        <Input
          placeholder="Search by email or subject..."
          value={q}
          onChange={(e) => url.set({ q: e.target.value, page: 1 })}
          className="w-64"
        />
      }
    >
      {historyQuery.isPending ? (
        <TableSkeleton />
      ) : historyQuery.isError ? (
        <p className="text-destructive">{errMsg(historyQuery.error)}</p>
      ) : (historyQuery.data?.logs ?? []).length === 0 ? (
        <EmptyState title="No emails" description="No emails have been sent yet." />
      ) : (
        <>
          <DataTable>
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="px-4 py-3 text-start">To</th>
                  <th className="px-4 py-3 text-start">Subject</th>
                  <th className="px-4 py-3 text-start">Status</th>
                  <th className="px-4 py-3 text-start">Sent At</th>
                </tr>
              </thead>
              <tbody>
                {(historyQuery.data?.logs ?? []).map((log: any) => (
                  <tr key={log.id} className="border-b">
                    <td className="px-4 py-3 text-sm" dir="ltr">{log.to_email}</td>
                    <td className="px-4 py-3 text-sm max-w-48 truncate">{log.subject}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        log.status === "sent" || log.status === "delivered"
                          ? "bg-green-100 text-green-800"
                          : log.status === "failed" || log.status === "bounced"
                            ? "bg-red-100 text-red-800"
                            : "bg-yellow-100 text-yellow-800"
                      }`}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
          <div className="mt-4">
            <Pager
              page={page}
              total={historyQuery.data?.total ?? 0}
              pageSize={25}
              onPage={(p) => url.set({ page: p })}
            />
          </div>
        </>
      )}
    </AdminCard>
  );
}
