import { useEffect, useRef, useState, type PointerEvent } from "react";

// Full-screen image viewer with zoom (wheel / pinch-friendly buttons) and pan
// (drag). Deliberately minimal — no external deps. Works for architecture
// diagrams, references, screenshots. Esc / backdrop click / × to close.

interface Props {
  src: string;
  onClose: () => void;
}

const MIN = 0.2;
const MAX = 8;
const STEP = 1.25;

export function ImageViewer({ src, onClose }: Props) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Mirror the transform in refs. StrictMode may double-invoke state updaters,
  // which broke the zoom-at-cursor math (setTx called from inside setScale's
  // updater ran twice). Reading/writing the refs synchronously avoids that.
  const scaleRef = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function apply(nextScale: number, nextTx: number, nextTy: number) {
    scaleRef.current = nextScale;
    txRef.current = nextTx;
    tyRef.current = nextTy;
    setScale(nextScale);
    setTx(nextTx);
    setTy(nextTy);
  }
  // Track live pointers for two-finger pinch (iOS Safari sends touches as
  // pointer events; two-finger distance change → zoom, midpoint → pan).
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "+" || e.key === "=") apply(clamp(scaleRef.current * STEP), txRef.current, tyRef.current);
      else if (e.key === "-" || e.key === "_") apply(clamp(scaleRef.current / STEP), txRef.current, tyRef.current);
      else if (e.key === "0") reset();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock the page beneath the viewer so wheel/touch on the backdrop can't
  // scroll the underlying task modal. Restored on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Windows middle-click starts OS-level "autoscroll" mode; that scroller runs
  // outside the page's event loop, so our wheel handler can't preventDefault
  // it. Cancel the middle-button mousedown BEFORE autoscroll engages, and swallow
  // the auxclick that follows so nothing else reacts to it.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const swallow = (e: MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener("mousedown", swallow);
    el.addEventListener("auxclick", swallow);
    return () => {
      el.removeEventListener("mousedown", swallow);
      el.removeEventListener("auxclick", swallow);
    };
  }, []);

  // React attaches onWheel as a PASSIVE listener, so e.preventDefault() there
  // is silently ignored and the page keeps scrolling. Bind manually as
  // non-passive to actually stop the scroll while we zoom.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const handler = (e: globalThis.WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      // Cursor position relative to the wrapper's CENTER (matches how the img
      // is centered before applying the translate).
      const mx = e.clientX - rect.left - rect.width / 2;
      const my = e.clientY - rect.top - rect.height / 2;
      const factor = e.deltaY < 0 ? STEP : 1 / STEP;
      const s0 = scaleRef.current;
      const s1 = clamp(s0 * factor);
      if (s1 === s0) return;
      const k = s1 / s0;
      // Keep the pixel currently under the cursor fixed on screen. Derivation:
      // pixel at image-offset u from center is at screen mx if s0*u + tx0 = mx,
      // so u = (mx - tx0)/s0. After zoom to s1 we want s1*u + tx1 = mx, giving
      // tx1 = mx - s1*(mx - tx0)/s0 = mx*(1-k) + tx0*k.
      const tx1 = mx * (1 - k) + txRef.current * k;
      const ty1 = my * (1 - k) + tyRef.current * k;
      apply(s1, tx1, ty1);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  function clamp(v: number) {
    return Math.max(MIN, Math.min(MAX, v));
  }
  function reset() {
    apply(1, 0, 0);
  }

  function pinchDist(): number {
    const [a, b] = [...pointers.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  function onPointerDown(e: PointerEvent) {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      pinchRef.current = { dist: pinchDist(), scale: scaleRef.current };
      dragRef.current = null;
    } else if (pointers.current.size === 1) {
      dragRef.current = { x: e.clientX, y: e.clientY, tx: txRef.current, ty: tyRef.current };
    }
  }
  function onPointerMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinchRef.current) {
      const d = pinchDist();
      if (d > 0) apply(clamp(pinchRef.current.scale * (d / pinchRef.current.dist)), txRef.current, tyRef.current);
      return;
    }
    const d = dragRef.current;
    if (!d) return;
    apply(scaleRef.current, d.tx + (e.clientX - d.x), d.ty + (e.clientY - d.y));
  }
  function onPointerUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    if (pointers.current.size === 0) dragRef.current = null;
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur"
      onClick={onClose}
    >
      <div
        ref={wrapRef}
        className="relative h-full w-full overflow-hidden"
        style={{ touchAction: "none" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt=""
          draggable={false}
          className="pointer-events-none absolute left-1/2 top-1/2 max-h-none max-w-none select-none"
          style={{
            transform: `translate(-50%, -50%) translate(${tx}px, ${ty}px) scale(${scale})`,
            transformOrigin: "center",
            transition: dragRef.current ? "none" : "transform 60ms linear",
            cursor: dragRef.current ? "grabbing" : "grab",
          }}
        />
      </div>

      {/* Controls */}
      <div
        className="fixed bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-surface-2 px-2 py-1 backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <IconBtn label="−" title="Zoom out (−)" onClick={() => apply(clamp(scaleRef.current / STEP), txRef.current, tyRef.current)} />
        <span className="w-14 text-center font-mono text-xs text-fg-2">
          {Math.round(scale * 100)}%
        </span>
        <IconBtn label="+" title="Zoom in (+)" onClick={() => apply(clamp(scaleRef.current * STEP), txRef.current, tyRef.current)} />
        <div className="mx-1 h-4 w-px bg-border" />
        <IconBtn label="⤢" title="Reset (0)" onClick={reset} />
      </div>

      {/* Close */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="fixed right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-border bg-surface-2 text-fg-2 hover:text-fg"
      >
        ×
      </button>
    </div>
  );
}

function IconBtn({
  label,
  title,
  onClick,
}: {
  label: string;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-lg text-fg-2 hover:text-accent"
    >
      {label}
    </button>
  );
}
