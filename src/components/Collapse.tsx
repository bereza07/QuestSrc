import { useLayoutEffect, useRef, type ReactNode } from "react";

// Smooth accordion. Uses a large fixed max-height (transitions reliably in
// every browser, unlike grid-template-rows or 'auto') and a pre-warm layout
// pass on mount so the very first open doesn't jitter from a cold subtree.
//
// The children are always mounted; when closed we clip them with overflow
// hidden and drop opacity. Opening is a single max-height + opacity tween.
export function Collapse({
  open,
  children,
  duration = 220,
  maxOpenHeight = 2000,
}: {
  open: boolean;
  children: ReactNode;
  duration?: number;
  /** Cap for the open-state max-height. Bump if a form ever exceeds ~2000px. */
  maxOpenHeight?: number;
}) {
  const inner = useRef<HTMLDivElement>(null);

  // Pre-warm: force the browser to lay out the collapsed subtree once on
  // mount. Reading a layout property is enough — browsers cache the result and
  // the first real open transition then has nothing new to compute under time
  // pressure. Without this the first click after page-load lags visibly.
  useLayoutEffect(() => {
    inner.current?.getBoundingClientRect();
  }, []);

  return (
    <div
      style={{
        maxHeight: open ? `${maxOpenHeight}px` : "0px",
        opacity: open ? 1 : 0,
        overflow: "hidden",
        transition: `max-height ${duration}ms ease-out, opacity ${duration}ms ease-out`,
      }}
      aria-hidden={!open}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
