// Shared puppeteer helpers for the browser test scripts (Windows, macOS and Linux).
import puppeteer from "puppeteer-core";
import fs from "fs";
import os from "os";
import path from "path";

export const URL = process.argv[2] || process.env.APP_URL || "http://localhost:3020/";
export const CHROME =
  process.env.CHROME ||
  (process.platform === "win32"
    ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
    : process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "/usr/bin/google-chrome");

export const tmpDir = (name) => {
  const d = path.join(os.tmpdir(), name);
  fs.rmSync(d, { recursive: true, force: true });
  fs.mkdirSync(d, { recursive: true });
  return d;
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"] });
}

/** A fresh, isolated profile (empty IndexedDB and localStorage) with console-error capture and auto-accepted confirms. */
export async function freshPage(browser, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport(viewport);
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("dialog", (d) => d.accept());
  return { ctx, page, errors };
}

export function tester() {
  let fails = 0;
  let n = 0;
  return {
    check(name, ok, detail = "") {
      n++;
      if (!ok) fails++;
      console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
    },
    done(errors = []) {
      console.log(`\n${n - fails}/${n} checks passed${errors.length ? `; console errors: ${errors.join(" | ")}` : "; no console errors"}`);
      return fails || errors.length ? 1 : 0;
    },
  };
}

/** Helpers bound to one page. */
export function ui(page) {
  const clickText = async (txt, root = "body", { exact = false } = {}) => {
    const ok = await page.evaluate(
      (t, r, ex) => {
        const scope = document.querySelector(r);
        if (!scope) return false;
        const bs = [...scope.querySelectorAll("button")].filter((b) => !b.disabled);
        const b = bs.find((x) => x.textContent.trim() === t) ?? (ex ? undefined : bs.find((x) => x.textContent.trim().startsWith(t)));
        b?.click();
        return !!b;
      },
      txt,
      root,
      exact
    );
    if (!ok) throw new Error(`button not found: "${txt}" in ${root}`);
  };
  const text = (sel) => page.$eval(sel, (e) => e.textContent.replace(/\s+/g, " ").trim()).catch(() => "");
  const waitFor = async (fn, what, timeout = 8000) => {
    const t0 = Date.now();
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error(`timed out waiting for ${what}`);
      await sleep(150);
    }
  };
  const status = () => text('[aria-live="polite"]');
  const typePrompt = (v) =>
    page.$eval(
      "textarea",
      (el, val) => {
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(el, val);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      },
      v
    );
  const typeInto = async (sel, value) => {
    await page.$eval(sel, (el) => el.select());
    await page.type(sel, value);
  };
  return { clickText, text, waitFor, status, typePrompt, typeInto };
}
