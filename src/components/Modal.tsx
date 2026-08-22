import { useEffect, type ReactNode } from "react";
import { IconX } from "./icons";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}

/** Centered dialog with a subtle scrim. Closes on backdrop click or Escape. */
export function Modal({ title, onClose, children, wide }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-sm sm:p-8"
      onMouseDown={onClose}
    >
      <div
        className={`my-auto w-full ${wide ? "max-w-3xl" : "max-w-xl"} animate-fade-in rounded-lg border border-border bg-surface shadow-pop`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-base font-semibold text-fg">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-fg-3 transition-colors hover:bg-surface-2 hover:text-fg"
            aria-label="Close"
          >
            <IconX size={14} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
