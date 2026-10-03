import { describe, expect, it } from "vitest";
import "./index";

type Mgx = { setImage(market: string, dataUrl: string): Promise<string> };
const mgx = () => (window as unknown as { __mgx: Mgx }).__mgx;
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Simulated Taobao: upload shows a preview, only its 搜索 button starts the image search. */
function taobaoPage() {
  document.body.innerHTML = `
    <div class="search-bar"><input name="q" placeholder="搜索"><button class="btn-search">搜索</button>
      <input type="file" accept="image/*" style="display:none"></div>`;
  const log: string[] = [];
  document.querySelector(".btn-search")!.addEventListener("click", () => log.push("text-search"));
  const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
  input.addEventListener("change", () => {
    log.push(`upload:${input.files?.[0]?.name}:${input.files?.[0]?.type}`);
    setTimeout(() => {
      const panel = document.createElement("div");
      panel.className = "image-search-panel";
      panel.innerHTML = `<img src="blob:x"><div id="image-search-upload-button" class="upload-button upload-button-active" data-spm="image_search_button">搜索</div>`;
      document.body.appendChild(panel);
      panel.querySelector("#image-search-upload-button")!.addEventListener("click", () => {
        log.push("image-search");
        history.pushState({}, "", "/search?tab=all&imgfile=1");
      });
    }, 400);
  });
  return log;
}

describe("image upload smoke (simulated pages)", () => {
  it("Taobao: uploads the file with its real type and presses the preview's 搜索 button", async () => {
    const log = taobaoPage();
    const r = await mgx().setImage("cn-taobao", PNG);
    expect(log).toEqual(["upload:query.png:image/png", "image-search"]);
    expect(r).toBe("ok");
    expect(location.href).toContain("imgfile=1");
  }, 20_000);

  it("1688: image lands in the search bar, then the bar's 搜索 button is pressed", async () => {
    history.replaceState({}, "", "/youyuan/index.htm?tab=imageSearch");
    document.body.innerHTML = `
      <form class="search-form"><input name="keywords" placeholder="Ctrl+V 粘贴图片"><input type="file" accept="image/*" style="display:none">
        <button type="submit" class="search-btn">搜索</button></form>`;
    const log: string[] = [];
    const form = document.querySelector("form")!;
    form.addEventListener("submit", (e) => e.preventDefault());
    const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
    input.addEventListener("change", () => {
      log.push("upload");
      const thumb = document.createElement("img");
      form.prepend(thumb);
    });
    document.querySelector(".search-btn")!.addEventListener("click", () => {
      log.push("search");
      history.pushState({}, "", "/youyuan/index.htm?tab=imageSearch&imageId=1");
    });
    const r = await mgx().setImage("cn-1688", PNG);
    expect(log).toEqual(["upload", "search"]);
    expect(r).toBe("ok");
  }, 20_000);
});
