import { useEffect, useRef } from "react";

export type ShortcutHandler = (e: KeyboardEvent) => void;
/** Key descriptors: "j", "shift+/", "escape", "mod+enter" (mod = ⌘ on macOS, Ctrl elsewhere). */
export type ShortcutMap = Record<string, ShortcutHandler>;

const EDITABLE = /^(INPUT|TEXTAREA|SELECT)$/;

/** True when the event originates from a text field, where single-letter shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el !== "object") return false;
  if (EDITABLE.test(el.tagName ?? "")) return true;
  return !!el.isContentEditable;
}

/** Normalises a KeyboardEvent to a descriptor like "shift+/" or "mod+k". */
export function describeKey(e: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey">): string {
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("mod");
  if (e.altKey) parts.push("alt");
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
  // Shift is implicit for characters that need it ("?" is shift+/ on most layouts), explicit for letters.
  if (e.shiftKey && e.key.length !== 1) parts.push("shift");
  if (e.shiftKey && /^[a-z]$/i.test(e.key)) parts.push("shift");
  parts.push(key);
  return parts.join("+");
}

/** Dispatches a key event to a shortcut map; returns true when a handler ran. Pure, testable. */
export function dispatchShortcut(map: ShortcutMap, e: KeyboardEvent, opts: { allowInInputs?: string[] } = {}): boolean {
  const desc = describeKey(e);
  const alt = e.key === "?" ? "?" : desc;
  const h = map[desc] ?? map[alt];
  if (!h) return false;
  if (isTypingTarget(e.target) && !(opts.allowInInputs ?? ["escape"]).includes(desc)) return false;
  h(e);
  return true;
}

/**
 * Page-level keyboard shortcuts. Handlers are read from a ref, so the map can change every render
 * without re-binding the listener.
 */
export function useShortcuts(map: ShortcutMap, enabled = true): void {
  const ref = useRef(map);
  ref.current = map;
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      if (dispatchShortcut(ref.current, e)) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);
}

/** Moves roving focus across elements matching `selector` inside `root`, wrapping at the ends. */
export function moveFocus(root: ParentNode | null, selector: string, delta: 1 | -1): HTMLElement | null {
  if (!root) return null;
  const items = [...root.querySelectorAll<HTMLElement>(selector)];
  if (!items.length) return null;
  const active = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
  const i = active ? items.indexOf(active) : -1;
  const next = i === -1 ? (delta === 1 ? 0 : items.length - 1) : (i + delta + items.length) % items.length;
  const el = items[next]!;
  el.focus();
  el.scrollIntoView?.({ block: "nearest" });
  return el;
}
