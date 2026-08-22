import { useToastStore, type ToastKind } from "@/stores/toastStore";

// Toast overlay — restrained: surface bg, hairline border, one accent bar for
// XP / achievement / level-up, danger bar for errors. Never colored fills.

const barByKind: Record<ToastKind, string> = {
  xp: "var(--accent)",
  "level-up": "var(--accent)",
  achievement: "var(--accent)",
  info: "var(--border-c)",
  error: "var(--danger)",
};

export function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="pointer-events-auto animate-fade-in cursor-pointer overflow-hidden rounded-md border border-border bg-surface shadow-pop"
        >
          {/* Left accent stripe — sole colour cue. */}
          <div className="flex">
            <div className="w-[3px] shrink-0" style={{ background: barByKind[t.kind] }} />
            <div className="flex-1 px-3 py-2.5">
              <div className="text-sm font-medium text-fg">{t.title}</div>
              {t.detail && <div className="mt-1 text-xs text-fg-2">{t.detail}</div>}
              {t.action && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void t.action!.run();
                    dismiss(t.id);
                  }}
                  className="mt-2 text-xs font-medium text-accent hover:underline"
                >
                  {t.action.label}
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
