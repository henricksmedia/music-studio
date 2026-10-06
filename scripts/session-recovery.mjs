// Session recovery test in a real browser: an unsaved draft survives a reload; a saved song with unsaved edits
// comes back still marked unsaved; old-format, corrupted or missing session data never breaks the app.
// Usage: node scripts/session-recovery.mjs [url]
import { URL, freshPage, launch, sleep, tester, ui } from "./_browser.mjs";

const KEY = "music-studio:session:v1";
const browser = await launch();
const t = tester();
const allErrors = [];

async function scenario(name, fn) {
  const { ctx, page, errors } = await freshPage(browser);
  try {
    await page.goto(URL, { waitUntil: "networkidle0" });
    await fn(page, ui(page));
  } catch (err) {
    t.check(`${name}: ran to completion`, false, err.message);
  }
  allErrors.push(...errors.map((e) => `${name}: ${e}`));
  await ctx.close();
}

const title = (u) => u.text("[data-testid=song-title]");
const bar = (u) => u.text("[data-testid=song-bar]");
const prompt = (page) => page.$eval("textarea", (e) => e.value);
// The Tracks panel starts open on wide screens and collapsed on narrow ones.
const openTracks = (page) => page.$eval("[data-testid=track-panel]", (d) => d.open || d.querySelector("summary").click());
const reload = async (page) => {
  await sleep(700); // the session is written 400 ms after the last change
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(500);
};

await scenario("unsaved draft", async (page, u) => {
  await u.typePrompt("slow delta blues with harmonica");
  await u.clickText("Generate");
  await u.waitFor(async () => (await title(u)) === "Untitled draft", "draft");
  await u.clickText("🎲 Surprise");
  await sleep(400);
  const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).state, KEY);
  await reload(page);
  const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? "null")?.state, KEY);
  t.check("unsaved draft: prompt comes back", (await prompt(page)) === "slow delta blues with harmonica");
  t.check("unsaved draft: song comes back", (await title(u)) === "Untitled draft", await title(u));
  t.check("unsaved draft: same take (variation) comes back", after?.variation === before.variation && before.variation === 1, `${before.variation} -> ${after?.variation}`);
  t.check("unsaved draft: status says it picked up", (await u.status()).includes("Picked up where you left off"));
  t.check("session records the engine", after?.engine === 1, String(after?.engine));
});

await scenario("saved song with unsaved edits", async (page, u) => {
  await u.typePrompt("happy summer house party");
  await u.clickText("Generate");
  await u.waitFor(async () => (await title(u)) === "Untitled draft", "draft");
  await u.clickText("Save", "[data-testid=song-bar]", { exact: true });
  await u.waitFor(async () => (await bar(u)).includes("Saved"), "saved");
  await openTracks(page);
  await page.click("[data-testid=track-bass] button[title=Solo]");
  await sleep(300);
  t.check("saved song: edit marks it unsaved", (await bar(u)).includes("unsaved"));
  await reload(page);
  await u.waitFor(async () => (await title(u)) === "happy summer house party", "saved title", 8000).catch(() => {});
  t.check("saved song: reopens after reload", (await title(u)) === "happy summer house party", await title(u));
  t.check("saved song: still marked unsaved", (await bar(u)).includes("unsaved"), await bar(u));
  await openTracks(page);
  t.check("saved song: the unsaved edit is kept", await page.$eval("[data-testid=track-bass] button[title=Solo]", (b) => b.getAttribute("aria-pressed") === "true"));
});

await scenario("old-format session", async (page, u) => {
  // written by builds before tracks and engine existed
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { prompt: "dreamy 80s synthwave night drive", edits: { genres: [{ id: "synthwave", weight: 1 }], style: { edm: "darksynth" } }, locks: {}, wild: true, variation: 2, dimensions: { space: 70 } }, intent: "dreamy 80s synthwave night drive", docId: null, projectId: null })), KEY);
  await reload(page);
  t.check("old-format session: loads", (await title(u)) === "Untitled draft" && (await prompt(page)) === "dreamy 80s synthwave night drive", await title(u));
  t.check("old-format session: shows the producer breakdown for its Go wild state", await page.$eval("[data-testid=breakdown-card]", (d) => d.open).catch(() => false));
});

await scenario("unknown ids in session", async (page, u) => {
  await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ state: { prompt: "techno", edits: { genres: [{ id: "hyperpop-9000", weight: 1 }], style: { edm: "nope", ending: "explode" }, instruments: { kit: "tr-9000" } }, locks: { style: { edm: "nope" } }, wild: false, variation: 0 }, intent: "techno" })), KEY);
  await reload(page);
  t.check("unknown ids: loads instead of crashing", (await title(u)) === "Untitled draft", await title(u));
});

await scenario("corrupted session", async (page, u) => {
  await page.evaluate((k) => localStorage.setItem(k, "{not json"), KEY);
  await reload(page);
  t.check("corrupted session: app starts clean", (await title(u)) === "No song yet", await title(u));
  await u.typePrompt("ambient space drift");
  await u.clickText("Generate");
  await u.waitFor(async () => (await title(u)) === "Untitled draft", "draft after corrupted session");
  await sleep(700);
  t.check("corrupted session: new song works and is saved over it", await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).state.prompt === "ambient space drift", KEY).catch(() => false));
});

await browser.close();
process.exit(t.done(allErrors));
