import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";

/**
 * ProductViewer3D — a real WebGL (raw three.js, no react-three-fiber) GLB model
 * viewer.
 *
 * Loads a GLB via a dynamically imported GLTFLoader, auto-frames it with a
 * Box3 fit, lights it with hemisphere + shadow-casting directional light, and
 * exposes drag-to-orbit (spherical), wheel/pinch zoom (clamped), and a reset
 * button. Honest states: loading spinner, genuine error with retry.
 *
 * Contract note (worker 2/6, phase 3/4): `@/hooks/use-device-tier` and
 * `@/lib/three-loader` did not exist yet, so the two checks needed here
 * (WebGL support, reduced motion) are implemented locally with the same
 * semantics. Swap for the shared helpers when they land.
 */

type ViewerStatus = "loading" | "ready" | "error";

function hasWebglSupport(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function disposeModel(root: import("three").Object3D, THREE: typeof import("three")): void {
  root.traverse((obj) => {
    const mesh = obj as import("three").Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

export function ProductViewer3D({
  modelUrl,
  className,
}: {
  modelUrl: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const [status, setStatus] = useState<ViewerStatus>("loading");
  const [attempt, setAttempt] = useState(0);
  // SSR-safe lazy initializers: `false`/`null` on the server, real values on the client.
  const [webglOk] = useState<boolean | null>(() =>
    typeof window === "undefined" ? null : hasWebglSupport(),
  );
  const [reducedMotion] = useState<boolean>(() => prefersReducedMotion());

  const hasUrl = modelUrl.trim().length > 0;

  useEffect(() => {
    if (!hasUrl || webglOk !== true) return;
    if (!containerRef.current || !canvasRef.current) return;
    // Explicit non-nullable bindings: narrowing does not survive into nested
    // closures, so capture the guarded elements with fixed types here.
    const container: HTMLDivElement = containerRef.current;
    const canvas: HTMLCanvasElement = canvasRef.current;

    let disposed = false;
    let raf = 0;
    const disposables: Array<{ dispose(): void }> = [];
    const track = <T extends { dispose(): void }>(resource: T): T => {
      disposables.push(resource);
      return resource;
    };
    const cleanupFns: Array<() => void> = [];

    // Spherical orbit state around the model's center.
    let theta = 0.65;
    let phi = 1.12;
    let radius = 5;
    let minRadius = 1;
    let maxRadius = 20;
    const target = { x: 0, y: 0, z: 0 };
    const home = { theta, phi, radius };
    let lastInteraction = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;

    async function init() {
      let THREE: typeof import("three");
      try {
        // Local fallback for `@/lib/three-loader`'s loadThree().
        THREE = await import("three");
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      let GLTFLoader: typeof import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader;
      try {
        const loaderModule = await import("three/examples/jsm/loaders/GLTFLoader.js");
        GLTFLoader = loaderModule.GLTFLoader;
      } catch {
        if (!disposed) setStatus("error");
        return;
      }
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      track(renderer);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);

      const resize = () => {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };
      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      cleanupFns.push(() => resizeObserver.disconnect());

      // --- Lighting: soft sky/ground fill + shadow-casting key light. ---
      const hemisphere = new THREE.HemisphereLight(0xfff6e8, 0x2a241c, 0.95);
      scene.add(hemisphere);
      const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
      keyLight.position.set(5, 8, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0004;
      scene.add(keyLight);

      // --- Load the model and frame it. ---
      const loader = new GLTFLoader();
      let model: import("three").Group;
      try {
        const gltf = await loader.loadAsync(modelUrl);
        if (disposed) return;
        model = gltf.scene;
      } catch {
        if (!disposed) setStatus("error");
        return;
      }

      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDim) || maxDim <= 0) {
        if (!disposed) setStatus("error");
        return;
      }
      target.x = center.x;
      target.y = center.y;
      target.z = center.z;

      const fitDistance =
        ((maxDim / 2) / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.45;
      radius = fitDistance;
      minRadius = maxDim * 0.9;
      maxRadius = fitDistance * 2.6;
      camera.near = Math.max(maxDim / 100, 0.01);
      camera.far = maxDim * 30;
      camera.updateProjectionMatrix();
      home.theta = theta;
      home.phi = phi;
      home.radius = radius;

      // Soft contact shadow catcher under the model.
      const groundGeo = track(new THREE.PlaneGeometry(maxDim * 5, maxDim * 5));
      const groundMat = track(new THREE.ShadowMaterial({ opacity: 0.22 }));
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.set(center.x, box.min.y - maxDim * 0.02, center.z);
      ground.receiveShadow = true;
      scene.add(ground);

      keyLight.shadow.camera.left = -maxDim * 1.5;
      keyLight.shadow.camera.right = maxDim * 1.5;
      keyLight.shadow.camera.top = maxDim * 1.5;
      keyLight.shadow.camera.bottom = -maxDim * 1.5;
      keyLight.shadow.camera.updateProjectionMatrix();
      keyLight.target.position.copy(center);
      scene.add(keyLight.target);

      model.traverse((obj) => {
        const mesh = obj as import("three").Mesh;
        if (mesh.isMesh) {
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      scene.add(model);

      const applyCamera = () => {
        camera.position.set(
          target.x + radius * Math.sin(phi) * Math.sin(theta),
          target.y + radius * Math.cos(phi),
          target.z + radius * Math.sin(phi) * Math.cos(theta),
        );
        camera.lookAt(target.x, target.y, target.z);
      };

      // --- Custom orbit controls: drag to rotate, wheel/pinch to zoom. ---
      const markInteraction = () => {
        lastInteraction = performance.now();
      };
      const onPointerDown = (event: PointerEvent) => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          if (a && b) pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        }
        canvas.setPointerCapture(event.pointerId);
        canvas.style.cursor = "grabbing";
        markInteraction();
      };
      const onPointerMove = (event: PointerEvent) => {
        const prev = pointers.get(event.pointerId);
        if (!prev) return;
        const dx = event.clientX - prev.x;
        const dy = event.clientY - prev.y;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        markInteraction();
        if (pointers.size === 1) {
          theta -= dx * 0.0055;
          phi = THREE.MathUtils.clamp(phi - dy * 0.0055, 0.2, 1.62);
        } else if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          if (a && b) {
            const distance = Math.hypot(a.x - b.x, a.y - b.y);
            if (pinchDistance > 0 && distance > 0) {
              radius = THREE.MathUtils.clamp(
                radius * (pinchDistance / distance),
                minRadius,
                maxRadius,
              );
            }
            pinchDistance = distance;
          }
        }
      };
      const endPointer = (event: PointerEvent) => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchDistance = 0;
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId);
        }
        if (pointers.size === 0) canvas.style.cursor = "grab";
      };
      const onWheel = (event: WheelEvent) => {
        event.preventDefault();
        radius = THREE.MathUtils.clamp(
          radius * (1 + event.deltaY * 0.0011),
          minRadius,
          maxRadius,
        );
        markInteraction();
      };

      canvas.addEventListener("pointerdown", onPointerDown);
      canvas.addEventListener("pointermove", onPointerMove);
      canvas.addEventListener("pointerup", endPointer);
      canvas.addEventListener("pointercancel", endPointer);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      cleanupFns.push(() => {
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", endPointer);
        canvas.removeEventListener("pointercancel", endPointer);
        canvas.removeEventListener("wheel", onWheel);
      });

      resetRef.current = () => {
        theta = home.theta;
        phi = home.phi;
        radius = home.radius;
        markInteraction();
      };
      cleanupFns.push(() => {
        resetRef.current = () => undefined;
      });

      // --- Render loop with idle auto-rotate (never with reduced motion). ---
      const clock = new THREE.Clock();
      const animate = () => {
        if (disposed) return;
        const dt = Math.min(clock.getDelta(), 0.05);
        if (!reducedMotion && performance.now() - lastInteraction > 3000) {
          theta += dt * 0.14;
        }
        applyCamera();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(animate);
      };

      resize();
      applyCamera();
      markInteraction();
      if (!disposed) {
        setStatus("ready");
        raf = requestAnimationFrame(animate);
      }

      cleanupFns.push(() => {
        disposeModel(model, THREE);
        scene.remove(model);
      });
    }

    setStatus("loading");
    void init();

    return () => {
      disposed = true;
      if (raf !== 0) cancelAnimationFrame(raf);
      for (const fn of cleanupFns) {
        try {
          fn();
        } catch {
          // Cleanup must never throw during unmount.
        }
      }
      cleanupFns.length = 0;
      for (const resource of disposables) {
        try {
          resource.dispose();
        } catch {
          // Disposal must never throw during unmount.
        }
      }
      disposables.length = 0;
    };
  }, [hasUrl, modelUrl, webglOk, attempt, reducedMotion]);

  if (!hasUrl) return null;

  if (webglOk === false) {
    return (
      <div className={`flex items-center justify-center ${className ?? "aspect-square"}`}>
        <p className="max-w-xs text-center text-sm text-muted-foreground">
          العرض ثلاثي الأبعاد غير مدعوم على هذا الجهاز.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? "aspect-square"}`}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 block h-full w-full touch-none"
        style={{ cursor: status === "ready" ? "grab" : "default" }}
        aria-label="عارض المنتج ثلاثي الأبعاد — اسحب للتدوير"
      />

      {status === "loading" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/40">
          <div
            className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground"
            role="status"
            aria-label="جارٍ تحميل الموديل"
          />
          <p className="text-sm text-muted-foreground">جارٍ تحميل الموديل…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/60 p-6 text-center">
          <p className="max-w-xs text-sm text-muted-foreground">
            تعذّر تحميل الموديل ثلاثي الأبعاد. تحقق من الاتصال أو من رابط الملف.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((n) => n + 1)}
            className="rounded-full border border-border px-4 py-1.5 text-sm text-foreground transition-colors hover:bg-muted"
          >
            إعادة المحاولة
          </button>
        </div>
      )}

      {status === "ready" && (
        <>
          <p className="pointer-events-none absolute bottom-3 left-3 text-xs text-muted-foreground/80">
            اسحب للتدوير · عجلة الفأرة للتقريب
          </p>
          <button
            type="button"
            onClick={() => resetRef.current()}
            aria-label="إعادة ضبط العرض"
            title="إعادة ضبط العرض"
            className="absolute bottom-3 right-3 z-10 flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
          >
            <RotateCcw className="size-4" aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}
