import { create } from "zustand";

export type ToastKind = "xp" | "level-up" | "achievement" | "info" | "error";

export interface ToastAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  action?: ToastAction;
}

interface ToastState {
  toasts: Toast[];
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (toast) => {
    const id = crypto.randomUUID();
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // Auto-dismiss non-error toasts. Actionable toasts (e.g. Undo) linger longer.
    const ttl = toast.action ? 6000 : toast.kind === "level-up" ? 5000 : 3500;
    if (toast.kind !== "error") {
      setTimeout(() => {
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
      }, ttl);
    }
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
