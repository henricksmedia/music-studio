/** On-device library (IndexedDB): projects and the songs inside them. */
import { DEFAULT_DIMENSIONS, type Dimensions } from "../types";
import { normalizeTracks } from "../music/tracks";
import { migrateEdits } from "../music/styles/migrate";
import { PROJECT_FILE_FORMAT, PROJECT_FILE_VERSION, type Project, type ProjectFile, type SongDoc, type SongState } from "./types";

const DB_NAME = "music-studio";
const DB_VERSION = 1;
const PROJECTS = "projects";
const SONGS = "songs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PROJECTS)) db.createObjectStore(PROJECTS, { keyPath: "id" });
        if (!db.objectStoreNames.contains(SONGS)) db.createObjectStore(SONGS, { keyPath: "id" }).createIndex("projectId", "projectId");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => (dbPromise = null));
  }
  return dbPromise;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("transaction aborted"));
  });

const result = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ---------------- projects ---------------- */

export async function listProjects(): Promise<Project[]> {
  const db = await openDb();
  const all = await result(db.transaction(PROJECTS).objectStore(PROJECTS).getAll() as IDBRequest<Project[]>);
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function createProject(name: string): Promise<Project> {
  const now = Date.now();
  const p: Project = { id: newId(), name: name.trim() || "Untitled project", createdAt: now, updatedAt: now };
  const db = await openDb();
  const tx = db.transaction(PROJECTS, "readwrite");
  tx.objectStore(PROJECTS).add(p);
  await done(tx);
  return p;
}

export async function renameProject(id: string, name: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(PROJECTS, "readwrite");
  const store = tx.objectStore(PROJECTS);
  const p = await result(store.get(id) as IDBRequest<Project | undefined>);
  if (p) store.put({ ...p, name: name.trim() || p.name, updatedAt: Date.now() });
  await done(tx);
}

/** Deletes the project and every song in it. */
export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([PROJECTS, SONGS], "readwrite");
  tx.objectStore(PROJECTS).delete(id);
  const songs = tx.objectStore(SONGS);
  const keys = await result(songs.index("projectId").getAllKeys(id));
  for (const k of keys) songs.delete(k);
  await done(tx);
}

/* ---------------- songs ---------------- */

export async function listSongs(projectId: string): Promise<SongDoc[]> {
  const db = await openDb();
  const all = await result(db.transaction(SONGS).objectStore(SONGS).index("projectId").getAll(projectId) as IDBRequest<SongDoc[]>);
  return all.map(normalizeSong).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSong(id: string): Promise<SongDoc | null> {
  const db = await openDb();
  const s = await result(db.transaction(SONGS).objectStore(SONGS).get(id) as IDBRequest<SongDoc | undefined>);
  return s ? normalizeSong(s) : null;
}

/** Insert or update a song; bumps its project's updatedAt so recent projects sort first. */
export async function putSong(song: SongDoc): Promise<SongDoc> {
  const saved = { ...song, updatedAt: Date.now() };
  const db = await openDb();
  const tx = db.transaction([PROJECTS, SONGS], "readwrite");
  tx.objectStore(SONGS).put(saved);
  const projects = tx.objectStore(PROJECTS);
  const p = await result(projects.get(song.projectId) as IDBRequest<Project | undefined>);
  if (!p) {
    tx.abort();
    throw new Error("project no longer exists");
  }
  projects.put({ ...p, updatedAt: saved.updatedAt });
  await done(tx);
  return saved;
}

export async function deleteSong(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SONGS, "readwrite");
  tx.objectStore(SONGS).delete(id);
  await done(tx);
}

export async function duplicateSong(id: string, toProjectId?: string): Promise<SongDoc> {
  const s = await getSong(id);
  if (!s) throw new Error("song not found");
  const now = Date.now();
  return putSong({ ...s, id: newId(), projectId: toProjectId ?? s.projectId, title: `${s.title} (copy)`, createdAt: now, updatedAt: now });
}

