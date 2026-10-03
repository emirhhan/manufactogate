import { beforeEach, describe, expect, it } from "vitest";
import { activitySignature, captchaVisible, findFileInput, findImageConfirm, findImageTrigger, findSearchBox, findSubmitFor, isVisible, supportsPaste } from "./dom";

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("findSearchBox", () => {
  it("finds the Global Sources Element-UI box by its label attribute", () => {
    document.body.innerHTML = `<header><div class="el-input"><input class="el-input__inner" label="Search" type="text" placeholder="retatrutide" id="el-id-1024-40"></div></header>`;
    expect(findSearchBox(document)?.id).toBe("el-id-1024-40");
  });
  it("finds Amazon's twotabsearchtextbox and Noon's combobox", () => {
    document.body.innerHTML = `<input id="twotabsearchtextbox" name="field-keywords" type="text">`;
    expect(findSearchBox(document)?.id).toBe("twotabsearchtextbox");
    document.body.innerHTML = `<div><input id="search-input" role="combobox" aria-label="What are you looking for?" name="site-search"></div>`;
    expect(findSearchBox(document)?.id).toBe("search-input");
  });
  it("skips hidden inputs that would shadow the visible desktop box", () => {
    document.body.innerHTML = `
      <input type="search" id="mobile" style="display:none" name="q">
      <header><input type="text" id="desktop" placeholder="Ürün ara"></header>`;
    expect(findSearchBox(document)?.id).toBe("desktop");
  });
  it("uses the header heuristic when no known selector matches and rejects email/coupon fields", () => {
    document.body.innerHTML = `
      <header><input type="text" id="hdr" placeholder="Find products"></header>
      <footer><input type="text" id="mail" placeholder="Your Email"></footer>
      <input type="text" id="coupon" name="coupon">`;
    expect(findSearchBox(document)?.id).toBe("hdr");
  });
  it("returns null when the page has no plausible box", () => {
    document.body.innerHTML = `<form><input type="text" name="email"><input type="password" name="pass"></form>`;
    expect(findSearchBox(document)).toBeNull();
  });
});

describe("findSubmitFor", () => {
  it("prefers the form's submit button and otherwise the nearest search button", () => {
    document.body.innerHTML = `<form><input id="q" name="q"><button type="submit" id="go">Ara</button></form>`;
    expect(findSubmitFor(document.getElementById("q")!)?.id).toBe("go");
    document.body.innerHTML = `<div class="search-box"><input id="q" name="q"><span role="button" class="search-btn" id="b">🔍</span></div>`;
    expect(findSubmitFor(document.getElementById("q")!)?.id).toBe("b");
  });
});

describe("captchaVisible", () => {
  it("ignores invisible reCAPTCHA plumbing", () => {
    document.body.innerHTML = `<textarea id="g-recaptcha-response-100" class="g-recaptcha-response" style="display:none"></textarea><div class="grecaptcha-badge"></div><div>products</div>`;
    expect(captchaVisible(document)).toBe(false);
  });
  it("detects a visible captcha box", () => {
    document.body.innerHTML = `<div id="nocaptcha" style="width:300px;height:80px">请完成滑动验证</div>`;
    expect(captchaVisible(document)).toBe(true);
  });
  it("ignores a hidden captcha container", () => {
    document.body.innerHTML = `<div id="captcha-wrap" style="display:none"></div>`;
    expect(captchaVisible(document)).toBe(false);
  });
});

describe("image helpers", () => {
  it("does not treat review photos as an upload trigger and finds the search-bar camera", () => {
    document.body.innerHTML = `
      <div class="reviews">${"<img class='review-photo'>".repeat(5)}<div class="review-photo-upload">x</div></div>
      <div class="search-box"><input name="q"><button class="image-upload-button-camera" aria-label="Görselle ara"></button></div>`;
    expect(findImageTrigger(document)?.className).toBe("image-upload-button-camera");
    document.body.innerHTML = `<div class="reviews"><div class="review-photo">x</div></div>`;
    expect(findImageTrigger(document)).toBeNull();
  });
  it("finds an image file input and paste hints", () => {
    document.body.innerHTML = `<input type="file" accept="image/*" style="display:none"><input id="q" placeholder="搜索 Ctrl+V 粘贴图片">`;
    expect(findFileInput(document)).not.toBeNull();
    expect(supportsPaste(document, document.getElementById("q"))).toBe(true);
    expect(supportsPaste(document, null)).toBe(false);
  });
});

describe("visibility and activity", () => {
  it("treats disabled, hidden-type and aria-hidden elements as invisible", () => {
    document.body.innerHTML = `<input id="a" disabled><input id="b" type="hidden"><input id="c" aria-hidden="true"><input id="d">`;
    expect(isVisible(document.getElementById("a"))).toBe(false);
    expect(isVisible(document.getElementById("b"))).toBe(false);
    expect(isVisible(document.getElementById("c"))).toBe(false);
    expect(isVisible(document.getElementById("d"))).toBe(true);
  });
  it("signature changes when elements are added", () => {
    const a = activitySignature(document);
    document.body.appendChild(document.createElement("div"));
    expect(activitySignature(document)).not.toBe(a);
  });

  it("finds the search button of an image preview panel, not the plain search-bar button", () => {
    document.body.innerHTML = `
      <div class="search-bar"><input name="q"><button class="btn-search">搜索</button></div>
      <div class="image-search-panel"><img src="x"><div class="pic-btn">搜索</div></div>`;
    expect(findImageConfirm(document)?.className).toBe("pic-btn");
    document.body.innerHTML = `<div class="search-bar"><button>搜索</button></div>`;
    expect(findImageConfirm(document)).toBeNull();
  });
});
