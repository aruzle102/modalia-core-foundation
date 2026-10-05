import { useEffect, useState } from "react";

/**
 * Device capability tier used across Modalia to gate expensive motion and 3D.
 *
 * - `"data-saver"`: the user asked the browser to save data (Save-Data or a
 *   2G-class connection). Treat as the most constrained tier.
 * - `"low"`: no WebGL, or a weak CPU (<= 4 cores) paired with low RAM.
 * - `"mid"`: modest CPU (<= 6 cores) or a 3G-class connection.
 * - `"high"`: everything else.
 *
 * `reducedMotion` is exported separately and the raw `tier` is intentionally
 * NOT downgraded for it: consumers should treat
 * `reducedMotion === true` as "at least low" for *motion* decisions only,
 * e.g. `const motionTier = info.reducedMotion ? "low" : info.tier`.
 * Everything is guarded with `typeof window` so this is SSR-safe.
 */
export type DeviceTier = "high" | "mid" | "low" | "data-saver";

export interface DeviceTierInfo {
  tier: DeviceTier;
  reducedMotion: boolean;
  webgl: boolean;
}

/** Network Information API is not in the DOM lib yet, so we type it locally. */
interface NetworkInformationLike {
  readonly saveData?: boolean;
  readonly effectiveType?: string;
}

interface NavigatorWithDeviceInfo extends Navigator {
  readonly connection?: NetworkInformationLike;
  readonly deviceMemory?: number;
}

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
const SLOW_CONNECTION_TYPES = new Set(["2g", "slow-2g"]);

function getNavigator(): NavigatorWithDeviceInfo | null {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }
  return navigator as NavigatorWithDeviceInfo;
}

function detectReducedMotion(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  try {
    return window.matchMedia(REDUCED_MOTION_QUERY).matches;
  } catch {
    return false;
  }
}

function detectWebGL(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }
  try {
    const canvas = document.createElement("canvas");
    // Prefer WebGL2, fall back to WebGL1.
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return gl !== null && gl !== undefined;
  } catch {
    return false;
  }
}

function detectDataSaver(nav: NavigatorWithDeviceInfo | null): boolean {
  const connection = nav?.connection;
  if (!connection) return false;
  if (connection.saveData === true) return true;
  return (
    typeof connection.effectiveType === "string" &&
    SLOW_CONNECTION_TYPES.has(connection.effectiveType)
  );
}

function computeTier(
  nav: NavigatorWithDeviceInfo | null,
  webgl: boolean,
): DeviceTier {
  if (detectDataSaver(nav)) return "data-saver";
  if (!webgl) return "low";

  const cores =
    typeof nav?.hardwareConcurrency === "number"
      ? nav.hardwareConcurrency
      : undefined;
  const memoryGb = nav?.deviceMemory;
  const weakMemory =
    typeof memoryGb === "number" && Number.isFinite(memoryGb) && memoryGb <= 2;

  if (cores !== undefined && cores <= 4 && weakMemory) return "low";
  if (cores !== undefined && cores <= 6) return "mid";
  if (nav?.connection?.effectiveType === "3g") return "mid";
  return "high";
}

function snapshot(): DeviceTierInfo {
  if (typeof window === "undefined") {
    // SSR fallback: assume the most constrained tier until hydration.
    return { tier: "low", reducedMotion: false, webgl: false };
  }
  const nav = getNavigator();
  const webgl = detectWebGL();
  return {
    tier: computeTier(nav, webgl),
    reducedMotion: detectReducedMotion(),
    webgl,
  };
}

export function useDeviceTier(): DeviceTierInfo {
  const [info, setInfo] = useState<DeviceTierInfo>(snapshot);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    // Recompute after hydration in case the SSR guess was wrong.
    setInfo(snapshot());
    const mql = window.matchMedia(REDUCED_MOTION_QUERY);
    const onChange = () => setInfo(snapshot());
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return info;
}
