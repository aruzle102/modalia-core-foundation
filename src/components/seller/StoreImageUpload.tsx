import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  requestSellerMediaUpload,
  finalizeSellerMediaUpload,
} from "@/lib/seller-media.functions";

function storagePreviewUrl(path: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  // Supabase public URL pattern — adjust if bucket differs
  return path;
}

/**
 * Simple image upload with preview for store logo/banner.
 * Uploads via seller media pipeline, returns the storage path.
 */
export function StoreImageUpload({
  label,
  hint,
  value,
  onChange,
  aspect = "square",
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (path: string) => void;
  aspect?: "square" | "wide";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const preview = storagePreviewUrl(value);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file.");
      return;
    }
    setUploading(true);
    try {
      const req = await requestSellerMediaUpload({
        data: {
          filename: file.name,
          mimeType: file.type,
          sizeBytes: file.size,
          mediaKind: "image",
        },
      });
      const put = await fetch(req.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Upload failed.");
      await finalizeSellerMediaUpload({ data: { path: req.path, kind: "image" } });
      onChange(req.path);
      toast.success("Image uploaded.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      <div
        className={
          aspect === "wide"
            ? "relative aspect-[3/1] overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-900"
            : "relative aspect-square w-40 overflow-hidden rounded-xl border bg-neutral-100 dark:bg-neutral-900"
        }
      >
        {preview ? (
          <img src={preview} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No image
          </div>
        )}
        {uploading ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Loader2 className="h-6 w-6 animate-spin text-white" />
          </div>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="me-1.5 h-4 w-4" />
          {value ? "Change" : "Upload"}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={uploading}
            onClick={() => onChange("")}
          >
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}
