import type { PlanEdits } from "../music/parse";
import type { Tracks } from "../music/tracks";
import type { Dimensions } from "../types";

export type Project = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

/** Everything needed to recompose a song exactly; no audio is stored (composition is deterministic). */
export type SongState = {
  prompt: string;
  edits: PlanEdits;
  locks: PlanEdits;
  wild: boolean;
  variation: number;
  dimensions: Dimensions;
  tracks: Tracks;
  /** Composer engine the song was made with; songs keep sounding as they did until upgraded (missing = 1). */
  engine: number;
};

export type SongDoc = SongState & {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
};

export const PROJECT_FILE_FORMAT = "music-studio-project";
export const PROJECT_FILE_VERSION = 1;

export type ProjectFile = {
  format: typeof PROJECT_FILE_FORMAT;
  version: number;
  exportedAt: number;
  project: Project;
  songs: SongDoc[];
};
