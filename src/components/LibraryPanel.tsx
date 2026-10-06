"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createProject, deleteProject, deleteSong, duplicateSong, exportProject, importProject, listProjects, listSongs, moveSong, putSong, renameProject } from "@/lib/library/db";
import type { Project, SongDoc } from "@/lib/library/types";
import { saveFile, slugify } from "@/lib/download";

type Props = {
  open: boolean;
  onClose: () => void;
  activeProjectId: string | null;
  activeSongId: string | null;
  /** Bumped by the parent after it saves, so lists refresh. */
  version: number;
  onOpenSong: (s: SongDoc) => void;
  onSelectProject: (id: string | null) => void;
  /** A song (or every song in a project) the parent may have open was renamed, moved or deleted. */
  onSongChanged: (s: SongDoc | null, deletedId?: string) => void;
  onProjectDeleted: (id: string) => void;
  onStatus: (msg: string) => void;
};

const when = (t: number) => {
  const d = new Date(t);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
};

function InlineRename({ value, onCommit, onCancel, label }: { value: string; onCommit: (v: string) => void; onCancel: () => void; label: string }) {
  const [v, setV] = useState(value);
  return (
    <form
      className="flex min-w-0 flex-1 gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const t = v.trim();
        if (t) onCommit(t);
        else onCancel();
      }}
    >
      <input autoFocus value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === "Escape" && onCancel()} maxLength={80} aria-label={label} className="min-h-9 min-w-0 flex-1 rounded-lg border border-white/20 bg-white/5 px-2 text-sm text-white outline-none" />
      <button type="submit" className="min-h-9 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white">
        OK
      </button>
    </form>
  );
}

const btn = "min-h-9 rounded-lg border border-white/15 px-2.5 text-xs text-white/80 active:scale-95";
const dangerBtn = "min-h-9 rounded-lg border border-rose-300/30 px-2.5 text-xs text-rose-200 active:scale-95";

