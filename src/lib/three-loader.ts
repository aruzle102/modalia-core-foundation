/**
 * three-loader.ts — lazy, singleton loading of the `three` runtime.
 *
 * `three` is heavy, so it must never be statically imported by a route.
 * Consumers (e.g. the 3D hero) should:
 *   1. Check `isWebGLAvailable()` / `useDeviceTier()` first.
 *   2. `await loadThree()` — resolves to the module, or `null` on failure.
 *   3. `await loadGLTFLoader()` when a GLTF model is actually needed.
 */

let threePromise: Promise<typeof import("three") | null> | null = null;

// `any` is a deliberate, documented choice here: `three/examples/jsm/*`
// modules ship with three itself and their exported shapes drift between
// releases, while this file is only a loading boundary. Consumers narrow the
// value to the concrete loader type they need.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let gltfLoaderPromise: Promise<any | null> | null = null;

/** Real WebGL capability test via a throwaway canvas. SSR-safe. */
export function isWebGLAvailable(): boolean {
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

/**
 * Dynamically imports `three` exactly once (singleton promise).
 * Resolves to `null` on the server or when the import fails.
 */
export function loadThree(): Promise<typeof import("three") | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (threePromise === null) {
    threePromise = import("three").then(
      (mod) => mod,
      () => null,
    );
  }
  return threePromise;
}

/**
 * Dynamically imports the GLTF loader exactly once (singleton promise).
 * Resolves to the `GLTFLoader` class, or `null` on the server / on failure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadGLTFLoader(): Promise<any | null> {
  if (typeof window === "undefined") {
    return Promise.resolve(null);
  }
  if (gltfLoaderPromise === null) {
    gltfLoaderPromise = import("three/examples/jsm/loaders/GLTFLoader.js").then(
      (mod) => mod.GLTFLoader ?? null,
      () => null,
    );
  }
  return gltfLoaderPromise;
}
