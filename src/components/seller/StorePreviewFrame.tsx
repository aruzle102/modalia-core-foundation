import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/**
 * Non-interactive scaled render frame for the Studio preview.
 *
 * Renders its children at an exact device width (e.g. 1280 / 768 / 390) and
 * scales the result down with a CSS transform so it fits the available space.
 * Pointer events are disabled and the frame is `inert` so nothing inside can
 * be focused or activated — it is a pure visual preview of real pixels.
 *
 * Note: media queries respond to the real viewport, not the frame width, so
 * responsive breakpoints inside the frame follow the viewport. The frame is
 * labelled honestly as a scaled preview.
 */
export function StorePreviewFrame({
  width,
  label,
  children,
}: {
  width: number;
  label: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const containerWidth = containerRef.current?.clientWidth ?? width;
      setScale(Math.min(1, containerWidth / width));
      const content = contentRef.current;
      if (content) setContentHeight(content.scrollHeight);
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (containerRef.current) observer.observe(containerRef.current);
    if (contentRef.current) observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [width, children]);

  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-muted/40 p-4">
      <p className="mb-3 text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label} · {width}px
      </p>
      <div ref={containerRef} className="w-full overflow-hidden rounded-xl border border-border bg-background shadow-sm">
        <div style={{ height: contentHeight * scale }} className="relative">
          <div
            ref={contentRef}
            inert
            aria-label={`${label} storefront preview (non-interactive)`}
            className="pointer-events-none select-none"
            style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
