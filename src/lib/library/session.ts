/** The working session (saved or not) survives reloads, crashes and closed tabs. */
import { normalizeSongState } from "./db";
import type { SongState } from "./types";

const KEY = "music-studio:session:v1";

export type Session = { state: SongState; intent: string; docId: string | null; projectId: string | null };

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    const state = normalizeSongState(s.state);
    if (!state) return null;
    return {
      state,
      intent: typeof s.intent === "string" ? s.intent : state.prompt,
      docId: typeof s.docId === "string" ? s.docId : null,
      projectId: typeof s.projectId === "string" ? s.projectId : null,
    };
  } catch {
    return null;
  }
}

export function saveSession(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked (private mode): the library still has saved songs */
  }
}
