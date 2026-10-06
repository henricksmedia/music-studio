// Real-browser smoke test at phone size (390×844): prompts, Go wild + breakdown chips, identity card,
// avoid chips, Groove/Harmony panels, section detail, Copy as prompt, export. Fails on console errors.
import puppeteer from "puppeteer-core";
import fs from "fs";
const URL = process.argv[2] || "http://localhost:3020/";
const dl = "/tmp/ms-dl";
fs.rmSync(dl, { recursive: true, force: true });
fs.mkdirSync(dl, { recursive: true });
fs.mkdirSync("/tmp/ms-shots", { recursive: true });
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: "new", args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
await page.goto(URL, { waitUntil: "networkidle0" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = () => page.$eval('[aria-live="polite"]', (e) => e.textContent);
const clickText = async (txt, root = "body") => {
  const ok = await page.evaluate((t, r) => {
    const b = [...document.querySelector(r).querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t));
    if (b) b.click();
    return !!b;
  }, txt, root);
  if (!ok) throw new Error("button not found: " + txt);
};
const type = (v) =>
  page.$eval("textarea", (el, val) => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
const rows = (id) => page.$$eval(`[data-testid=${id}] li`, (ls) => ls.map((l) => l.innerText.replace(/\s+/g, " ").trim()));
const strip = () => page.$$eval("[data-testid=section-strip] button[aria-label]", (bs) => bs.map((b) => b.getAttribute("aria-label")));

for (const p of ["slow delta blues with harmonica", "funky groove in 7/8 with clave", "lydian drone ambient with pedal tone"]) {
  await type(p);
  await clickText("Generate");
  await sleep(2000);
  console.log(`\n[${p}] ${await status()}`);
  console.log("  sections:", (await strip()).join(" / "));
  console.log("  identity:", (await rows("identity-rows")).slice(0, 4).join(" || "));
}
// avoid chip
await clickText("Supersaws", "[data-testid=avoid-chips]");
await sleep(600);
console.log("\navoid row:", (await rows("identity-rows")).find((r) => r.startsWith("AVOID")));

// Go wild with delta blues base
await type("delta blues");
await clickText("🔥 Go wild");
await sleep(2200);
console.log("\nGO WILD:", await status());
const bd = await rows("breakdown-rows");
console.log(bd.map((r) => "  " + r).join("\n"));
await page.screenshot({ path: "/tmp/ms-shots/wild-top.png" });
// tap Ending line → pick "Hard cut"
await page.evaluate(() => [...document.querySelectorAll("[data-testid=breakdown-rows] button")].find((b) => b.innerText.startsWith("ENDING") || b.innerText.toUpperCase().startsWith("ENDING")).click());
await sleep(300);
await page.screenshot({ path: "/tmp/ms-shots/sheet.png" });
await clickText("Hard cut", "[role=dialog]");
await sleep(1500);
console.log("after picking Hard cut:", (await rows("breakdown-rows")).find((r) => r.toUpperCase().startsWith("ENDING")));
// keep fusion, reroll the rest
await page.evaluate(() => [...document.querySelectorAll("[data-testid=breakdown-rows] button")][0].click());
await sleep(300);
await clickText("🔒 Keep this", "[role=dialog]");
await sleep(1500);
console.log("after keep fusion:", (await rows("breakdown-rows")).slice(0, 3).join(" || "));

// Groove panel: open and pick 7/8
await page.$eval("[data-testid=groove-panel] summary", (s) => s.click());
await sleep(200);
await clickText("7/8", "[data-testid=groove-panel]");
await sleep(1500);
console.log("groove after 7/8:", (await rows("identity-rows")).find((r) => r.startsWith("GROOVE")));
await page.$eval("[data-testid=harmony-panel] summary", (s) => s.click());
await clickText("Locrian", "[data-testid=harmony-panel]");
await sleep(1200);
console.log("harmony summary:", await page.$eval("[data-testid=harmony-panel] summary", (s) => s.innerText.replace(/\s+/g, " ")));

// section detail
await page.evaluate(() => document.querySelectorAll("[data-testid=section-strip] button[aria-label]")[1].click());
await sleep(300);
console.log("section detail:", (await page.$eval("[data-testid=section-detail]", (d) => d.innerText.replace(/\s+/g, " "))).slice(0, 300));
await page.$eval("[data-testid=section-strip]", (e) => e.scrollIntoView());
await page.screenshot({ path: "/tmp/ms-shots/section.png" });

// copy as prompt
await clickText("Copy as prompt", "[data-testid=breakdown-card]");
await sleep(300);
const prompts = await page.$$eval("[role=dialog] textarea", (ts) => ts.map((t) => t.value));
console.log("\nSTYLE PROMPT:\n" + prompts[0] + "\n\nTIMELINE PROMPT:\n" + prompts[1]);
await page.screenshot({ path: "/tmp/ms-shots/prompt.png" });
await clickText("✕", "[role=dialog]");

// layout: no horizontal overflow at 390px
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
console.log("\nhorizontal overflow px:", overflow);
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: "/tmp/ms-shots/mobile-full.png", fullPage: true });

// export mix
await clickText("Mix (.wav)");
let file = null;
for (let i = 0; i < 120 && !file; i++) {
  await sleep(1000);
  file = fs.readdirSync(dl).find((f) => f.endsWith(".wav"));
}
console.log("export:", file, file ? fs.statSync(`${dl}/${file}`).size : 0, "|", await status());
console.log("\nconsole errors:", errors.length ? errors : "none");
await browser.close();
process.exit(errors.length ? 1 : 0);
