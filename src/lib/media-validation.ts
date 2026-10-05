/**
 * Shared media validation rules for product media (images + 3D models).
 *
 * Imported by server functions (enforced at upload / finalize time) and by
 * the `MediaUploader` component (client-side pre-check for fast UX — the
 * server check is the authority and always re-runs).
 *
 * Supported kinds mirror the `product_images.media_type` DB check constraint:
 * `image` and `model_3d`. Validation is content-based (magic bytes), never
 * extension-only: a renamed executable is rejected even if it ends in .png.
 */

export const MEDIA_LIMITS = {
  image: {
    maxBytes: 10 * 1024 * 1024, // 10 MB
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] as const,
    extensions: ["jpg", "jpeg", "png", "webp", "gif"] as const,
    minWidth: 64,
    minHeight: 64,
    maxWidth: 8000,
    maxHeight: 8000,
  },
  model_3d: {
    maxBytes: 50 * 1024 * 1024, // 50 MB
    mimeTypes: ["model/gltf-binary", "model/gltf+json"] as const,
    extensions: ["glb", "gltf"] as const,
  },
} as const;

export type MediaKind = keyof typeof MEDIA_LIMITS; // "image" | "model_3d"

export type MediaErrorCode =
  | "unsupported-type"
  | "too-large"
  | "empty-file"
  | "corrupt-file"
  | "dimensions-too-small"
  | "dimensions-too-large";

/** Thrown by the validators below; `code` lets UI map to translated copy. */
export class MediaValidationError extends Error {
  readonly code: MediaErrorCode;
  constructor(code: MediaErrorCode, message: string) {
    super(message);
    this.name = "MediaValidationError";
    this.code = code;
  }
}

function extOf(filename: string): string {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot + 1).toLowerCase() : "";
}

/** Detect the media kind from filename extension and/or MIME type. */
export function detectMediaKind(
  filename: string,
  mimeType?: string | null,
): MediaKind | null {
  const ext = extOf(filename);
  const mime = (mimeType ?? "").toLowerCase();
  for (const kind of Object.keys(MEDIA_LIMITS) as MediaKind[]) {
    const limits = MEDIA_LIMITS[kind];
    if (
      (limits.extensions as readonly string[]).includes(ext) ||
      (mime && (limits.mimeTypes as readonly string[]).includes(mime))
    ) {
      return kind;
    }
  }
  return null;
}

/**
 * Fast metadata check (filename, MIME, size). Throws MediaValidationError.
 * `expectedKind`, when given, forces the file to match that kind (used by
 * the "upload an image" vs "upload a 3D model" flows).
 */
export function validateMediaMeta(input: {
  filename: string;
  mimeType?: string | null | undefined;
  sizeBytes: number;
  expectedKind?: MediaKind | null;
}): { kind: MediaKind; extension: string } {
  const { filename, mimeType, sizeBytes, expectedKind } = input;
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    throw new MediaValidationError("empty-file", "The file is empty.");
  }
  const kind = detectMediaKind(filename, mimeType);
  if (!kind) {
    throw new MediaValidationError(
      "unsupported-type",
      "Unsupported file type. Allowed: JPG, PNG, WebP, GIF images and GLB/GLTF 3D models.",
    );
  }
  if (expectedKind && kind !== expectedKind) {
    throw new MediaValidationError(
      "unsupported-type",
      expectedKind === "image"
        ? "Expected an image file (JPG, PNG, WebP, GIF)."
        : "Expected a 3D model file (GLB or GLTF).",
    );
  }
  const maxBytes = MEDIA_LIMITS[kind].maxBytes;
  if (sizeBytes > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    throw new MediaValidationError(
      "too-large",
      `The file is too large (max ${mb} MB for ${kind === "image" ? "images" : "3D models"}).`,
    );
  }
  return { kind, extension: extOf(filename) };
}

/* ------------------------------------------------------------------ */
/* Content validation: magic bytes + real image dimensions             */
/* ------------------------------------------------------------------ */

export interface ValidatedMediaBytes {
  width?: number;
  height?: number;
}

function readU16BE(b: Uint8Array, o: number): number {
  return (b[o]! << 8) | b[o + 1]!;
}
function readU32BE(b: Uint8Array, o: number): number {
  return (b[o]! * 0x1000000 + (b[o + 1]! << 16) + (b[o + 2]! << 8) + b[o + 3]!) >>> 0;
}
function readU16LE(b: Uint8Array, o: number): number {
  return b[o]! | (b[o + 1]! << 8);
}
function readU32LE(b: Uint8Array, o: number): number {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | b[o + 3]! * 0x1000000) >>> 0;
}
function ascii(b: Uint8Array, o: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(b[o + i]!);
  return s;
}

function pngDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 24) return null;
  if (
    b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47 ||
    b[4] !== 0x0d || b[5] !== 0x0a || b[6] !== 0x1a || b[7] !== 0x0a
  ) {
    return null;
  }
  if (ascii(b, 12, 4) !== "IHDR") return null;
  return { width: readU32BE(b, 16), height: readU32BE(b, 20) };
}

function jpegDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  let o = 2;
  const SOF = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
    0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  while (o + 4 < b.length) {
    if (b[o] !== 0xff) return null;
    const marker = b[o + 1]!;
    o += 2;
    // Standalone markers have no length field.
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      continue;
    }
    const len = readU16BE(b, o);
    if (len < 2 || o + len > b.length) return null;
    if (SOF.has(marker)) {
      if (len < 7) return null;
      return { width: readU16BE(b, o + 5), height: readU16BE(b, o + 3) };
    }
    o += len;
  }
  return null;
}

function gifDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 10) return null;
  const sig = ascii(b, 0, 6);
  if (sig !== "GIF87a" && sig !== "GIF89a") return null;
  return { width: readU16LE(b, 6), height: readU16LE(b, 8) };
}

function webpDimensions(b: Uint8Array): { width: number; height: number } | null {
  if (b.length < 30) return null;
  if (ascii(b, 0, 4) !== "RIFF" || ascii(b, 8, 4) !== "WEBP") return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") {
    // Lossy: 8-byte chunk header, 3-byte frame tag, 3-byte start code 9D 012A.
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) return null;
    return { width: readU16LE(b, 26) & 0x3fff, height: readU16LE(b, 28) & 0x3fff };
  }
  if (chunk === "VP8L") {
    // Lossless: 1-byte signature 0x2F then 4 packed bytes (14-bit w/h minus 1).
    if (b[20] !== 0x2f) return null;
    const v = readU32LE(b, 21);
    return { width: (v & 0x3fff) + 1, height: ((v >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    // Extended: flags(1) + reserved(3), then 24-bit (width-1), 24-bit (height-1).
    if (b.length < 30) return null;
    const w = (b[24]! | (b[25]! << 8) | (b[26]! << 16)) + 1;
    const h = (b[27]! | (b[28]! << 8) | (b[29]! << 16)) + 1;
    return { width: w, height: h };
  }
  return null;
}

function imageDimensions(b: Uint8Array, extension: string): { width: number; height: number } | null {
  switch (extension) {
    case "png":
      return pngDimensions(b);
    case "jpg":
    case "jpeg":
      return jpegDimensions(b);
    case "gif":
      return gifDimensions(b);
    case "webp":
      return webpDimensions(b);
    default:
      return null;
  }
}

function validateGlb(b: Uint8Array): void {
  if (b.length < 20 || ascii(b, 0, 4) !== "glTF") {
    throw new MediaValidationError("corrupt-file", "The file is not a valid GLB 3D model.");
  }
  const version = readU32LE(b, 4);
  if (version !== 2) {
    throw new MediaValidationError("corrupt-file", `Unsupported glTF version ${version}; version 2 is required.`);
  }
  const declared = readU32LE(b, 8);
  if (declared > b.length || declared < 20) {
    throw new MediaValidationError("corrupt-file", "The GLB file is truncated.");
  }
}

function validateGltfJson(b: Uint8Array): void {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(b);
  } catch {
    throw new MediaValidationError("corrupt-file", "The file is not a valid GLTF 3D model.");
  }
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new MediaValidationError("corrupt-file", "The file is not a valid GLTF 3D model.");
  }
  const version =
    doc && typeof doc === "object"
      ? (doc as { asset?: { version?: unknown } }).asset?.version
      : undefined;
  if (typeof version !== "string" || !version.startsWith("2")) {
    throw new MediaValidationError("corrupt-file", "The GLTF asset must declare glTF version 2.");
  }
}

/**
 * Deep content validation of already-uploaded bytes. Throws
 * MediaValidationError when the content does not match the declared kind.
 * Returns real image dimensions for images.
 */
export function validateMediaBytes(
  bytes: Uint8Array,
  kind: MediaKind,
  extension: string,
): ValidatedMediaBytes {
  if (kind === "image") {
    const dims = imageDimensions(bytes, extension);
    if (!dims || !dims.width || !dims.height) {
      throw new MediaValidationError(
        "corrupt-file",
        "The image file is corrupt or not a real image.",
      );
    }
    const limits = MEDIA_LIMITS.image;
    if (dims.width < limits.minWidth || dims.height < limits.minHeight) {
      throw new MediaValidationError(
        "dimensions-too-small",
        `The image is too small (minimum ${limits.minWidth}×${limits.minHeight} px).`,
      );
    }
    if (dims.width > limits.maxWidth || dims.height > limits.maxHeight) {
      throw new MediaValidationError(
        "dimensions-too-large",
        `The image is too large (maximum ${limits.maxWidth}×${limits.maxHeight} px).`,
      );
    }
    return dims;
  }
  if (extension === "glb") validateGlb(bytes);
  else validateGltfJson(bytes);
  return {};
}
