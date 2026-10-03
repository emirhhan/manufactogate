import { create } from "zustand";

export type ToastTone = "neutral" | "success" | "warning" | "danger";
export interface Toast {
  id: number;
  text: string;
  tone: ToastTone;
  /** Optional link rendered after the text. */
  action?: { label: string; to: string } | undefined;
}

interface ToastState {
  toasts: Toast[];
  push(text: string, opts?: { tone?: ToastTone; action?: Toast["action"]; ttlMs?: number }): number;
  dismiss(id: number): void;
}

let seq = 0;

/** Small, local toasts ("Projeye eklendi", "İzleniyor"); they expire on their own. */
export const useToast = create<ToastState>((set, get) => ({
  toasts: [],
  push(text, opts = {}) {
    const id = ++seq;
    const toast: Toast = { id, text, tone: opts.tone ?? "neutral", action: opts.action };
    set((s) => ({ toasts: [...s.toasts.slice(-3), toast] }));
    const ttl = opts.ttlMs ?? 3500;
    if (ttl > 0 && typeof setTimeout !== "undefined") setTimeout(() => get().dismiss(id), ttl);
    return id;
  },
  dismiss(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export const toast = (text: string, opts?: Parameters<ToastState["push"]>[1]) => useToast.getState().push(text, opts);
