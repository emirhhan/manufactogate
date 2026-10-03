// @vitest-environment happy-dom
import { expect, it } from "vitest";
import { parsePrice } from "../src/dom/text";
import { extractCards } from "../src/dom/cards";
it("price labels: real-world strings parse to the amount shown to the buyer", () => {
  const cases: [string, number][] = [
    ["¥12.50",12.5],["1.299,90 TL",1299.9],["1,299.00",1299],["$1,234.5",1234.5],["12.5-18.9",12.5],["¥ 1.2万",12000],
    ["2 325 ₽",2325],["1.299 TL",1299],["12,99 €",12.99],["€ 1.234,56",1234.56],["¥99.00",99],["US $3.45",3.45],
    ["₩12,900",12900],["Rp 125.000",125000],["Rp125.000 - Rp200.000",125000],["฿1,290",1290],["¥1,980",1980],
    ["1.234",1234],["0.99",0.99],["3.999,00 TL",3999],["12.345,6",12345.6],["$12.3",12.3],["129,-",129],
    ["满2件9.5折 ¥45.80",45.8],["券后¥39.9",39.9],["月销1000+ ¥15",15],["2件起批 ¥8.80",8.8],
  ];
  const bad: string[] = [];
  for (const [s, want] of cases) { const got = parsePrice(s); if (got !== want) bad.push(`${s} -> ${got} (want ${want})`); }
  expect(bad).toEqual([]);
});

it("card images: lazy placeholders and flag attributes are skipped, the largest srcset entry wins", () => {
  document.body.innerHTML = `
    <div class="item"><a href="https://detail.1688.com/offer/111.html"><img src="//g.alicdn.com/s.gif" data-ks-lazyload="//cbu01.alicdn.com/img/a.jpg"><span>保温杯 不锈钢 大容量</span></a><b>¥12.50</b></div>
    <div class="item"><a href="https://detail.1688.com/offer/222.html"><img src="/img/loading.gif" srcset="https://cbu01.alicdn.com/img/b-200.jpg 200w, https://cbu01.alicdn.com/img/b-800.jpg 800w"><span>保温杯 双层 真空</span></a><b>¥9.90</b></div>
    <div class="item"><a href="https://detail.1688.com/offer/333.html"><img data-lazy="true" data-img="1" src="https://cbu01.alicdn.com/img/c.jpg"><span>保温杯 儿童 吸管</span></a><b>¥15.00</b></div>`;
  const cards = extractCards(document, { link: /detail\.1688\.com\/offer\/(\d+)\.html/ }, "https://s.1688.com/");
  expect(cards.map((c) => c.image)).toEqual(["https://cbu01.alicdn.com/img/a.jpg", "https://cbu01.alicdn.com/img/b-800.jpg", "https://cbu01.alicdn.com/img/c.jpg"]);
});
