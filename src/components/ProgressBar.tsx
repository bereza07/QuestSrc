interface ProgressBarProps {
  value: number; // 0..1
  className?: string;
  tone?: "accent" | "arcane" | "streak" | "success";
  height?: number;
}

// Thin (default 6px) rounded progress bar. The new visual system has one
// accent, so all tones collapse to accent visually — success/danger are
// available if a future feature really wants a signal color, but by default
// everything reads as "amount of accent" without shouting.
const toneClass: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "bg-accent",
  arcane: "bg-accent",
  streak: "bg-accent",
  success: "bg-success",
};

export function ProgressBar({
  value,
  className = "",
  tone = "accent",
  height = 6,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-surface-2 ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-300 ease-out ${toneClass[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
