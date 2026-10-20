/**
 * Modalia Intelligence — storefront chat drawer.
 *
 * Answers come ONLY from `aiChat` (deterministic, database-powered rules).
 * No external AI provider is ever called in production.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Footprints,
  Gift,
  Loader2,
  RotateCcw,
  SendHorizonal,
  Smartphone,
  TrendingUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { localeDirections, type SupportedLocale, type Translation } from "@/lib/i18n";
import { formatPrice } from "@/lib/i18n/format";
import { aiChat, type AiChatProduct } from "@/lib/ai.functions";
import { getPublicIntelligenceConfig } from "@/lib/intelligence-settings.functions";
import { answerSupportQuestion } from "@/lib/support-knowledge";
import { cn } from "@/lib/utils";
import { ModaliLogo } from "@/components/brand/ModaliaLogo";

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  products: AiChatProduct[];
  source: "rules";
  intentSummary: string | null;
  at: number;
  /**
   * Honest provenance for support answers: the 8 intent answers come from the
   * static confirmed knowledge base (`src/lib/support-knowledge.ts`), not
   * from a database table. The intelligence_settings control plane (toggle,
   * welcome/fallback copy, suggested questions) IS database-backed.
   */
  sourceDetail?: "support-static" | undefined;
};

/** Icons paired by position with the suggested-question chips. */
const SUGGESTION_ICONS = [Smartphone, Footprints, Gift, TrendingUp] as const;

/** Minimal markdown: links [t](url), **bold**, _italic_, bullet lines, paragraphs. */
function renderRichText(text: string, locale: SupportedLocale) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const inline = (segment: string, keyBase: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    // links first, then bold/italic inside plain chunks
    const linkRe = /\[([^\]]+)\]\((\/[^)\s]+)\)/g;
    let last = 0;
    let m: RegExpExecArray | null;
    let k = 0;
    const pushStyled = (chunk: string, key: string) => {
      const sub = chunk.split(/(\*\*[^*]+\*\*|_[^_]+_)/g);
      parts.push(
        <span key={key}>
          {sub.map((s, i) => {
            if (s.startsWith("**") && s.endsWith("**")) return <strong key={i}>{s.slice(2, -2)}</strong>;
            if (s.startsWith("_") && s.endsWith("_")) return <em key={i}>{s.slice(1, -1)}</em>;
            return <span key={i}>{s}</span>;
          })}
        </span>,
      );
    };
    while ((m = linkRe.exec(segment)) !== null) {
      if (m.index > last) pushStyled(segment.slice(last, m.index), `${keyBase}-t${k++}`);
      const rawPath = m[2];
      if (rawPath === undefined) continue;
      if (rawPath.startsWith("/product/")) {
        const slug = rawPath.replace("/product/", "").split("?")[0] ?? "";
        parts.push(
          <Link
            key={`${keyBase}-l${k++}`}
            to="/product/$slug"
            params={{ slug }}
            search={{ locale } as never}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {m[1]}
          </Link>,
        );
      } else {
        // Full path already includes query string (e.g. /shop?locale=fr&category=x)
        parts.push(
          <a
            key={`${keyBase}-l${k++}`}
            href={rawPath}
            className="font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
          >
            {m[1]}
          </a>,
        );
      }
      last = m.index + m[0].length;
    }
    if (last < segment.length) pushStyled(segment.slice(last), `${keyBase}-t${k++}`);
    return parts;
  };

  const flushList = () => {
    if (listItems.length) {
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="mt-2 space-y-1.5">
          {listItems}
        </ul>,
      );
      listItems = [];
    }
  };

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("- ")) {
      listItems.push(<li key={i}>{inline(trimmed.slice(2), `li${i}`)}</li>);
    } else {
      flushList();
      if (trimmed) blocks.push(<p key={i} className={cn(blocks.length > 0 && "mt-2")}>{inline(line, `p${i}`)}</p>);
    }
  });
  flushList();
  return <div className="text-[15px] leading-7">{blocks}</div>;
}

function ProductCard({ product, locale }: { product: AiChatProduct; locale: SupportedLocale }) {
  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      search={{ locale } as never}
      className="group flex items-center gap-3 rounded-2xl border border-border bg-background p-2.5 pe-4 shadow-sm transition-all hover:-translate-y-px hover:border-primary/40 hover:shadow-md"
    >
      {product.imagePath ? (
        <img
          src={product.imagePath}
          alt={product.name}
          className="size-14 shrink-0 rounded-xl object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
          <span className="grid size-9 place-items-center rounded-full bg-foreground"><ModaliLogo variant="light" className="h-4 w-auto" /></span>
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold group-hover:text-primary">{product.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          <span className="text-sm font-bold text-foreground">{formatPrice(product.price, locale)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <span className="ms-1.5 line-through">{formatPrice(product.compareAtPrice, locale)}</span>
          ) : null}
          {product.storeName ? <span className="ms-1.5">· {product.storeName}</span> : null}
        </p>
      </div>
    </Link>
  );
}

