import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { getTranslations } from "@/lib/i18n";
import type { SupportedLocale } from "@/config/platform";

/**
 * HeroScene — a real WebGL (raw three.js, no react-three-fiber) hero scene.
 *
 * Floating product cards rendered as lit MeshStandardMaterial boxes with a
 * key/fill/rim lighting rig, drifting champagne particles, pointer parallax,
 * horizontal drag to tilt the card group, and a gentle vertical drift tied to
 * page scroll. Transparent background so it blends into the page design.
 *
 * Contract note (worker 2/6, phase 3/4): the shared `useDeviceTier()` hook
 * from `@/hooks/use-device-tier` and `loadThree()` from `@/lib/three-loader`
 * did not exist yet when this was written, so a local fallback with the same
 * contract shape is embedded below. Swap it for the shared hook when it lands.
 */

type DeviceTier = "high" | "mid" | "low" | "data-saver";

interface DeviceInfo {
  tier: DeviceTier;
  reducedMotion: boolean;
  webgl: boolean;
}

function detectDeviceInfo(): DeviceInfo {
  if (typeof window === "undefined") {
    return { tier: "low", reducedMotion: false, webgl: false };
  }
  const reducedMotion =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let webgl = false;
  try {
    const canvas = document.createElement("canvas");
    webgl = canvas.getContext("webgl2") !== null || canvas.getContext("webgl") !== null;
  } catch {
    webgl = false;
  }
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean };
    deviceMemory?: number;
  };
  if (nav.connection?.saveData === true) {
    return { tier: "data-saver", reducedMotion, webgl };
  }
  const cores = navigator.hardwareConcurrency ?? 4;
  const memoryGb = nav.deviceMemory ?? 4;
  if (cores >= 8 && memoryGb >= 8) return { tier: "high", reducedMotion, webgl };
  if (cores >= 6 || memoryGb >= 6) return { tier: "mid", reducedMotion, webgl };
  return { tier: "low", reducedMotion, webgl };
}

/** Local fallback for `@/hooks/use-device-tier` — same contract. */
function useDeviceTier(): DeviceInfo {
  const [info, setInfo] = useState<DeviceInfo>({ tier: "low", reducedMotion: false, webgl: false });
  useEffect(() => {
    setInfo(detectDeviceInfo());
  }, []);
  return info;
}

// Modalia luxury palette: dark bronze, champagne, ivory, deep charcoal.
const CARD_COLORS = [0x1b1510, 0xd9c193, 0xf1e9da, 0x8a6f45, 0x2c241b] as const;
const GOLD_ACCENT = 0xc9a961;
const PARTICLE_COUNT = 200;

