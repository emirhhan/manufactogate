// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { describeKey, dispatchShortcut, isTypingTarget, moveFocus } from "./shortcuts";

describe("shortcuts", () => {
  it("describeKey normalises modifiers", () => {
    expect(describeKey({ key: "k", ctrlKey: true, metaKey: false, altKey: false, shiftKey: false })).toBe("mod+k");
    expect(describeKey({ key: "K", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBe("shift+k");
    expect(describeKey({ key: "?", ctrlKey: false, metaKey: false, altKey: false, shiftKey: true })).toBe("?");
    expect(describeKey({ key: "Escape", ctrlKey: false, metaKey: false, altKey: false, shiftKey: false })).toBe("escape");
  });
  it("does not fire single-letter shortcuts while typing, but Escape still works", () => {
    const input = document.createElement("input");
    document.body.append(input);
    const j = vi.fn();
    const esc = vi.fn();
    const map = { j, escape: esc };
    const ev = new KeyboardEvent("keydown", { key: "j", bubbles: true });
    Object.defineProperty(ev, "target", { value: input });
    expect(dispatchShortcut(map, ev)).toBe(false);
    expect(j).not.toHaveBeenCalled();
    const ev2 = new KeyboardEvent("keydown", { key: "Escape", bubbles: true });
    Object.defineProperty(ev2, "target", { value: input });
    expect(dispatchShortcut(map, ev2)).toBe(true);
    expect(esc).toHaveBeenCalled();
    expect(isTypingTarget(input)).toBe(true);
    expect(isTypingTarget(document.body)).toBe(false);
    input.remove();
  });
  it("dispatches to the handler outside inputs", () => {
    const j = vi.fn();
    const ev = new KeyboardEvent("keydown", { key: "j" });
    Object.defineProperty(ev, "target", { value: document.body });
    expect(dispatchShortcut({ j }, ev)).toBe(true);
    expect(j).toHaveBeenCalledTimes(1);
  });
  it("moveFocus walks and wraps through cards", () => {
    const root = document.createElement("div");
    root.innerHTML = `<div data-card><a href="#a">a</a></div><div data-card><a href="#b">b</a></div><div data-card><a href="#c">c</a></div>`;
    document.body.append(root);
    expect(moveFocus(root, "[data-card] a", 1)?.textContent).toBe("a");
    expect(moveFocus(root, "[data-card] a", 1)?.textContent).toBe("b");
    expect(moveFocus(root, "[data-card] a", -1)?.textContent).toBe("a");
    expect(moveFocus(root, "[data-card] a", -1)?.textContent).toBe("c");
    expect(moveFocus(null, "a", 1)).toBeNull();
    root.remove();
  });
});
