interface ProgressBarProps {
  value: number; // 0..1
  className?: string;
  tone?: "accent" | "arcane" | "streak" | "success";
  height?: number;
}

const toneClass: Record<NonNullable<ProgressBarProps["tone"]>, string> = {
  accent: "bg-accent shadow-glow",
  arcane: "bg-arcane shadow-glow-arcane",
  streak: "bg-streak",
  success: "bg-success",
};

export function ProgressBar({
  value,
  className = "",
  tone = "accent",
  height = 10,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className={`w-full rounded-full bg-bg-soft border border-border overflow-hidden ${className}`}
      style={{ height }}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full rounded-full transition-[width] duration-500 ${toneClass[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
