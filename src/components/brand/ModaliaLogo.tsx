import { cn } from "@/lib/utils";

/**
 * MODALIA brand logo — always displays fully without cropping, no background.
 * Uses object-contain; in circular containers, padding ensures full visibility.
 * variant="dark" = black logo for light backgrounds
 * variant="light" = white logo for dark backgrounds
 */
export function ModaliLogo({
  className,
  circular = false,
  variant = "dark",
}: {
  className?: string;
  circular?: boolean;
  variant?: "dark" | "light";
}) {
  const src = variant === "light" ? "/brand/modalia-logo-white.png" : "/brand/modalia-logo.png";
  if (circular) {
    return (
      <span
        className={cn(
          "grid shrink-0 place-items-center overflow-hidden rounded-full p-1",
          className
        )}
      >
        <img
          src={src}
          alt="MODALIA"
          className="h-full w-full object-contain"
          draggable={false}
        />
      </span>
    );
  }
  return (
    <img
      src={src}
      alt="MODALIA"
      className={cn("object-contain", className)}
      draggable={false}
    />
  );
}
