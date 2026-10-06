import { useRef, useState } from "react";
import { CloudUpload, FileWarning, Loader2, CheckCircle2 } from "lucide-react";
import {
  detectMediaKind,
  validateMediaMeta,
  MediaValidationError,
  type MediaKind,
} from "@/lib/media-validation";
import { cn } from "@/lib/utils";

export interface UploaderLabels {
  dropHint: string;
  browse: string;
  uploading: string;
  finalizing: string;
  done: string;
  errUnsupported: string;
  errTooLarge: string;
  errEmpty: string;
  errCorrupt: string;
  errTooSmall: string;
  errTooLargeDims: string;
  errUploadFailed: string;
  errKindMismatch: string;
}

export interface UploadedMedia {
  path: string;
  kind: MediaKind;
  width: number | null;
  height: number | null;
}

interface MediaUploaderProps {
  /** Which kinds the file picker accepts; "any" lets the file decide. */
  acceptKind: MediaKind | "any";
  labels: UploaderLabels;
  requestUpload: (file: File, kind: MediaKind) => Promise<{
    path: string;
    signedUrl: string;
    mediaKind: MediaKind;
  }>;
  finalizeUpload: (path: string, kind: MediaKind) => Promise<{
    width?: number | null;
    height?: number | null;
  } | void>;
  onUploaded: (media: UploadedMedia) => void;
  multiple?: boolean;
  className?: string;
}

type FileStatus = "uploading" | "finalizing" | "done" | "error";
interface TrackedFile {
  id: string;
  name: string;
  status: FileStatus;
  error: string | null;
}

const ACCEPT_BY_KIND: Record<MediaKind | "any", string> = {
  image: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif",
  video: "video/mp4,video/webm,.mp4,.webm",
  model_3d: ".glb,.gltf,model/gltf-binary,model/gltf+json",
  any: "image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif,video/mp4,video/webm,.mp4,.webm,.glb,.gltf,model/gltf-binary,model/gltf+json",
};

function errorLabel(code: string | undefined, labels: UploaderLabels, fallback: string): string {
  switch (code) {
    case "unsupported-type":
      return labels.errUnsupported;
    case "too-large":
      return labels.errTooLarge;
    case "empty-file":
      return labels.errEmpty;
    case "corrupt-file":
      return labels.errCorrupt;
    case "dimensions-too-small":
      return labels.errTooSmall;
    case "dimensions-too-large":
      return labels.errTooLargeDims;
    default:
      return fallback;
  }
}

/**
 * Shared media uploader: client-side pre-check (fast UX) → signed upload URL
 * → browser PUT → server-side finalize (the enforced validation).
 *
 * Used by the admin media manager and the seller product editor with
 * different `requestUpload`/`finalizeUpload` pairs.
 */
export function MediaUploader({
  acceptKind,
  labels,
  requestUpload,
  finalizeUpload,
  onUploaded,
  multiple = true,
  className,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<TrackedFile[]>([]);
  const [busy, setBusy] = useState(false);

  const track = (id: string, patch: Partial<TrackedFile>) =>
    setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));

  const handleFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    if (!arr.length || busy) return;
    setBusy(true);
    try {
      for (const file of arr) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setFiles((prev) => [...prev.slice(-4), { id, name: file.name, status: "uploading", error: null }]);
        try {
          // 1. Client pre-check — instant feedback; the server re-validates.
          const detected = detectMediaKind(file.name, file.type);
          if (!detected) {
            throw new MediaValidationError("unsupported-type", labels.errUnsupported);
          }
          if (acceptKind !== "any" && detected !== acceptKind) {
            const err = new MediaValidationError("unsupported-type", labels.errKindMismatch);
            throw err;
          }
          validateMediaMeta({
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
            expectedKind: acceptKind === "any" ? null : acceptKind,
          });

          // 2. Signed upload URL from the server.
          const { path, signedUrl, mediaKind } = await requestUpload(file, detected);

          // 3. PUT the bytes directly to storage.
          track(id, { status: "uploading" });
          const put = await fetch(signedUrl, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type || "application/octet-stream" },
          });
          if (!put.ok) {
            throw new Error(labels.errUploadFailed);
          }

          // 4. Server-side content validation (magic bytes, dimensions).
          track(id, { status: "finalizing" });
          const finalized = await finalizeUpload(path, mediaKind);
          const dims = (finalized ?? {}) as { width?: number | null; height?: number | null };
          track(id, { status: "done", error: null });
          onUploaded({
            path,
            kind: mediaKind,
            width: dims.width ?? null,
            height: dims.height ?? null,
          });
        } catch (e) {
          const code = e instanceof MediaValidationError ? e.code : undefined;
          const message = e instanceof Error ? e.message : labels.errUploadFailed;
          track(id, { status: "error", error: errorLabel(code, labels, message) });
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        aria-label={labels.browse}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-accent/40",
        )}
      >
        <CloudUpload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{labels.dropHint}</p>
        <span className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent">
          {labels.browse}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_BY_KIND[acceptKind]}
          multiple={multiple}
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              {f.status === "done" ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
              ) : f.status === "error" ? (
                <FileWarning className="h-4 w-4 shrink-0 text-destructive" />
              ) : (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span
                className={cn(
                  "shrink-0 text-xs",
                  f.status === "error" ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {f.status === "uploading"
                  ? labels.uploading
                  : f.status === "finalizing"
                    ? labels.finalizing
                    : f.status === "done"
                      ? labels.done
                      : (f.error ?? labels.errUploadFailed)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