export function HeroScene({ className, locale }: { className?: string; locale: SupportedLocale }) {
  const t = getTranslations(locale).viewer3d;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const { tier, reducedMotion, webgl } = useDeviceTier();
  const [ready, setReady] = useState(false);

  // Only ever initialise on high-tier devices with WebGL and no reduced motion.
  const eligible = tier === "high" && webgl && !reducedMotion;

  useEffect(() => {
    if (!eligible) return;
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

    // Mutable interaction state, read by the render loop.
    const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
    let groupTilt = 0;
    let groupTiltTarget = 0;
    let scrollOffset = 0;
    let dragging = false;
    let lastPointerX = 0;

    const setSizes = (
      renderer: import("three").WebGLRenderer,
      camera: import("three").PerspectiveCamera,
    ) => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const startLoop = () => {
      if (raf !== 0 || disposed) return;
      raf = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      if (raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    // The render loop is defined inside `init` (it needs the scene objects),
    // but start/stop must exist before the IntersectionObserver below. We wire
    // them through a mutable slot.
    const loopSlot: { current: (() => void) | null } = { current: null };
    function loop() {
      raf = 0;
      loopSlot.current?.();
    }

    let rendererRef: import("three").WebGLRenderer | null = null;

    async function init() {
      let THREE: typeof import("three");
      try {
        // Local fallback for `@/lib/three-loader`'s loadThree().
        THREE = await import("three");
      } catch {
        return; // three failed to load: stay invisible, never throw.
      }
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
      rendererRef = renderer;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setClearColor(0x000000, 0);
      track(renderer);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
      camera.position.set(0, 0.4, 9);
      setSizes(renderer, camera);

      // --- Lighting rig: key + soft fill + warm rim from behind. ---
      const keyLight = new THREE.DirectionalLight(0xfff2df, 2.4);
      keyLight.position.set(4, 6, 5);
      scene.add(keyLight);

      const fillLight = new THREE.AmbientLight(0xbfb49a, 0.55);
      scene.add(fillLight);

      const rimLight = new THREE.SpotLight(0xffe0ae, 140, 60, Math.PI / 5, 0.55, 1.6);
      rimLight.position.set(-7, 4, -7);
      scene.add(rimLight);
      scene.add(rimLight.target);

      // --- Floating product cards. ---
      const world = new THREE.Group();
      scene.add(world);

      const cardSpecs = [
        { w: 1.7, h: 2.4, x: -2.9, y: 0.55, z: -0.8, ry: 0.28 },
        { w: 1.9, h: 2.6, x: -0.95, y: -0.25, z: 0.5, ry: -0.12 },
        { w: 1.7, h: 2.4, x: 0.95, y: 0.6, z: -0.4, ry: 0.16 },
        { w: 1.9, h: 2.6, x: 2.9, y: -0.35, z: 0.3, ry: -0.24 },
      ];

      const cards: Array<{
        group: import("three").Group;
        baseY: number;
        baseRy: number;
        phase: number;
        speed: number;
      }> = [];

      cardSpecs.forEach((spec, index) => {
        const group = new THREE.Group();
        const color = CARD_COLORS[index % CARD_COLORS.length] ?? 0x1b1510;

        const geometry = track(new THREE.BoxGeometry(spec.w, spec.h, 0.18));
        const material = track(
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.42,
            metalness: 0.28,
          }),
        );
        const card = new THREE.Mesh(geometry, material);
        group.add(card);

        // Thin gold accent strip across the top — reads as a product label.
        const stripGeo = track(new THREE.BoxGeometry(spec.w * 0.62, 0.07, 0.02));
        const stripMat = track(
          new THREE.MeshStandardMaterial({
            color: GOLD_ACCENT,
            roughness: 0.25,
            metalness: 0.85,
          }),
        );
        const strip = new THREE.Mesh(stripGeo, stripMat);
        strip.position.set(0, spec.h / 2 - 0.28, 0.1);
        group.add(strip);

        // Subtle edge outline for definition against dark backgrounds.
        const edgeGeo = track(new THREE.EdgesGeometry(geometry));
        const edgeMat = track(
          new THREE.LineBasicMaterial({ color: GOLD_ACCENT, transparent: true, opacity: 0.28 }),
        );
        group.add(new THREE.LineSegments(edgeGeo, edgeMat));

        group.position.set(spec.x, spec.y, spec.z);
        group.rotation.y = spec.ry;
        world.add(group);
        cards.push({
          group,
          baseY: spec.y,
          baseRy: spec.ry,
          phase: index * 1.7,
          speed: 0.55 + index * 0.09,
        });
      });

      // --- Champagne dust particles. ---
      const positions = new Float32Array(PARTICLE_COUNT * 3);
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 13;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 7;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 7;
      }
      const particleGeo = track(new THREE.BufferGeometry());
      particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const particleMat = track(
        new THREE.PointsMaterial({
          color: 0xd9c193,
          size: 0.035,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
          sizeAttenuation: true,
        }),
      );
      const particles = new THREE.Points(particleGeo, particleMat);
      scene.add(particles);

      // --- Interaction handlers. ---
      const onPointerMove = (event: PointerEvent) => {
        const rect = container.getBoundingClientRect();
        const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = ((event.clientY - rect.top) / rect.height) * 2 - 1;
        pointer.targetX = nx * 0.9;
        pointer.targetY = -ny * 0.55;
        if (dragging) {
          const dx = event.clientX - lastPointerX;
          lastPointerX = event.clientX;
          groupTiltTarget = THREE.MathUtils.clamp(groupTiltTarget + dx * 0.004, -0.7, 0.7);
        }
      };
      const onPointerDown = (event: PointerEvent) => {
        dragging = true;
        lastPointerX = event.clientX;
        container.setPointerCapture(event.pointerId);
      };
      const onPointerUp = (event: PointerEvent) => {
        dragging = false;
        if (container.hasPointerCapture(event.pointerId)) {
          container.releasePointerCapture(event.pointerId);
        }
      };
      const onScroll = () => {
        scrollOffset = window.scrollY;
      };
      const onResize = () => setSizes(renderer, camera);

      container.addEventListener("pointermove", onPointerMove);
      container.addEventListener("pointerdown", onPointerDown);
      container.addEventListener("pointerup", onPointerUp);
      container.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onResize);

      resetRef.current = () => {
        pointer.targetX = 0;
        pointer.targetY = 0;
        groupTiltTarget = 0;
      };

      // --- Render loop (paused when off-screen). ---
      const clock = new THREE.Clock();
      loopSlot.current = () => {
        if (disposed) return;
        const t = clock.getElapsedTime();

        pointer.x += (pointer.targetX - pointer.x) * 0.06;
        pointer.y += (pointer.targetY - pointer.y) * 0.06;
        groupTilt += (groupTiltTarget - groupTilt) * 0.08;

        camera.position.x = pointer.x;
        camera.position.y = 0.4 + pointer.y;
        camera.lookAt(0, 0, 0);

        world.rotation.y = groupTilt;
        // Scroll gently lifts the whole scene so it drifts with the page.
        world.position.y = -Math.min(scrollOffset, 1400) * 0.0011;

        for (const card of cards) {
          card.group.position.y = card.baseY + Math.sin(t * card.speed + card.phase) * 0.24;
          card.group.rotation.y = card.baseRy + Math.sin(t * 0.32 + card.phase) * 0.07;
        }
        particles.rotation.y = t * 0.018;
        particles.position.y = Math.sin(t * 0.22) * 0.25;

        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };

      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting) startLoop();
          else stopLoop();
        },
        { threshold: 0.05 },
      );
      observer.observe(container);

      setSizes(renderer, camera);
      onScroll();
      if (!disposed) {
        setReady(true);
        startLoop();
      }

      // Cleanup wiring returned below.
      if (!disposed) {
        cleanupRef.current = () => {
          observer.disconnect();
          container.removeEventListener("pointermove", onPointerMove);
          container.removeEventListener("pointerdown", onPointerDown);
          container.removeEventListener("pointerup", onPointerUp);
          container.removeEventListener("pointercancel", onPointerUp);
          window.removeEventListener("scroll", onScroll);
          window.removeEventListener("resize", onResize);
          resetRef.current = () => undefined;
        };
      }
    }

    const cleanupRef: { current: (() => void) | null } = { current: null };

    void init();

    return () => {
      disposed = true;
      stopLoop();
      cleanupRef.current?.();
      for (const resource of disposables) {
        try {
          resource.dispose();
        } catch {
          // Disposal must never throw during unmount.
        }
      }
      disposables.length = 0;
      if (rendererRef) {
        try {
          rendererRef.forceContextLoss();
        } catch {
          // Some drivers throw on forced context loss; the context is gone anyway.
        }
        rendererRef = null;
      }
      setReady(false);
    };
  }, [eligible]);

  if (!eligible) return null;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
      {ready && (
        <button
          type="button"
          onClick={() => resetRef.current()}
          aria-label={t.resetScene}
          title={t.resetScene}
          className="absolute bottom-3 end-3 z-10 flex size-8 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
