import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { getTranslations } from "@/lib/i18n";
import { useDeviceTier } from "@/hooks/use-device-tier";
import type { SupportedLocale } from "@/config/platform";

/**
 * HeroScene — a real WebGL (raw three.js, no react-three-fiber) hero scene.
 *
 * A "Spatial Product Showcase": floating 3D cards textured with REAL product
 * images, drifting in the bronze/editorial luxury language. When no product
 * images are available the cards fall back to abstract bronze slabs.
 *
 * Key/fill/rim lighting rig, drifting champagne particles, pointer parallax,
 * horizontal drag to tilt the card group, and a gentle vertical drift tied to
 * page scroll. Transparent background so it blends into the page design.
 *
 * The scene is decorative (`aria-hidden`); keyboard users and screen readers
 * get the static editorial hero content, which is the real content.
 *
 * Loading: `three` is dynamically imported inside `init()` (lazy chunk, never
 * in the main bundle) and the component stays invisible if the import fails.
 */

/** Real product imagery for the showcase cards. */
export interface HeroShowcaseProduct {
  imagePath: string;
  name: string;
  slug: string;
}

// Modalia luxury palette: dark bronze, champagne, ivory, deep charcoal.
const CARD_COLORS = [0x1b1510, 0xd9c193, 0xf1e9da, 0x8a6f45, 0x2c241b] as const;
const GOLD_ACCENT = 0xc9a961;
const PARTICLE_COUNT_FULL = 200;
const PARTICLE_COUNT_LITE = 60;

/** Render quality: "full" for high-tier devices, "lite" (fewer particles,
 *  capped pixel ratio, no MSAA) for mid-tier devices. */
export type HeroSceneQuality = "full" | "lite";

