import { create } from "zustand";
import type { ExtensionInfo } from "@/lib/bridge";

interface ExtensionState {
  info: ExtensionInfo;
  set(info: ExtensionInfo): void;
}

export const useExtension = create<ExtensionState>((set) => ({
  info: { installed: false, sessions: {} },
  set: (info) => set({ info }),
}));
