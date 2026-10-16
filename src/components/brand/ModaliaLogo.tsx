import { cn } from "@/lib/utils";

/**
 * MODALIA brand logo — always displays fully without cropping.
 * Uses object-contain; in circular containers, padding ensures full visibility.
 */
export function ModaliLogo({
  className,
  circular = false,
}: {
  className?: string;
  circular?: boolean;
}) {
  if (circular) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full bg-white p-1.5",
          className
        )}
      >
        <img
          src="/brand/modalia-logo.jpg"
          alt="MODALIA"
          className="h-full w-full object-contain"
          draggable={false}
        />
      </span>
    );
  }
  return (
    <img
      src="/brand/modalia-logo.jpg"
      alt="MODALIA"
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