export function HeroScene({
  className,
  locale,
  quality = "full",
  products = [],
}: {
  className?: string;
  locale: SupportedLocale;
  quality?: HeroSceneQuality;
  products?: HeroShowcaseProduct[];
}) {
  const t = getTranslations(locale).viewer3d;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const resetRef = useRef<() => void>(() => undefined);
  const { tier, reducedMotion, webgl } = useDeviceTier();
  const [ready, setReady] = useState(false);

  // Eligible on high (full) and mid (lite) tier devices with WebGL and no
  // reduced motion; low / data-saver keep the static 2.5D CSS fallback.
  const eligible = (tier === "high" || tier === "mid") && webgl && !reducedMotion;

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
      let RoundedBoxGeometry: (new (
        width: number,
        height: number,
        depth: number,
        segments: number,
        radius: number,
      ) => import("three").BoxGeometry) | null = null;
      try {
        // Lazy chunk: `three` is never in the main bundle.
        THREE = await import("three");
        // Rounded cards feel like products; fall back to sharp boxes if the
        // addon chunk fails to load.
        try {
          const addon = await import("three/addons/geometries/RoundedBoxGeometry.js");
          RoundedBoxGeometry = addon.RoundedBoxGeometry;
        } catch {
          RoundedBoxGeometry = null;
        }
      } catch {
        return; // three failed to load: stay invisible, never throw.
      }
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: quality !== "lite",
        powerPreference: "low-power",
      });
      rendererRef = renderer;
      renderer.setPixelRatio(
        Math.min(window.devicePixelRatio || 1, quality === "lite" ? 1.25 : 2),
      );
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

      // --- Floating product showcase cards. ---
      const world = new THREE.Group();
      scene.add(world);

      const CARD_DEPTH = 0.16;

      const cardSpecs = [
        { w: 1.7, h: 2.4, x: -2.9, y: 0.55, z: -0.8, ry: 0.28 },
        { w: 1.9, h: 2.6, x: -0.95, y: -0.25, z: 0.5, ry: -0.12 },
        { w: 1.7, h: 2.4, x: 0.95, y: 0.6, z: -0.4, ry: 0.16 },
        { w: 1.9, h: 2.6, x: 2.9, y: -0.35, z: 0.3, ry: -0.24 },
      ];

      const textureLoader = new THREE.TextureLoader();
      textureLoader.setCrossOrigin("anonymous");

      /** Cover-fit UVs so the product image fills the card face like a photo. */
      const applyCoverFit = (
        texture: import("three").Texture,
        faceW: number,
        faceH: number,
      ) => {
        const image = texture.image as { width?: number; height?: number } | undefined;
        const iw = image?.width ?? 0;
        const ih = image?.height ?? 0;
        if (!iw || !ih) return;
        const faceAspect = faceW / faceH;
        const imageAspect = iw / ih;
        if (imageAspect > faceAspect) {
          // Image is wider: crop the sides.
          const repeatX = faceAspect / imageAspect;
          texture.repeat.set(repeatX, 1);
          texture.offset.set((1 - repeatX) / 2, 0);
        } else {
          // Image is taller: crop top and bottom.
          const repeatY = imageAspect / faceAspect;
          texture.repeat.set(1, repeatY);
          texture.offset.set(0, (1 - repeatY) / 2);
        }
      };

      const cards: Array<{
        group: import("three").Group;
        baseY: number;
        baseRy: number;
        phase: number;
        speed: number;
      }> = [];

      cardSpecs.forEach((spec, index) => {
        const group = new THREE.Group();
        const product = products[index];

        const geometry = RoundedBoxGeometry
          ? track(new RoundedBoxGeometry(spec.w, spec.h, CARD_DEPTH, 3, 0.045))
          : track(new THREE.BoxGeometry(spec.w, spec.h, CARD_DEPTH));
        const bodyMaterial = track(
          new THREE.MeshStandardMaterial({
            color: CARD_COLORS[index % CARD_COLORS.length] ?? 0x1b1510,
            roughness: 0.42,
            metalness: 0.28,
          }),
        );
        group.add(new THREE.Mesh(geometry, bodyMaterial));

        if (product?.imagePath) {
          // Real product image on the card face, slightly inset.
          const faceW = spec.w * 0.86;
          const faceH = spec.h * 0.86;
          const faceGeo = track(new THREE.PlaneGeometry(faceW, faceH));
          const faceMat = track(
            new THREE.MeshStandardMaterial({
              color: 0x1b1510, // placeholder until the texture arrives
              roughness: 0.5,
              metalness: 0.08,
            }),
          );
          const face = new THREE.Mesh(faceGeo, faceMat);
          face.position.z = CARD_DEPTH / 2 + 0.004;
          group.add(face);

          textureLoader.load(
            product.imagePath,
            (texture) => {
              if (disposed) {
                texture.dispose();
                return;
              }
              texture.colorSpace = THREE.SRGBColorSpace;
              texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
              applyCoverFit(texture, faceW, faceH);
              track(texture);
              faceMat.map = texture;
              faceMat.color.set(0xffffff);
              faceMat.needsUpdate = true;
            },
            undefined,
            () => {
              // Image failed (CORS/network): keep the bronze placeholder face.
            },
          );
        }

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
        strip.position.set(0, spec.h / 2 - 0.28, CARD_DEPTH / 2 + 0.012);
        group.add(strip);

        // Subtle edge outline for definition against dark backgrounds.
        const edgeGeo = track(new THREE.EdgesGeometry(geometry, 25));
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

      // --- Champagne dust particles (reduced count on lite quality). ---
      const particleCount = quality === "lite" ? PARTICLE_COUNT_LITE : PARTICLE_COUNT_FULL;
      const positions = new Float32Array(particleCount * 3);
      for (let i = 0; i < particleCount; i++) {
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
        // Touch stays free for page scrolling; drag-to-rotate is a mouse/pen
        // interaction only. (Canvas CSS is `touch-pan-y` so vertical swipes
        // scroll the page instead of being swallowed by the scene.)
        if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
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
  }, [eligible, quality, products]);

  if (!eligible) return null;

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden ${className ?? ""}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-pan-y" />
      {ready && (
        <button
          type="button"
          onClick={() => resetRef.current()}
          aria-label={t.resetScene}
          title={t.resetScene}
          className="absolute bottom-3 end-3 z-10 flex size-10 items-center justify-center rounded-full border border-white/20 bg-black/30 text-white/80 backdrop-blur-sm transition-colors hover:bg-black/50 hover:text-white"
        >
          <RotateCcw className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
