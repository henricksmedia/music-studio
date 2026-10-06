// Real-browser smoke test: drives Chrome through the canvas, edits chips, nudges, and exports.
import puppeteer from "puppeteer-core";
import fs from "fs";
const URL = process.argv[2] || "http://localhost:3020/";
const dl = "/tmp/ms-dl";
fs.rmSync(dl, { recursive: true, force: true });
fs.mkdirSync(dl, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: "/usr/bin/google-chrome",
  headless: "new",
  args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required", "--mute-audio"],
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(String(e)));
const cdp = await page.createCDPSession();
await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
await page.goto(URL, { waitUntil: "networkidle0" });
const status = () => page.$eval('[aria-live="polite"]', (e) => e.textContent);
const clickText = async (txt) => {
  const ok = await page.evaluate((t) => {
    const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim().startsWith(t));
    if (b) b.click();
    return !!b;
  }, txt);
  if (!ok) throw new Error("button not found: " + txt);
};
const info = () =>
  page.evaluate(() => {
    const panel = [...document.querySelectorAll("section")].find((s) => s.textContent.includes("What I heard"));
    const strip = document.querySelector("[title*='bars']")?.parentElement;
    return {
      chips: panel ? [...panel.querySelectorAll("span.rounded-full, button.rounded-full")].map((x) => x.textContent.replace(/\s+/g, " ").trim()).slice(0, 8) : [],
      selects: panel ? [...panel.querySelectorAll("select")].map((s) => s.selectedOptions[0]?.textContent).filter(Boolean) : [],
      sections: strip ? [...strip.querySelectorAll("button")].map((b) => b.textContent) : [],
      playBtn: [...document.querySelectorAll("button")].find((b) => ["Play", "Pause"].includes(b.textContent.trim()))?.textContent,
    };
  });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const prompts = ["campfire banjo folk at dusk", "dark techno warehouse at 3am", "lonely country rock with a trance pulse", "purple elephant spaceship"];
for (const p of prompts) {
  await page.$eval("textarea", (el, v) => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    set.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, p);
  await clickText("Generate");
  await sleep(2500);
  const i = await info();
  console.log(`\n[${p}] status: ${await status()}`);
  console.log("  chips:", i.chips.join(" | "));
  console.log("  sounds:", i.selects.join(" | "));
  console.log("  sections:", i.sections.join(" "), "| button:", i.playBtn);
}
// position advances?
const posA = await page.$eval("[aria-live='polite']", () => document.querySelector(".pointer-events-none.absolute")?.style.left);
await sleep(1500);
const posB = await page.$eval("[aria-live='polite']", () => document.querySelector(".pointer-events-none.absolute")?.style.left);
console.log("\nplayhead moved:", posA, "→", posB);

// nudge a slider (drum feel) and genre pull
const nudge = async (label, value) =>
  page.evaluate(
    (l, v) => {
      const lab = [...document.querySelectorAll("label")].find((x) => x.textContent.startsWith(l));
      const input = lab.querySelector("input[type=range]");
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(input, String(v));
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return lab.textContent;
    },
    label,
    value
  );
await nudge("Genre pull", 5);
await sleep(800);
console.log("after Genre pull → 5:", (await info()).selects.join(" | "));
await nudge("Vocal character", 90);
await sleep(800);
console.log("after Vocal character → 90:", (await info()).selects.join(" | "));

// chip edit: blend in a style via select
await page.evaluate(() => {
  const s = [...document.querySelectorAll("select")].find((x) => x.querySelector("option")?.textContent === "+ blend style");
  const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
  set.call(s, "blues");
  s.dispatchEvent(new Event("change", { bubbles: true }));
});
await sleep(800);
console.log("after +blend blues:", (await info()).chips.slice(0, 4).join(" | "));
await clickText("🎲");
await sleep(1200);
console.log("after Surprise:", await status(), "|", (await info()).sections.join(" "));

await page.screenshot({ path: "/tmp/ms-phone.png", fullPage: true });

// exports (timed)
let t = Date.now();
await clickText("Mix (.wav)");
await page.waitForFunction(() => document.querySelector("[aria-live='polite']").textContent.includes("downloaded") || document.querySelector("[aria-live='polite']").textContent.includes("failed"), { timeout: 180000 });
console.log(`\nmix export: ${((Date.now() - t) / 1000).toFixed(1)}s →`, await status());
t = Date.now();
await clickText("Mix + stems");
await page.waitForFunction(() => /zip|failed/.test(document.querySelector("[aria-live='polite']").textContent), { timeout: 400000 });
console.log(`stems export: ${((Date.now() - t) / 1000).toFixed(1)}s →`, await status());
await sleep(1500);
for (const f of fs.readdirSync(dl)) console.log("  downloaded:", f, (fs.statSync(`${dl}/${f}`).size / 1e6).toFixed(1), "MB");
console.log("\nconsole errors:", errors.length ? errors : "none");
await browser.close();
