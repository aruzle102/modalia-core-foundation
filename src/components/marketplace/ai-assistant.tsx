/**
 * Modalia Intelligence — storefront chat drawer.
 *
 * Answers come ONLY from `aiChat` (deterministic, database-powered rules).
 * No external AI provider is ever called in production.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Loader2, SendHorizonal, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
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

type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  text: string;
  products: AiChatProduct[];
  source: "rules";
  intentSummary: string | null;
};



/** Minimal markdown: links [t](url), **bold**, _italic_, bullet lines, paragraphs. */
function renderRichText(text: string, locale: SupportedLocale) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let listItems: ReactNode[] = [];

  const inline = (segment: string, keyBase: string): ReactNode[] => {
    const parts: ReactNode[] = [];
    // links first, then bold/italic inside plain chunks
    const linkRe = /\[([^\]]+)\]\((\/product\/[^)\s?]+)(\?locale=[a-z]{2})?\)/g;
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
      const rawSlug = m[2];
      if (rawSlug === undefined) continue;
      const slug = rawSlug.replace("/product/", "");
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
  return <div className="text-sm leading-6">{blocks}</div>;
}

function ProductCard({ product, locale, t }: { product: AiChatProduct; locale: SupportedLocale; t: Translation }) {
  return (
    <Link
      to="/product/$slug"
      params={{ slug: product.slug }}
      search={{ locale } as never}
      className="flex items-center gap-3 rounded-xl border border-border bg-card p-2 pe-3 transition-colors hover:border-primary/50"
    >
      {product.imagePath ? (
        <img
          src={product.imagePath}
          alt={product.name}
          className="size-12 shrink-0 rounded-lg object-cover"
          loading="lazy"
        />
      ) : (
        <div className="grid size-12 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
          <Sparkles className="size-5" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{formatPrice(product.price, locale)}</span>
          {product.compareAtPrice && product.compareAtPrice > product.price ? (
            <span className="ms-1.5 line-through">{formatPrice(product.compareAtPrice, locale)}</span>
          ) : null}
          {product.storeName ? <span className="ms-1.5">· {product.storeName}</span> : null}
        </p>
      </div>
    </Link>
  );
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
        },
      ]);
    },
    onError: () => {
      setMessages((prev) => [
        ...prev,
        {
          id: idRef.current++,
          role: "assistant",
          text: t.assistant.error,
          products: [],
          source: "rules",
          intentSummary: null,
        },
      ]);
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, chat.isPending]);

  const send = (text: string) => {
    const message = text.trim();
    if (!message || chat.isPending) return;
    setMessages((prev) => [
      ...prev,
      { id: idRef.current++, role: "user", text: message, products: [], source: "rules", intentSummary: null },
    ]);
    setInput("");

    // Support knowledge first: when enabled and the question matches a
    // confirmed support intent, answer deterministically from the knowledge
    // base instead of searching the catalog.
    if (supportEnabled) {
      const support = answerSupportQuestion(message, locale);
      if (support.answer) {
        const actionLinks = support.suggestedActions
          .map((a) => `[${a.label}](${a.href})`)
          .join(" · ");
        setMessages((prev) => [
          ...prev,
          {
            id: idRef.current++,
            role: "assistant",
            text: `${support.answer}\n\n${actionLinks}`,
            products: [],
            source: "rules",
            intentSummary: t.assistant.supportLabel ?? null,
          },
        ]);
        return;
      }
    }

    chat.mutate(message);
  };

  const isRtl = dir === "rtl";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side={isRtl ? "left" : "right"} className="flex w-full flex-col gap-0 p-0 sm:max-w-md" dir={dir}>
        <SheetHeader className="border-b border-border px-5 py-4 text-start">
          <SheetTitle className="flex items-center gap-2 text-lg">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Sparkles className="size-4.5" />
            </span>
            {t.assistant.title}
          </SheetTitle>
          <SheetDescription>{t.assistant.subtitle}</SheetDescription>
        </SheetHeader>

        {/* Honesty banner: Modalia Intelligence is deterministic and database-powered. */}
        <div className="mx-5 mt-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-xs leading-5 text-amber-800 dark:text-amber-300">
          <Bot className="mt-0.5 size-4 shrink-0" />
          <p>{t.assistant.rulesBanner}</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4" role="log" aria-live="polite">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <span className="grid size-14 place-items-center rounded-2xl bg-muted">
                <Sparkles className="size-6 text-muted-foreground" />
              </span>
              <p className="max-w-xs text-sm text-muted-foreground">
                {intel?.welcome_message || t.assistant.empty}
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {(intel?.suggested_questions?.length
                  ? intel.suggested_questions
                  : t.assistant.suggestions
                ).map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div key={message.id} className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm text-primary-foreground">
                      {message.text}
                    </div>
                  </div>
                ) : (
                  <div key={message.id} className="flex justify-start">
                    <div className="max-w-[92%] rounded-2xl rounded-bl-md border border-border bg-card px-4 py-3">
                      {message.intentSummary ? (
                        <p className="mb-2 inline-block rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
                          {t.assistant.understood}: {message.intentSummary}
                        </p>
                      ) : null}
                      {renderRichText(message.text, locale)}
                      {message.products.length ? (
                        <div className="mt-3 space-y-2">
                          {message.products.map((product) => (
                            <ProductCard key={product.id} product={product} locale={locale} t={t} />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ),
              )}
              {chat.isPending ? (
                <div className="flex justify-start">
                  <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <form
          className="border-t border-border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
        >
          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={t.assistant.placeholder}
              aria-label={t.assistant.title}
              maxLength={500}
              className="flex-1"
            />
            <Button type="submit" size="icon" disabled={chat.isPending || !input.trim()} aria-label={t.assistant.send}>
              {chat.isPending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/** Header button that opens the assistant drawer. */
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
    <Button variant="ghost" size="icon" onClick={onOpen} aria-label={t.assistant.open} title={t.assistant.open}>
      <Sparkles />
    </Button>
  );
}
