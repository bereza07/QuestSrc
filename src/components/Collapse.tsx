import { useEffect, useRef, useState, type ReactNode } from "react";

// Animated accordion — mounts the child immediately and animates max-height from
// 0 → measured content height (and back), so opening/closing feels smooth
// instead of popping. Overflow-y is auto after the animation so long content
// still scrolls inside its parent.
export function Collapse({
  open,
  children,
  duration = 220,
}: {
  open: boolean;
  children: ReactNode;
  duration?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | "auto">(open ? "auto" : 0);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const contentH = el.scrollHeight;
    setAnimating(true);
    if (open) {
      // Start from 0 → measured; after transition end let it be `auto` so the
      // content can grow (e.g. lists) without needing a new measurement.
      setHeight(0);
      requestAnimationFrame(() => setHeight(contentH));
      const t = setTimeout(() => {
        setHeight("auto");
        setAnimating(false);
      }, duration);
      return () => clearTimeout(t);
    } else {
      // Snap current auto → measured pixel value, then in the next frame → 0.
      setHeight(contentH);
      requestAnimationFrame(() => setHeight(0));
      const t = setTimeout(() => setAnimating(false), duration);
      return () => clearTimeout(t);
    }
  }, [open, duration]);

  return (
    <div
      style={{
        height: typeof height === "number" ? `${height}px` : "auto",
        overflow: animating ? "hidden" : undefined,
        transition: `height ${duration}ms ease-out`,
      }}
    >
      <div ref={ref}>{open || animating ? children : null}</div>
    </div>
  );
}