export async function moveSong(id: string, toProjectId: string): Promise<void> {
  const s = await getSong(id);
  if (s && s.projectId !== toProjectId) await putSong({ ...s, projectId: toProjectId });
}

/* ---------------- project files (backup / move between devices) ---------------- */

export async function exportProject(id: string): Promise<ProjectFile> {
  const db = await openDb();
  const p = await result(db.transaction(PROJECTS).objectStore(PROJECTS).get(id) as IDBRequest<Project | undefined>);
  if (!p) throw new Error("project not found");
  return { format: PROJECT_FILE_FORMAT, version: PROJECT_FILE_VERSION, exportedAt: Date.now(), project: p, songs: await listSongs(id) };
}

/** Imports as a new project with fresh ids, so importing the same file twice never overwrites anything. */
export async function importProject(raw: unknown): Promise<{ project: Project; songs: number }> {
  const file = readProjectFile(raw);
  const now = Date.now();
  const existing = new Set((await listProjects()).map((p) => p.name));
  let name = file.name;
  if (existing.has(name)) name = `${name} (imported)`;
  const project: Project = { id: newId(), name, createdAt: now, updatedAt: now };
  const songs = file.songs.map((s) => ({ ...s, id: newId(), projectId: project.id }));
  const db = await openDb();
  const tx = db.transaction([PROJECTS, SONGS], "readwrite");
  tx.objectStore(PROJECTS).add(project);
  for (const s of songs) tx.objectStore(SONGS).add(s);
  await done(tx);
  return { project, songs: songs.length };
}

/** Validates a project file (any version up to the current one) and normalizes its songs; throws on files it can't read. */
export function readProjectFile(raw: unknown): { name: string; songs: SongDoc[] } {
  const f = raw as Partial<ProjectFile> | null;
  if (!f || f.format !== PROJECT_FILE_FORMAT || !f.project || !Array.isArray(f.songs)) throw new Error("not a Music Studio project file");
  if ((f.version ?? 0) > PROJECT_FILE_VERSION) throw new Error("this project file is from a newer version of the app");
  return { name: String(f.project.name || "Imported project").slice(0, 80), songs: f.songs.filter((s) => normalizeSongState(s)).map(normalizeSong) };
}

/** Validates song settings from storage or a file; null if there is no usable prompt. */
export function normalizeSongState(s: Partial<SongState> | null | undefined): SongState | null {
  if (!s || typeof s.prompt !== "string" || !s.prompt.trim()) return null;
  const dims = { ...DEFAULT_DIMENSIONS } as Dimensions;
  for (const k of Object.keys(dims) as (keyof Dimensions)[]) {
    const v = s.dimensions?.[k];
    if (typeof v === "number" && Number.isFinite(v)) dims[k] = Math.max(0, Math.min(100, v));
  }
  return {
    prompt: s.prompt,
    edits: s.edits && typeof s.edits === "object" ? migrateEdits(s.edits) : {},
    locks: s.locks && typeof s.locks === "object" ? migrateEdits(s.locks) : {},
    wild: !!s.wild,
    variation: Number.isFinite(s.variation) ? Math.trunc(s.variation as number) : 0,
    dimensions: dims,
    tracks: normalizeTracks(s.tracks),
    engine: Number.isInteger(s.engine) && (s.engine as number) >= 1 ? (s.engine as number) : 1,
  };
}

function normalizeSong(s: SongDoc): SongDoc {
  const state = normalizeSongState(s) ?? normalizeSongState({ ...s, prompt: "something I have never heard" })!;
  const now = Date.now();
  return {
    ...state,
    id: s.id,
    projectId: s.projectId,
    title: typeof s.title === "string" && s.title.trim() ? s.title.trim().slice(0, 80) : state.prompt.slice(0, 60) || "Untitled",
    createdAt: Number.isFinite(s.createdAt) ? s.createdAt : now,
    updatedAt: Number.isFinite(s.updatedAt) ? s.updatedAt : now,
  };
}

/** Asks the browser not to evict the library under storage pressure (Safari otherwise may clear it). */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    return false;
  }
}
