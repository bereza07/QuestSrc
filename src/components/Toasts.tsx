import { useToastStore, type ToastKind } from "@/stores/toastStore";

const kindStyle: Record<ToastKind, string> = {
  xp: "border-accent/40 shadow-glow",
  "level-up": "border-arcane/50 shadow-glow-arcane",
  achievement: "border-accent/40 shadow-glow",
  info: "border-border",
  error: "border-danger/50",
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={`pointer-events-auto cursor-pointer rounded-xl border bg-bg-elevated/95 px-4 py-3
            backdrop-blur ${kindStyle[t.kind]} ${
              t.kind === "level-up" ? "animate-level-up" : "animate-xp-pop"
            }`}
        >
          {t.kind === "level-up" ? (
            <div className="qf-heading text-lg text-accent-glow">{t.title}</div>
          ) : (
            <div className="text-sm font-medium text-ink">{t.title}</div>
          )}
          {t.detail && (
            <div className="mt-1 text-xs text-ink-soft">{t.detail}</div>
          )}
          {t.action && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void t.action!.run();
                dismiss(t.id);
              }}
              className="mt-2 rounded-md border border-accent/50 px-2.5 py-1 text-xs font-medium text-accent-glow hover:bg-accent/10"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
