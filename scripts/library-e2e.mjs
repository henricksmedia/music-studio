// Library + tracks end-to-end test in a real browser: save, rename, duplicate, move, projects, export/import,
// delete, open, track mute / new take, and reload. Uses a fresh profile, so the app's IndexedDB starts empty.
// Usage: node scripts/library-e2e.mjs [url]
import fs from "fs";
import path from "path";
import { URL, freshPage, launch, sleep, tester, tmpDir, ui } from "./_browser.mjs";

const PROMPT = "dark techno warehouse at 3am";
const dl = tmpDir("ms-e2e-downloads");
const browser = await launch();
const { page, errors } = await freshPage(browser);
const cdp = await page.createCDPSession();
await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: dl });
const t = tester();
const { clickText, text, waitFor, status, typePrompt, typeInto } = ui(page);

const title = () => text("[data-testid=song-title]");
const songBar = () => text("[data-testid=song-bar]");
const chips = () => page.$$eval("[data-testid=project-list] button", (bs) => bs.map((b) => ({ name: b.textContent.trim(), active: b.getAttribute("aria-pressed") === "true" })));
const songTitles = () => page.$$eval("[data-testid=song-list] li > button span:first-child", (ss) => ss.map((s) => s.textContent.replace(/^▶\s*/, "").trim())).catch(() => []);
const openLibrary = async () => {
  await clickText("📁 Library", "[data-testid=song-bar]");
  await waitFor(() => page.$("[data-testid=library]"), "library");
  await sleep(300);
};
const closeLibrary = async () => {
  await clickText("✕", "[data-testid=library]");
  await sleep(200);
};
const selectProject = async (name) => {
  await clickText(name, "[data-testid=project-list]", { exact: true });
  await sleep(400);
};
const songAction = async (songTitle, action) => {
  const ok = await page.evaluate(
    (st, a) => {
      const li = [...document.querySelectorAll("[data-testid=song-list] li")].find((l) => l.querySelector("button span")?.textContent.replace(/^▶\s*/, "").trim() === st);
      const b = li && [...li.querySelectorAll("button")].find((x) => x.textContent.trim() === a);
      b?.click();
      return !!b;
    },
    songTitle,
    action
  );
  if (!ok) throw new Error(`no "${action}" for song "${songTitle}"`);
  await sleep(400);
};
const openTracks = async () => {
  const open = await page.$eval("[data-testid=track-panel]", (d) => d.open ?? d.hasAttribute("open")).catch(() => false);
  if (!open) await page.$eval("[data-testid=track-panel] summary", (s) => s.click());
  await sleep(200);
};
const muted = (id) => page.$eval(`[data-testid=track-${id}] button[title=Mute]`, (b) => b.getAttribute("aria-pressed") === "true");

