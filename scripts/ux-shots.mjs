// UI screenshots at desktop, tablet and phone sizes, for UX review.
// Usage: node scripts/ux-shots.mjs [url] [outDir] [sizes, e.g. 1440,390]
import puppeteer from "puppeteer-core";
import fs from "fs";
import path from "path";

const URL = process.argv[2] || "http://localhost:3020/";
const OUT = process.argv[3] || "docs/ux/after";
const ONLY = process.argv[4] ? process.argv[4].split(",").map(Number) : null;
const CHROME = process.env.CHROME || (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : "/usr/bin/google-chrome");
fs.mkdirSync(OUT, { recursive: true });

const sizes = [
  { name: "desktop-1920", width: 1920, height: 1080, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: "desktop-1440", width: 1440, height: 900, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
  { name: "tablet-768", width: 768, height: 1024, isMobile: true, hasTouch: true, deviceScaleFactor: 1 },
  { name: "phone-390", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
].filter((s) => !ONLY || ONLY.includes(s.width));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const metrics = {};
for (const s of sizes) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.setViewport(s);
  // phones: 4× CPU slowdown as a rough stand-in for a mid-range device when reading the visual frame cost
  if (s.width < 600) await page.emulateCPUThrottling(4);
  await page.goto(URL, { waitUntil: "networkidle0" });
  const full = (n) => page.screenshot({ path: path.join(OUT, `${s.name}-${n}.png`), fullPage: true });
  const view = (n) => page.screenshot({ path: path.join(OUT, `${s.name}-${n}.png`) });
  const clickText = (t, root = "body") =>
    page.evaluate(
      (txt, r) => {
        const b = [...document.querySelector(r).querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(txt));
        b?.click();
        return !!b;
      },
      t,
      root
    );
  await sleep(600);
  await full("1-empty");
  await page.$eval("textarea", (el) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, "dark techno warehouse at 3am");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await clickText("Generate");
  await sleep(3000);
  await view("2-song");
  await full("2-song-full");
  await clickText("🔥 Go wild");
  await sleep(3000);
  await view("3-go-wild");
  await full("3-go-wild-full");
  if (s.isMobile && s.width < 600) {
    for (let i = 1; i < 4; i++) {
      await page.evaluate((y) => window.scrollTo(0, y), i * (s.height - 120));
      await sleep(250);
      await view(`3-screen${i + 1}`);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await clickText("Spectrum", "[data-testid=master-visual]");
  await sleep(900);
  await page.$eval("[data-testid=master-visual]", (e) => e.scrollIntoView({ block: "center" }));
  await sleep(300);
  await view("5-spectrum");
  await clickText("Spectrogram", "[data-testid=master-visual]");
  await sleep(2500);
  await view("5-spectrogram");
  await clickText("Scope", "[data-testid=master-visual]");
  await page.evaluate(() => [...document.querySelectorAll("[data-testid=identity-rows] button")][0]?.click());
  await sleep(500);
  await view("4-option-sheet");
  await page.type("[role=dialog] input[type=search]", "tech");
  await sleep(300);
  await view("4-option-sheet-search");
  metrics[s.name] = await page.evaluate(() => {
    const main = document.querySelector("main");
    const r = main.getBoundingClientRect();
    const small = [...document.querySelectorAll("main button, [data-testid=transport] button")]
      .filter((b) => b.offsetParent && !b.closest("[data-testid=arrangement-lanes]"))
      .map((b) => b.getBoundingClientRect())
      .filter((b) => b.height < 44 || b.width < 44).length;
    return {
      viewport: window.innerWidth,
      contentWidth: Math.round(r.width),
      pageHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth - window.innerWidth,
      buttonsUnder44: small,
      visualCost: window.__visualCost?.(),
    };
  });
  metrics[s.name].errors = errors;
  await ctx.close();
}
await browser.close();
console.log(JSON.stringify(metrics, null, 1));