/** Assistant avatar: the actual MODALIA logo on a dark chip. */
function AssistantAvatar({ size = "md" }: { size?: "md" | "lg" }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-2xl bg-foreground shadow-sm",
        size === "md" ? "h-8 px-2" : "h-14 px-3.5",
      )}
      aria-hidden="true"
    >
      <ModaliLogo variant="light" className={size === "md" ? "h-3.5 w-auto" : "h-6 w-auto"} />
    </span>
  );
}

/** Polished typing indicator — three bouncing dots, reduced-motion aware. */
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="flex items-start gap-2.5">
        <AssistantAvatar />
        <div
          className="flex items-center gap-1.5 rounded-2xl rounded-ss-md border border-border bg-card px-4 py-3.5 shadow-sm"
          role="status"
          aria-label="…"
        >
          <span className="ai-typing-dot size-2 rounded-full bg-muted-foreground/70" />
          <span className="ai-typing-dot size-2 rounded-full bg-muted-foreground/70" style={{ animationDelay: "0.15s" }} />
          <span className="ai-typing-dot size-2 rounded-full bg-muted-foreground/70" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
}

function formatTime(at: number, locale: SupportedLocale) {
  try {
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(at);
  } catch {
    return "";
  }
}

export function AiAssistantDrawer({
  locale,
  t,
  open,
  onOpenChange,
}: {
  locale: SupportedLocale;
  t: Translation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const idRef = useRef(1);
  const bottomRef = useRef<HTMLDivElement>(null);
  const dir = localeDirections[locale];
  const a = t.assistant;

  // Modalia Intelligence control plane: support toggle + trilingual copy.
  const intelQuery = useQuery({
    queryKey: ["intelligence-config", locale],
    queryFn: () => getPublicIntelligenceConfig({ data: { locale } }),
    staleTime: 60_000,
    retry: false,
  });
  const intel = intelQuery.data;
  const supportEnabled = intel?.support_enabled ?? true;

  const chat = useMutation({
    mutationFn: (message: string) =>
      aiChat({
        data: {
          message,
          locale,
          history: messages.slice(-6).map((m) => ({ role: m.role, content: m.text.slice(0, 1500) })),
        },
      }),
    onSuccess: (result) => {
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current++,
          role: "assistant",
          text: result.text,
          products: result.products,
          source: result.source,
          intentSummary: result.intentSummary,
          at: Date.now(),
          sourceDetail: undefined,
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current++,
          role: "assistant",
          text: a.error,
          products: [],
          source: "rules",
          intentSummary: null,
          at: Date.now(),
          sourceDetail: undefined,
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, chat.isPending]);

  const newChat = () => {
    setMessages([]);
    setInput("");
  };

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: idRef.current++, role: "user", text: message, products: [], source: "rules", intentSummary: null, at: Date.now(), sourceDetail: undefined },
    ]);
    setInput("");

    // Support knowledge first: when enabled and the question matches a
    // confirmed support intent, answer deterministically from the knowledge
    // base instead of searching the catalog.
    if (supportEnabled) {
      const support = answerSupportQuestion(message, locale);
      if (support.answer) {
        const actionLinks = support.suggestedActions
          .map((act) => `[${act.label}](${act.href})`)
          .join(" · ");
        setMessages((prev) => [
          ...prev,
          {
            id: idRef.current++,
            role: "assistant",
            text: `${support.answer}\n\n${actionLinks}`,
            products: [],
            source: "rules",
            intentSummary: a.supportLabel ?? null,
            at: Date.now(),
            // Honest label: static confirmed knowledge, not a DB row.
            sourceDetail: "support-static",
          },
        ]);
        return;
      }
    }

    chat.mutate(message);
  };

  const isRtl = dir === "rtl";
  const suggestions = intel?.suggested_questions?.length ? intel.suggested_questions : a.suggestions;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRtl ? "left" : "right"} className="flex w-full flex-col gap-0 bg-background p-0 sm:max-w-md" dir={dir}>
        <style>{`
          @keyframes aiTyping { 0%, 60%, 100% { transform: translateY(0); opacity: .5; } 30% { transform: translateY(-4px); opacity: 1; } }
          .ai-typing-dot { animation: aiTyping 1.2s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) { .ai-typing-dot { animation: none; opacity: .7; } }
        `}</style>

        {/* ===== Professional header: brand + presence + actions ===== */}
        <SheetHeader className="border-b border-border/80 bg-card/60 px-5 py-4 text-start backdrop-blur">
          <div className="flex items-center gap-3">
            <AssistantAvatar size="md" />
            <div className="min-w-0 flex-1">
              <SheetTitle className="truncate text-[17px] font-bold tracking-tight">{a.title}</SheetTitle>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {a.online}
              </p>
            </div>
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={newChat}
                title={a.newChat}
                aria-label={a.newChat}
                className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-all hover:border-primary/40 hover:text-foreground active:scale-95"
              >
                <RotateCcw className="size-4" />
              </button>
            ) : null}
          </div>
          <SheetDescription className="mt-2 text-xs leading-5">{a.subtitle}</SheetDescription>
        </SheetHeader>

        {/* ===== Conversation ===== */}
        <div className="flex-1 overflow-y-auto px-5 py-5" role="log" aria-live="polite">
          {messages.length === 0 ? (
            /* ===== Inviting empty state ===== */
            <div className="flex h-full flex-col items-center justify-center gap-5 py-8 text-center">
              <AssistantAvatar size="lg" />
              <div>
                <p className="text-lg font-bold tracking-tight">{a.greeting}</p>
                <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
                  {intel?.welcome_message || a.empty}
                </p>
              </div>
              <div className="grid w-full grid-cols-2 gap-2.5">
                {suggestions.map((suggestion, i) => {
                  const Icon = SUGGESTION_ICONS[i % SUGGESTION_ICONS.length] ?? Smartphone;
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => send(suggestion)}
                      className="group flex flex-col items-start gap-2.5 rounded-2xl border border-border bg-card p-3.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md active:translate-y-0"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-muted text-foreground transition-colors group-hover:bg-foreground group-hover:text-background">
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="line-clamp-2 text-[13px] font-medium leading-5">{suggestion}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex flex-col items-end gap-1">
                    <div className="max-w-[85%] rounded-2xl rounded-ee-md bg-foreground px-4 py-2.5 text-[15px] leading-6 text-background shadow-sm">
                      {message.text}
                    </div>
                    <span className="pe-1 text-[11px] tabular-nums text-muted-foreground">
                      {formatTime(message.at, locale)}
                    </span>
                  </div>
                ) : (
                  <div key={message.id} className="flex flex-col items-start gap-1">
                    <div className="flex items-start gap-2.5">
                      <AssistantAvatar />
                      <div className="max-w-[calc(100%-2.5rem)] rounded-2xl rounded-ss-md border border-border bg-card px-4 py-3 shadow-sm">
                        {message.intentSummary ? (
                          <p className="mb-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                            {a.understood}: {message.intentSummary}
                          </p>
                        ) : null}
                        {message.sourceDetail === "support-static" ? (
                          <p className="mb-2 text-[11px] italic text-muted-foreground">
                            {a.supportStaticNote}
                          </p>
                        ) : null}
                        {renderRichText(message.text, locale)}
                        {message.products.length ? (
                          <div className="mt-3 space-y-2">
                            {message.products.map((product) => (
                              <ProductCard key={product.id} product={product} locale={locale} />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <span className="ps-11 text-[11px] tabular-nums text-muted-foreground">
                      {formatTime(message.at, locale)}
                    </span>
                  </div>
                ),
              )}
              {chat.isPending ? <TypingIndicator /> : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* ===== Elegant input area ===== */}
        <form
          className="border-t border-border/80 bg-card/60 px-4 py-3 backdrop-blur"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex items-center gap-2 rounded-2xl border border-border bg-background py-1.5 pe-1.5 ps-4 shadow-sm transition-all focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={a.placeholder}
              aria-label={a.title}
              maxLength={500}
              className="h-10 flex-1 border-0 bg-transparent px-0 text-[15px] shadow-none focus-visible:ring-0"
            />
            <button
              type="submit"
              disabled={chat.isPending || !input.trim()}
              aria-label={a.send}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-foreground text-background shadow-sm transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {chat.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <SendHorizonal className="size-4 rtl:rotate-180" aria-hidden="true" />
              )}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] leading-4 text-muted-foreground/80">
            {a.subtitle}
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Floating button that opens the assistant — carries the real MODALIA logo. */
export function AiAssistantButton({
  locale,
  t,
  onOpen,
}: {
  locale: SupportedLocale;
  t: Translation;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={t.assistant.open}
      title={t.assistant.open}
      className="group inline-flex shrink-0 items-center justify-center gap-2 box-border rounded-full bg-foreground py-1.5 pe-4 ps-1.5 text-background shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-background">
        <ModaliLogo variant="dark" className="h-[10px] w-auto dark:hidden" />
        <ModaliLogo variant="light" className="hidden h-[10px] w-auto dark:block" />
      </span>
      <span className="whitespace-nowrap text-[13px] font-semibold leading-none tracking-tight">{t.assistant.shortTitle ?? "Assistant"}</span>
    </button>
  );
}
