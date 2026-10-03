import { describe, expect, it } from "vitest";
import { translateChromeError } from "./errors";

describe("translateChromeError", () => {
  it("maps Chrome error pages to a Turkish network failure", () => {
    const r = translateChromeError("Frame with ID 0 is showing error page");
    expect(r.type).toBe("Network");
    expect(r.text).not.toMatch(/Frame with ID/);
    expect(r.text).toMatch(/yüklenemedi/);
  });
  it("maps closed tabs, permission errors and dead ports", () => {
    expect(translateChromeError("No tab with id: 42.").text).toMatch(/kapatıldı/);
    expect(translateChromeError('Cannot access contents of url "https://global.wildberries.ru/x". Extension manifest must request permission to access this host.').text).toContain("global.wildberries.ru");
    expect(translateChromeError("Attempting to use a disconnected port object").text).toMatch(/yenile/);
    expect(translateChromeError("Tabs cannot be edited right now (user may be dragging a tab).").type).toBe("RateLimited");
  });
  it("shortens unknown messages", () => {
    const r = translateChromeError("x".repeat(500));
    expect(r.text.length).toBeLessThan(160);
    expect(r.text).toMatch(/^Beklenmeyen hata/);
  });
});