export function LibraryPanel({ open, onClose, activeProjectId, activeSongId, version, onOpenSong, onSelectProject, onSongChanged, onProjectDeleted, onStatus }: Props) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [songs, setSongs] = useState<SongDoc[]>([]);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const ps = await listProjects();
      setProjects(ps);
      const pid = activeProjectId && ps.some((p) => p.id === activeProjectId) ? activeProjectId : ps[0]?.id ?? null;
      if (pid !== activeProjectId) onSelectProject(pid);
      setSongs(pid ? await listSongs(pid) : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't open the library on this device.");
    }
  }, [activeProjectId, onSelectProject]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh, version]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && !renaming && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose, renaming]);

  if (!open) return null;
  const active = projects.find((p) => p.id === activeProjectId) ?? null;

  const run = async (fn: () => Promise<void>) => {
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    await refresh();
  };

  const addProject = () =>
    run(async () => {
      const p = await createProject(newName || `Project ${projects.length + 1}`);
      setNewName("");
      onSelectProject(p.id);
      onStatus(`Created project “${p.name}”.`);
    });

  const removeProject = (p: Project) => {
    if (!window.confirm(`Delete project “${p.name}” and all of its songs? This can't be undone.`)) return;
    void run(async () => {
      await deleteProject(p.id);
      onProjectDeleted(p.id);
      onStatus(`Deleted project “${p.name}”.`);
    });
  };

  const exportFile = (p: Project) =>
    run(async () => {
      const data = await exportProject(p.id);
      await saveFile(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }), `${slugify(p.name) || "project"}.musicstudio.json`);
      onStatus(`Exported “${p.name}” (${data.songs.length} song${data.songs.length === 1 ? "" : "s"}).`);
    });

  const importFile = (file: File) =>
    run(async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error("that file isn't valid JSON");
      }
      const { project, songs: n } = await importProject(parsed);
      onSelectProject(project.id);
      onStatus(`Imported “${project.name}” with ${n} song${n === 1 ? "" : "s"}.`);
    });

  const removeSong = (s: SongDoc) => {
    if (!window.confirm(`Delete “${s.title}”?`)) return;
    void run(async () => {
      await deleteSong(s.id);
      onSongChanged(null, s.id);
      onStatus(`Deleted “${s.title}”.`);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Library">
      <div className="flex max-h-[88dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#11111a] shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()} data-testid="library">
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-4">
          <p className="text-sm font-semibold text-white">Library</p>
          <button type="button" onClick={onClose} className="min-h-9 rounded-full px-3 text-white/60" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="space-y-4 overflow-y-auto px-4 pb-8">
          {error && <p className="rounded-lg bg-rose-500/15 px-3 py-2 text-xs text-rose-100">{error}</p>}

          <section className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-white/60">Projects</p>
            <div className="flex flex-wrap gap-1.5" data-testid="project-list">
              {projects.map((p) => (
                <button key={p.id} type="button" aria-pressed={p.id === activeProjectId} onClick={() => onSelectProject(p.id)} className={`min-h-9 rounded-full border px-3 text-xs ${p.id === activeProjectId ? "border-indigo-300/70 bg-indigo-500/30 text-white" : "border-white/15 bg-white/5 text-white/75"}`}>
                  {p.name}
                </button>
              ))}
              {!projects.length && <p className="text-xs text-white/60">No projects yet. Create one, or just tap Save and one is made for you.</p>}
            </div>
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                void addProject();
              }}
            >
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New project name" aria-label="New project name" maxLength={80} className="min-h-9 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/30" />
              <button type="submit" className="min-h-9 rounded-full bg-indigo-500 px-3 text-xs font-semibold text-white">
                + Project
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} className="min-h-9 rounded-full border border-white/15 px-3 text-xs text-white/80">
                Import…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void importFile(f);
                }}
              />
            </form>
          </section>

          <p className="text-[11px] text-white/60">Songs are saved on this device only. Use Export file now and then to keep a backup you can import on any device.</p>

          {active && (
            <section className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="project-detail">
              <div className="flex items-center gap-2">
                {renaming === active.id ? (
                  <InlineRename
                    value={active.name}
                    label="Project name"
                    onCancel={() => setRenaming(null)}
                    onCommit={(name) => {
                      setRenaming(null);
                      void run(() => renameProject(active.id, name));
                    }}
                  />
                ) : (
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{active.name}</p>
                )}
              </div>
              {renaming !== active.id && (
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className={btn} onClick={() => setRenaming(active.id)}>
                    Rename
                  </button>
                  <button type="button" className={btn} onClick={() => void exportFile(active)}>
                    Export file
                  </button>
                  <button type="button" className={dangerBtn} onClick={() => removeProject(active)}>
                    Delete project
                  </button>
                </div>
              )}

              <ul className="divide-y divide-white/5" data-testid="song-list">
                {songs.map((s) => (
                  <li key={s.id} className="py-2">
                    {renaming === s.id ? (
                      <InlineRename
                        value={s.title}
                        label="Song title"
                        onCancel={() => setRenaming(null)}
                        onCommit={(title) => {
                          setRenaming(null);
                          void run(async () => onSongChanged(await putSong({ ...s, title })));
                        }}
                      />
                    ) : (
                      <button type="button" onClick={() => onOpenSong(s)} className="flex w-full items-baseline gap-2 text-left active:bg-white/5">
                        <span className={`min-w-0 flex-1 truncate text-sm ${s.id === activeSongId ? "font-semibold text-indigo-200" : "text-white"}`}>
                          {s.id === activeSongId ? "▶ " : ""}
                          {s.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-white/60">{when(s.updatedAt)}</span>
                      </button>
                    )}
                    <p className="truncate text-[11px] text-white/60">{s.prompt}</p>
                    {renaming !== s.id && (
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <button type="button" className={btn} onClick={() => onOpenSong(s)}>
                          Open
                        </button>
                        <button type="button" className={btn} onClick={() => setRenaming(s.id)}>
                          Rename
                        </button>
                        <button type="button" className={btn} onClick={() => void run(async () => onStatus(`Duplicated as “${(await duplicateSong(s.id)).title}”.`))}>
                          Duplicate
                        </button>
                        {projects.length > 1 &&
                          (moving === s.id ? (
                            <select
                              autoFocus
                              aria-label="Move to project"
                              defaultValue=""
                              onBlur={() => setMoving(null)}
                              onChange={(e) => {
                                const to = e.target.value;
                                setMoving(null);
                                if (!to) return;
                                void run(async () => {
                                  await moveSong(s.id, to);
                                  onSongChanged({ ...s, projectId: to });
                                  onStatus(`Moved “${s.title}” to “${projects.find((p) => p.id === to)?.name}”.`);
                                });
                              }}
                              className="min-h-9 rounded-lg border border-white/15 bg-[#11111a] px-2 text-xs text-white"
                            >
                              <option value="">Move to…</option>
                              {projects
                                .filter((p) => p.id !== s.projectId)
                                .map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.name}
                                  </option>
                                ))}
                            </select>
                          ) : (
                            <button type="button" className={btn} onClick={() => setMoving(s.id)}>
                              Move…
                            </button>
                          ))}
                        <button type="button" className={dangerBtn} onClick={() => removeSong(s)}>
                          Delete
                        </button>
                      </div>
                    )}
                  </li>
                ))}
                {!songs.length && <li className="py-2 text-xs text-white/60">No songs in this project yet. Generate something and tap Save.</li>}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