try {
  await page.goto(URL, { waitUntil: "networkidle0" });

  await typePrompt(PROMPT);
  await clickText("Generate");
  await waitFor(async () => (await title()) === "Untitled draft", "draft title");
  t.check("generate makes an unsaved draft", (await title()) === "Untitled draft");

  await clickText("Save", "[data-testid=song-bar]", { exact: true });
  await waitFor(async () => (await status()).startsWith("Saved"), "save status");
  t.check("save names the song after the prompt", (await title()) === PROMPT, await title());
  t.check("saved song shows Saved, not unsaved", (await songBar()).includes("Saved") && !(await songBar()).includes("unsaved"));

  await openLibrary();
  t.check('first save creates "My songs"', (await chips()).some((c) => c.name === "My songs" && c.active), JSON.stringify(await chips()));
  t.check("song is listed", (await songTitles()).includes(PROMPT));

  await songAction(PROMPT, "Rename");
  await typeInto('input[aria-label="Song title"]', "Warehouse");
  await page.keyboard.press("Enter");
  await sleep(500);
  t.check("rename song", (await songTitles()).includes("Warehouse"), (await songTitles()).join(", "));
  t.check("open song's title follows the rename", (await title()) === "Warehouse", await title());

  await songAction("Warehouse", "Duplicate");
  t.check("duplicate song", (await songTitles()).includes("Warehouse (copy)"), (await songTitles()).join(", "));

  await typeInto('input[aria-label="New project name"]', "Beats");
  await clickText("+ Project", "[data-testid=library]");
  await sleep(500);
  t.check("create project and switch to it", (await chips()).some((c) => c.name === "Beats" && c.active));
  t.check("new project is empty", (await songTitles()).length === 0);

  await selectProject("My songs");
  await songAction("Warehouse (copy)", "Move…");
  const beatsId = await page.evaluate(() => [...document.querySelectorAll('select[aria-label="Move to project"] option')].find((o) => o.textContent === "Beats")?.value);
  await page.select('select[aria-label="Move to project"]', beatsId);
  await sleep(600);
  t.check("move removes the song from the old project", !(await songTitles()).includes("Warehouse (copy)"), (await songTitles()).join(", "));
  await selectProject("Beats");
  t.check("move adds it to the new project", (await songTitles()).includes("Warehouse (copy)"));

  await clickText("Rename", "[data-testid=project-detail]", { exact: true });
  await typeInto('input[aria-label="Project name"]', "Beats 2");
  await page.keyboard.press("Enter");
  await sleep(500);
  t.check("rename project", (await chips()).some((c) => c.name === "Beats 2"));

  await selectProject("My songs");
  await clickText("Export file", "[data-testid=project-detail]");
  const file = await waitFor(() => fs.readdirSync(dl).find((f) => f.endsWith(".json") && !f.endsWith(".crdownload")), "export download", 10000).catch(() => null);
  const data = file ? JSON.parse(fs.readFileSync(path.join(dl, file), "utf8")) : null;
  t.check("export project file", !!data && data.format === "music-studio-project" && data.version === 1 && data.songs.length === 1, file ?? "no file");
  t.check("exported song carries its engine", data?.songs[0]?.engine === 1, String(data?.songs[0]?.engine));

  const input = await page.$('[data-testid=library] input[type=file]');
  await input.uploadFile(path.join(dl, file));
  await waitFor(async () => (await chips()).some((c) => c.name === "My songs (imported)"), "imported project");
  t.check("import as a new project", (await chips()).some((c) => c.name === "My songs (imported)" && c.active));
  t.check("imported project has the song", (await songTitles()).includes("Warehouse"));

  await songAction("Warehouse", "Delete");
  t.check("delete song", (await songTitles()).length === 0);
  await clickText("Delete project", "[data-testid=project-detail]");
  await sleep(600);
  t.check("delete project", !(await chips()).some((c) => c.name === "My songs (imported)") && (await chips()).length === 2, JSON.stringify(await chips()));

  await selectProject("Beats 2");
  await songAction("Warehouse (copy)", "Open");
  await sleep(800);
  t.check("open a song from the library", (await title()) === "Warehouse (copy)", await title());
  t.check("opened song is not marked unsaved", !(await songBar()).includes("unsaved"));

  await openTracks();
  await page.click("[data-testid=track-drums] button[title=Mute]");
  await sleep(500);
  t.check("muting a track marks the song unsaved", await muted("drums") && (await songBar()).includes("unsaved"));
  await page.evaluate(() => [...document.querySelectorAll("[data-testid=track-lead] button")].find((b) => b.textContent.includes("New take")).click());
  await sleep(800);
  t.check("new take on the lead offers the original back", (await text("[data-testid=track-lead]")).includes("Back to original part"));
  await clickText("Save", "[data-testid=song-bar]", { exact: true });
  await waitFor(async () => (await songBar()).includes("Saved"), "saved after track edits");
  t.check("save track edits", !(await songBar()).includes("unsaved"));

  await page.reload({ waitUntil: "networkidle0" });
  await waitFor(async () => (await title()) === "Warehouse (copy)", "title after reload", 10000).catch(() => {});
  await openTracks();
  t.check("reload reopens the saved song", (await title()) === "Warehouse (copy)", await title());
  t.check("track mute survives reload", await muted("drums"));
  t.check("lead take survives reload", (await text("[data-testid=track-lead]")).includes("Back to original part"));
  t.check("reloaded saved song is not marked unsaved", !(await songBar()).includes("unsaved"), await songBar());

  await openLibrary();
  await selectProject("My songs");
  t.check("library persists across reload", (await songTitles()).includes("Warehouse"));
  await closeLibrary();
} catch (err) {
  t.check("test ran to completion", false, err.message);
}
await browser.close();
process.exit(t.done(errors));
