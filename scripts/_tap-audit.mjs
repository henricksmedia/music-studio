// Lists visible controls under 44×44 px at phone size after Generate.
import { URL, launch, sleep } from "./_browser.mjs";
const browser = await launch();
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.goto(URL, { waitUntil: "networkidle0" });
await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Generate").click());
await sleep(2500);
await page.evaluate(() => document.querySelectorAll("details").forEach((d) => (d.open = true)));
await sleep(300);
const small = await page.evaluate(() =>
  [...document.querySelectorAll("main button, main select, main input, main summary, [data-testid=transport] button")]
    .filter((b) => b.offsetParent && !b.closest("[data-testid=arrangement-lanes]") && getComputedStyle(b).pointerEvents !== "none")
    .map((b) => ({ r: b.getBoundingClientRect(), t: (b.getAttribute("aria-label") || b.textContent || b.type).trim().slice(0, 30), tag: b.tagName }))
    .filter(({ r, tag }) => r.height < 44 || (tag === "BUTTON" && r.width < 44))
    .map(({ r, t, tag }) => `${tag} ${Math.round(r.width)}×${Math.round(r.height)} ${t}`)
);
console.log(small.join("\n"));
await browser.close();
