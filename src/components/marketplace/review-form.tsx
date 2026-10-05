import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, Loader2, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getTranslations } from "@/lib/i18n";
import { createReviewImageUpload, submitProductReview } from "@/lib/reviews.functions";
import type { SupportedLocale } from "@/config/platform";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ReviewForm({ productId, locale }: { productId: string; locale: SupportedLocale }) {
  const t = getTranslations(locale).product;
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [body, setBody] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const submit = useMutation({
    mutationFn: async () => {
      let imagePath: string | undefined;
      if (imageFile) {
        const signed = await createReviewImageUpload({
          data: { productId, contentType: imageFile.type, sizeBytes: imageFile.size },
        });
        const { error: uploadError } = await supabase.storage
          .from("review-images")
          .uploadToSignedUrl(signed.path, signed.token, imageFile);
        if (uploadError) throw new Error("upload");
        imagePath = signed.path;
      }
      return submitProductReview({
        data: {
          productId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim().toLowerCase(),
          rating,
          body: body.trim() || undefined,
          imagePath,
          website: website || undefined,
        },
      });
    },
    onSuccess: () => {
      setSent(true);
      setError(null);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.includes("already submitted")
          ? t.duplicateReview
          : message.includes("Links are not allowed")
            ? t.linksNotAllowed
            : t.reviewFailed,
      );
    },
  });

  function pickImage(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      setError(t.photoHint);
      return;
    }
    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = () => setImagePreview(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (rating < 1 || rating > 5) return setError(t.selectRating);
    if (!firstName.trim() || !lastName.trim()) return setError(t.fieldRequired);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t.invalidEmail);
    if (body && /(https?:\/\/|www\.)/i.test(body)) return setError(t.linksNotAllowed);
    submit.mutate();
  }

  if (sent) {
    return (
      <div className="mt-10 flex items-start gap-3 rounded-2xl border border-border bg-card p-5" role="status">
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-foreground" aria-hidden />
        <p className="text-small text-foreground">{t.reviewSent}</p>
      </div>
    );
  }

  const activeStar = hovered || rating;

  return (
    <form onSubmit={handleSubmit} className="mt-10 max-w-2xl rounded-3xl border border-border bg-card p-6 sm:p-8" noValidate={false}>
      <h3 className="text-h3 text-foreground">{t.writeReview}</h3>
      <p className="mt-2 text-small text-muted-foreground">{t.reviewIntro}</p>

      <div className="mt-6">
        <span className="text-nav text-foreground">{t.yourRating}</span>
        <div className="mt-2 flex items-center gap-1" role="radiogroup" aria-label={t.yourRating}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              role="radio"
              aria-checked={rating === star}
              aria-label={`${star} / 5`}
              onMouseEnter={() => setHovered(star)}
              onMouseLeave={() => setHovered(0)}
              onFocus={() => setHovered(star)}
              onBlur={() => setHovered(0)}
              onClick={() => setRating(star)}
              className="rounded p-0.5 transition-transform hover:scale-110 motion-reduce:transition-none"
            >
              <Star
                aria-hidden
                className={`size-7 ${star <= activeStar ? "fill-current text-foreground" : "text-muted-foreground/35"}`}
              />
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="review-first-name">{t.firstName}</Label>
          <Input
            id="review-first-name"
            className="mt-2"
            value={firstName}
            maxLength={60}
            onChange={(e) => setFirstName(e.target.value)}
            required
            autoComplete="given-name"
          />
        </div>
        <div>
          <Label htmlFor="review-last-name">{t.lastName}</Label>
          <Input
            id="review-last-name"
            className="mt-2"
            value={lastName}
            maxLength={60}
            onChange={(e) => setLastName(e.target.value)}
            required
            autoComplete="family-name"
          />
        </div>
      </div>

      <div className="mt-4">
        <Label htmlFor="review-email">{t.email}</Label>
        <Input
          id="review-email"
          type="email"
          className="mt-2"
          value={email}
          maxLength={255}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          dir="ltr"
        />
      </div>

      <div className="mt-4">
        <Label htmlFor="review-body">{t.yourComment}</Label>
        <Textarea
          id="review-body"
          className="mt-2 min-h-28"
          value={body}
          maxLength={2000}
          placeholder={t.commentPlaceholder}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>

      <div className="mt-4">
        <span className="text-nav text-foreground">{t.photoOptional}</span>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          aria-label={t.photoOptional}
          onChange={pickImage}
        />
        {imagePreview ? (
          <div className="mt-2 flex items-center gap-4">
            <img src={imagePreview} alt="" className="size-20 rounded-xl border border-border object-cover" />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
                {t.changePhoto}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t.changePhoto}
                onClick={() => {
                  setImageFile(null);
                  setImagePreview(null);
                }}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
              <ImagePlus className="size-4" />
              {t.addPhoto}
            </Button>
            <p className="mt-1.5 text-caption text-muted-foreground">{t.photoHint}</p>
          </div>
        )}
      </div>

      {/* Honeypot — invisible to humans, catches naive bots. */}
      <div className="sr-only" aria-hidden>
        <label>
          Website
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {error ? (
        <p className="mt-5 text-small text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Button type="submit" className="mt-6 h-11 rounded-full px-8" disabled={submit.isPending}>
        {submit.isPending ? (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden />
            {t.submittingReview}
          </>
        ) : (
          t.submitReview
        )}
      </Button>
    </form>
  );
}
