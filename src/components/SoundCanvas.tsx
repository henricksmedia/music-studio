"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DIMENSIONS, type Dimensions } from "@/lib/types";
import { parsePrompt, resolvePlan, suggestDimensions, type ParseResult, type PlanEdits } from "@/lib/music/parse";
import { STEM_IDS, composeWithParts, type StemId } from "@/lib/music/compose";
import { defaultTracks, partSeeds, type TrackSettings, type Tracks } from "@/lib/music/tracks";
import { createProject, getSong, listProjects, putSong, newId, requestPersistentStorage } from "@/lib/library/db";
import { loadSession, saveSession } from "@/lib/library/session";
import type { SongDoc, SongState } from "@/lib/library/types";
import { downloadBlob, isStandalone, saveFile, slugify } from "@/lib/download";
import { TrackPanel } from "./TrackPanel";
import { LibraryPanel } from "./LibraryPanel";
import { keyLabel } from "@/lib/music/theory";
import { GENRES } from "@/lib/music/genres";
import { ENGINE_VERSION } from "@/lib/music/styles";
import { engine, type Position } from "@/lib/music/engine";
import type { Taps } from "@/lib/music/render";
import { setLive } from "@/lib/visuals";
import { DimensionSlider } from "./DimensionSlider";
import { UnderstoodPanel } from "./UnderstoodPanel";
import { SectionStrip } from "./SectionStrip";
import { ArrangementLanes } from "./ArrangementLanes";
import { GroovePanel, HarmonyPanel } from "./StylePanels";
import { MasterVisual } from "./Visuals";
import { SongCard, type SheetKind } from "./SongCard";
import { Transport } from "./Transport";
import { OptionSheet, PromptModal, ShortcutsModal } from "./ui";
import { stylePrompt, timelinePrompt, type CardItem, type ChipOption } from "@/lib/music/describe";
import { goWild, mergeEdits, unlockEdits } from "@/lib/music/wild";
import { parseStyle } from "@/lib/music/parseStyle";
import { AVOIDS, AVOID_IDS, EDM } from "@/lib/music/spec";

const DIMENSION_META: { key: keyof Dimensions; label: string; hint: string }[] = [
  { key: "space", label: "Space", hint: "Dry & close → huge room, echoes" },
  { key: "bass", label: "Bass", hint: "Light → heavy low end" },
  { key: "drumFeel", label: "Drum feel", hint: "Soft & sparse → hard, busy, fills" },
  { key: "grit", label: "Grit", hint: "Clean → saturated, dirty edge" },
  { key: "pulse", label: "Pulse", hint: "Calm → driving bass & rhythm energy" },
  { key: "vocalCharacter", label: "Vocal character", hint: "Airy flute-like → present, voice-like lead" },
  { key: "genrePull", label: "Genre pull", hint: "Organic & acoustic ← → electronic & cyborg" },
];

const IDEAS = [
  "lonely country rock with a trance pulse",
  "campfire banjo folk at dusk",
  "dark techno warehouse at 3am",
  "dreamy 80s synthwave night drive",
  "lo-fi hip hop study beats with rain",
  "epic cinematic battle with taiko drums",
  "slow delta blues with harmonica",
  "aggressive trap with 808s",
  "ambient space drift",
  "happy summer house party",
];

/** Key-order-independent JSON, so "unsaved changes" only reflects real differences. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

function useMediaQuery(q: string) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = matchMedia(q);
    setOn(m.matches);
    const f = () => setOn(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, [q]);
  return on;
}

const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const stateOf = (s: SongState): SongState => ({ prompt: s.prompt, edits: s.edits, locks: s.locks, wild: s.wild, variation: s.variation, dimensions: s.dimensions, tracks: s.tracks, engine: s.engine });

export function SoundCanvas() {
  const [intent, setIntent] = useState("lonely country rock with a trance pulse");
  const [parse, setParse] = useState<ParseResult | null>(null);
  const [edits, setEdits] = useState<PlanEdits>({});
  const [variation, setVariation] = useState(0);
  const [dimensions, setDimensions] = useState<Dimensions>(DEFAULT_DIMENSIONS);
  const [lastPrompt, setLastPrompt] = useState("");
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Describe a vibe, then Generate.");
  const [taps, setTaps] = useState<Taps | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const restartRef = useRef(false);
  const [locks, setLocks] = useState<PlanEdits>({});
  const [wild, setWild] = useState(false);
  const [sheet, setSheet] = useState<{ item: CardItem; kind: SheetKind } | null>(null);
  const [promptOpen, setPromptOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const wide = useMediaQuery("(min-width: 1280px)");
  const [exported, setExported] = useState<{ blob: Blob; name: string } | null>(null);
  const [tracks, setTracks] = useState<Tracks>(defaultTracks);
  /** The saved song this session is editing (null = unsaved draft). */
  const [doc, setDoc] = useState<SongDoc | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libVersion, setLibVersion] = useState(0);
  const [saving, setSaving] = useState(false);
  /** Composer engine of the song being edited: saved songs keep theirs, new songs get the current one. */
  const [songEngine, setSongEngine] = useState(ENGINE_VERSION);

  const plan = useMemo(() => (parse ? resolvePlan(parse, edits) : null), [parse, edits]);
  const { drumFeel, pulse, genrePull, vocalCharacter } = dimensions;
  const seedKey = STEM_IDS.map((id) => tracks[id].seed).join(",");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- recompose only when a part's seed changes, not on level/pan/mute
  const seeds = useMemo(() => partSeeds(tracks), [seedKey]);
  const song = useMemo(
    () => (plan ? composeWithParts(plan, { drumFeel, pulse, genrePull, vocalCharacter }, variation, seeds) : null),
    [plan, drumFeel, pulse, genrePull, vocalCharacter, variation, seeds]
  );
  const present = useMemo(() => {
    const p = { drums: false, bass: false, harmony: false, lead: false, texture: false } as Record<StemId, boolean>;
    for (const e of song?.events ?? []) p[e.stem] = true;
    return p;
  }, [song]);
  // Texture beds, drones and risers are fixed; only shimmer bells change between takes.
  const rerollable = useMemo(() => ({ ...present, texture: !!song?.events.some((e) => e.inst === "shimmer") }), [present, song]);

  const current: SongState | null = parse ? { prompt: parse.text, edits, locks, wild, variation, dimensions, tracks, engine: songEngine } : null;
  const dirty = !!current && (!doc || stableJson(stateOf(doc)) !== stableJson(current));

  // Hand new songs to the engine: restart for Generate/Surprise, keep position for nudges/chip edits.
  useEffect(() => {
    if (!song) return;
    if (restartRef.current) {
      restartRef.current = false;
      engine.setSong(song, "restart");
      engine.play(0);
      setPlaying(true);
      setTaps(engine.getTaps());
    } else {
      const t = setTimeout(() => engine.setSong(song, "continue"), 120);
      return () => clearTimeout(t);
    }
  }, [song]);

  useEffect(() => setLive(playing), [playing]);

  // Mix-only nudges apply instantly without recomposing.
  useEffect(() => {
    engine.setMix(dimensions);
  }, [dimensions]);

  useEffect(() => {
    engine.setTracks(tracks);
  }, [tracks]);

  // Leaving with unsaved edits to a saved song asks first.
  useEffect(() => {
    if (!dirty || !doc) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, doc]);

  // Restore the last session (saved or not) once on load; playback waits for a tap.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const s = loadSession();
    if (!s) return;
    const st = s.state;
    setIntent(s.intent);
    setParse(parsePrompt(st.prompt));
    setLastPrompt(st.prompt);
    setEdits(st.edits);
    setLocks(st.locks);
    setWild(st.wild);
    setVariation(st.variation);
    setDimensions(st.dimensions);
    setTracks(st.tracks);
    setSongEngine(st.engine);
    setProjectId(s.projectId);
    setStatus("Picked up where you left off. Tap Play.");
    if (s.docId)
      getSong(s.docId)
        .then((d) => d && setDoc(d))
        .catch(() => {});
  }, []);

  useEffect(() => {
    if (!restoredRef.current || !current) return;
    const t = setTimeout(() => saveSession({ state: current, intent, docId: doc?.id ?? null, projectId }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `current` is rebuilt every render; its parts are listed
  }, [parse, edits, locks, wild, variation, dimensions, tracks, songEngine, intent, doc?.id, projectId]);

  // Remember which project new songs go into.
  useEffect(() => {
    if (!projectId) {
      setProjectName("");
      return;
    }
    let live = true;
    listProjects()
      .then((ps) => live && setProjectName(ps.find((p) => p.id === projectId)?.name ?? ""))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId, libVersion, libraryOpen]);

  // Position readout for the section strip.
  useEffect(() => {
    if (!song) return;
    const id = setInterval(() => setPos(engine.position()), 120);
    return () => clearInterval(id);
  }, [song]);

  const generate = useCallback(
    (text?: string) => {
      engine.unlock();
      const prompt = (text ?? intent).trim() || "something I have never heard";
      const samePrompt = prompt === lastPrompt && !!parse;
      if (!samePrompt && doc && dirty && !window.confirm(`Start a new song? Unsaved changes to “${doc.title}” will be lost.`)) return;
      if (text) setIntent(text);
      restartRef.current = true;
      if (samePrompt) {
        setVariation((v) => v + 1);
        setStatus("Same vibe, new take.");
        return;
      }
      const p = parsePrompt(prompt);
      const pl = resolvePlan(p);
      setParse(p);
      setEdits({});
      setLocks({});
      setWild(!!p.style.wild);
      setVariation(0);
      setDimensions(suggestDimensions(pl, p, DEFAULT_DIMENSIONS));
      setTracks(defaultTracks());
      setSongEngine(ENGINE_VERSION);
      setLastPrompt(prompt);
      // a new prompt starts a new draft; the saved song stays as it was
      setDoc(null);
      setStatus(`${doc ? "New draft · " : ""}${pl.genres.map((g) => GENRES[g.id].label).join(" × ")} · ${pl.bpm} BPM · ${keyLabel(pl.root, pl.mode)}`);
    },
    [intent, lastPrompt, parse, doc, dirty]
  );

  const surprise = () => {
    if (!parse) return generate();
    engine.unlock();
    restartRef.current = true;
    setVariation((v) => v + 1);
    setStatus("Rerolled — same vibe, new melody, groove and arrangement.");
  };

  const togglePlay = () => {
    engine.unlock();
    if (!song) return generate();
    if (playing) {
      engine.pause();
      setPlaying(false);
      setStatus("Paused.");
    } else {
      engine.setSong(song, "continue");
      engine.play();
      setPlaying(true);
      setTaps(engine.getTaps());
      setStatus("Playing.");
    }
  };

  const seek = (beat: number) => {
    if (!song) return;
    engine.unlock();
    engine.play(beat);
    setPlaying(true);
    setTaps(engine.getTaps());
  };

  const onEdit = (e: PlanEdits) =>
    setEdits((prev) => {
      const next: PlanEdits = mergeEdits(prev, e);
      // Re-blending styles keeps the key you're in; mood changes may move the mode (dark → phrygian), not the root.
      if (plan && e.genres) {
        next.root = prev.root ?? plan.root;
        next.mode = prev.mode ?? plan.mode;
      }
      if (plan && e.moods) next.root = prev.root ?? plan.root;
      return next;
    });

  /** Go wild: base = current genre (default delta blues) fused with a random EDM substyle; locks survive. */
  const doGoWild = () => {
    engine.unlock();
    let p = parse;
    const prompt = intent.trim();
    if (!p || prompt !== lastPrompt) {
      if (doc && dirty && !window.confirm(`Start a new song? Unsaved changes to “${doc.title}” will be lost.`)) return;
      p = parsePrompt(prompt || "delta blues");
      if (resolvePlan(p).fallback) p = parsePrompt(`delta blues ${prompt}`);
      setParse(p);
      setLastPrompt(prompt);
      setTracks(defaultTracks());
      setSongEngine(ENGINE_VERSION);
      setDoc(null);
    }
    const base = resolvePlan(p);
    const { edits: we, edm, base: baseId } = goWild(base, locks, (Date.now() ^ (variation * 7919)) >>> 0);
    restartRef.current = true;
    setEdits(we);
    setWild(true);
    setVariation((v) => v + 1);
    setDimensions(suggestDimensions(resolvePlan(p, we), p, DEFAULT_DIMENSIONS));
    setStatus(`Go wild: ${GENRES[baseId].label} × ${EDM[edm].label} — tap any line to change or lock it.`);
  };

  /* ---------------- library ---------------- */

  const ensureProject = async (): Promise<string> => {
    const ps = await listProjects();
    if (projectId && ps.some((p) => p.id === projectId)) return projectId;
    const id = ps[0]?.id ?? (await createProject("My songs")).id;
    setProjectId(id);
    return id;
  };

  const saveSong = async (asNew = false) => {
    if (!current || saving) return;
    setSaving(true);
    try {
      let saved: SongDoc;
      if (doc && !asNew) {
        saved = await putSong({ ...doc, ...current });
      } else {
        const now = Date.now();
        const pid = await ensureProject();
        const title = asNew && doc ? `${doc.title} (copy)` : current.prompt.trim().slice(0, 60) || "Untitled";
        saved = await putSong({ ...current, id: newId(), projectId: pid, title, createdAt: now, updatedAt: now });
      }
      setDoc(saved);
      setProjectId(saved.projectId);
      setLibVersion((v) => v + 1);
      setStatus(`Saved “${saved.title}”.`);
      void requestPersistentStorage();
    } catch (err) {
      setStatus(`Couldn't save: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const openSong = (s: SongDoc) => {
    if (doc?.id === s.id && !dirty) {
      setLibraryOpen(false);
      return;
    }
    if (dirty && current && !window.confirm(doc ? `Discard unsaved changes to “${doc.title}”?` : "Discard the current unsaved song?")) return;
    engine.unlock();
    const p = parsePrompt(s.prompt);
    restartRef.current = true;
    setIntent(s.prompt);
    setParse(p);
    setLastPrompt(s.prompt);
    setEdits(s.edits);
    setLocks(s.locks);
    setWild(s.wild);
    setVariation(s.variation);
    setDimensions(s.dimensions);
    setTracks(s.tracks);
    setSongEngine(s.engine);
    setDoc(s);
    setProjectId(s.projectId);
    setLibraryOpen(false);
    setStatus(`Opened “${s.title}”.`);
  };

  const onLibrarySongChanged = useCallback((s: SongDoc | null, deletedId?: string) => {
    setDoc((d) => {
      if (!d) return d;
      if (deletedId && d.id === deletedId) return null;
      // keep unsaved musical edits; only take over the renamed title / new project
      if (s && d.id === s.id) return { ...d, title: s.title, projectId: s.projectId, updatedAt: s.updatedAt };
      return d;
    });
  }, []);
  const onProjectDeleted = useCallback((id: string) => {
    setDoc((d) => (d && d.projectId === id ? null : d));
    setProjectId((p) => (p === id ? null : p));
  }, []);

  /* ---------------- tracks ---------------- */

  const changeTrack = (id: StemId, patch: Partial<TrackSettings>) => setTracks((t) => ({ ...t, [id]: { ...t[id], ...patch } }));
  const newTake = (id: StemId) => {
    engine.unlock();
    changeTrack(id, { seed: (Math.random() * 0xffffffff) >>> 0 || 1 });
    setStatus(`New take of ${tracks[id].name.toLowerCase()}; everything else stays.`);
  };

  const pickOption = (o: ChipOption, kind: SheetKind) => {
    onEdit(o.patch);
    if (kind === "breakdown") {
      // change = lock that element, reroll the rest
      setLocks((l) => mergeEdits(l, o.patch));
      restartRef.current = true;
      setVariation((v) => v + 1);
    }
    setSheet(null);
  };
  const closeSheet = useCallback(() => setSheet(null), []);
  const closeShortcuts = useCallback(() => setShortcutsOpen(false), []);
  const keepItem = (item: CardItem) => {
    if (!item.lock) return;
    setLocks((l) => mergeEdits(l, item.lock!));
    onEdit(item.lock);
    restartRef.current = true;
    setVariation((v) => v + 1);
    setSheet(null);
    setStatus(`Kept ${item.title.toLowerCase()}, rerolled the rest.`);
  };
  const unlockItem = (item: CardItem) => {
    setLocks((l) => unlockEdits(l, item.unlockKeys, item.unlockPlan));
    setEdits((e) => unlockEdits(e, item.unlockKeys, item.unlockPlan));
    setSheet(null);
  };
  const addTypedAvoid = (avoidText: string): boolean => {
    if (!song || !avoidText.trim()) return false;
    const txt = /\b(no|avoid|without)\b/i.test(avoidText) ? avoidText : `no ${avoidText}`;
    const found = parseStyle(txt, 0).style.avoid ?? [];
    if (!found.length) {
      setStatus(`Couldn't match “${avoidText}” to a sound I can exclude. Try: ${AVOID_IDS.slice(0, 4).map((a) => AVOIDS[a].label.toLowerCase()).join(", ")}…`);
      return false;
    }
    onEdit({ style: { avoid: Array.from(new Set([...song.spec.production.avoid, ...found])) } });
    setStatus(`Avoiding: ${found.map((a) => AVOIDS[a].label.toLowerCase()).join(", ")}.`);
    return true;
  };

  const exportAudio = async (withStems: boolean) => {
    if (!song) return;
    setBusy(true);
    setExported(null);
    try {
      const { blob, ext } = await engine.exportAudio(song, dimensions, tracks, withStems, setStatus);
      const slug = slugify(doc?.title || lastPrompt || "piece") || "piece";
      const name = `${slug}-${song.bpm}bpm${withStems ? "-stems" : ""}.${ext}`;
      setExported({ blob, name });
      if (isStandalone()) {
        setStatus("Export ready. Tap Save to keep it.");
      } else {
        downloadBlob(blob, name);
        setStatus(withStems ? "Mix + stems downloaded as a zip. They're yours." : "Mix downloaded (WAV). It's yours.");
      }
    } catch (err) {
      setStatus(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  // Keyboard shortcuts (off while typing, and while a sheet or dialog is open).
  const keysRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keysRef.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
    if (sheet || libraryOpen || promptOpen || shortcutsOpen || document.querySelector("[role=dialog]")) return;
    const k = e.key;
    const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a, summary, [role=tab]");
    if (k === " " && !onControl) {
      e.preventDefault();
      togglePlay();
    } else if (k === "g" || k === "G") generate();
    else if (k === "r" || k === "R") surprise();
    else if (k === "w" || k === "W") doGoWild();
    else if ((k === "s" || k === "S") && song) void saveSong();
    else if (k === "l" || k === "L") setLibraryOpen(true);
    else if (k === "?") setShortcutsOpen(true);
    else if (/^[1-5]$/.test(k) && song) {
      const id = STEM_IDS[Number(k) - 1];
      changeTrack(id, { solo: !tracks[id].solo });
      setStatus(`${tracks[id].solo ? "Unsoloed" : "Soloed"} ${tracks[id].name.toLowerCase()}.`);
    } else return;
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keysRef.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const btn = "min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition active:scale-[0.98] disabled:opacity-50";

  return (
    <div className="flex min-h-dvh w-full flex-col pb-[calc(env(safe-area-inset-bottom)+6rem)] md:pb-10">
      <Transport song={song} playing={playing} busy={busy} pos={pos} status={status} taps={taps} onToggle={togglePlay} onShortcuts={() => setShortcutsOpen(true)} />

      <main className="mx-auto w-full max-w-lg flex-1 px-4 pt-5 md:max-w-none md:px-6 md:pt-5">
        <header className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/90">Music Studio</p>
            <h1 className="text-2xl font-semibold tracking-tight text-white">Sound canvas</h1>
            <p className="text-sm text-white/60">Say it or shape it. Everything is made on your device. Nothing goes to the cloud.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 xl:min-w-[30rem]" data-testid="song-bar">
            <button type="button" onClick={() => setLibraryOpen(true)} className="min-h-11 shrink-0 rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white hover:bg-white/10 md:min-h-10" title="Library (L)">
              📁 Library
            </button>
            <div className="min-w-[8rem] flex-1 leading-tight">
              <p className="truncate text-[11px] text-white/60">
                {projectName || (doc ? "" : "Not saved yet")}
                {doc && dirty && <span className="ml-1.5 text-amber-200/90">• unsaved changes</span>}
              </p>
              <p className="truncate text-sm text-white" data-testid="song-title">
                {doc ? doc.title : song ? "Untitled draft" : "No song yet"}
              </p>
            </div>
            {song && (
              <div className="ml-auto flex gap-1.5">
                {doc && (
                  <button type="button" disabled={saving} onClick={() => void saveSong(true)} className="min-h-11 shrink-0 rounded-xl px-2 text-xs text-white/70 hover:text-white disabled:opacity-40 md:min-h-10" title="Save these settings as a separate song">
                    Save as new
                  </button>
                )}
                <button type="button" disabled={saving || (!!doc && !dirty)} onClick={() => void saveSong()} className="min-h-11 shrink-0 rounded-xl bg-indigo-500 px-4 text-xs font-semibold text-white disabled:bg-white/10 disabled:text-white/60 md:min-h-10" title="Save (S)">
                  {saving ? "Saving…" : doc && !dirty ? "Saved" : "Save"}
                </button>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_21rem] md:grid-rows-[auto_1fr] lg:grid-cols-[minmax(0,1fr)_24rem] xl:grid-cols-[18rem_minmax(0,1fr)_26rem] xl:grid-rows-1 min-[1680px]:grid-cols-[20rem_minmax(0,1fr)_30rem]">
          {/* Centre: prompt, visual, arrangement */}
          <div className="min-w-0 space-y-4 md:col-start-1 md:row-start-1 xl:col-start-2" data-testid="studio-main">
            <section className="space-y-3">
              <textarea
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    generate();
                  }
                }}
                rows={2}
                placeholder="lonely country rock with a trance pulse…"
                aria-label="Describe the music"
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none ring-indigo-400/40 placeholder:text-white/40 focus:ring-2"
              />
              <div className="grid grid-cols-3 gap-2">
                <button type="button" disabled={busy} onClick={() => generate()} className={`${btn} bg-indigo-500 shadow-lg shadow-indigo-500/25 hover:bg-indigo-400`} title="Generate (G or Enter)">
                  Generate
                </button>
                <button type="button" disabled={busy} onClick={surprise} className={`${btn} border border-pink-300/30 bg-pink-500/15 hover:bg-pink-500/25`} title="Same vibe, new take (R)">
                  🎲 Surprise
                </button>
                <button type="button" disabled={busy} onClick={doGoWild} className={`${btn} border border-orange-300/40 bg-gradient-to-r from-orange-500/30 to-fuchsia-500/30 hover:from-orange-500/40 hover:to-fuchsia-500/40`} title="Fuse this style with a random EDM substyle (W)">
                  🔥 Go wild
                </button>
              </div>
              {!song && (
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">Try one</p>
                  <div className="flex flex-wrap gap-1.5">
                    {IDEAS.slice(0, 6).map((idea) => (
                      <button key={idea} type="button" onClick={() => generate(idea)} className="min-h-11 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 active:scale-95 md:min-h-9">
                        {idea}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {plan && song && <UnderstoodPanel plan={plan} song={song} onEdit={onEdit} />}

            <MasterVisual taps={taps} playing={playing} />

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-3" data-testid="arrangement-slot" aria-label="Arrangement">
              {song ? (
                <SectionStrip
                  song={song}
                  sectionIndex={pos?.sectionIndex ?? 0}
                  progress={pos?.progress ?? 0}
                  chord={pos?.chord ?? ""}
                  playing={playing}
                  onSeek={seek}
                  onEdit={onEdit}
                  lanes={(sel, select) => <ArrangementLanes song={song} tracks={tracks} progress={pos?.progress ?? 0} selected={sel} onSelect={select} />}
                />
              ) : (
                <div className="flex min-h-28 flex-col items-center justify-center gap-1 text-center">
                  <p className="text-sm font-medium text-white/80">Your arrangement appears here</p>
                  <p className="max-w-sm text-xs text-white/60">Sections across the top, each track’s notes underneath. Generate a song or pick an idea above to start.</p>
                </div>
              )}
            </section>
          </div>

          {/* Mixer: left rail on desktop, below the arrangement on tablets, after the arrangement on phones */}
          <aside className="min-w-0 md:col-start-1 md:row-start-2 xl:sticky xl:top-[4.75rem] xl:col-start-1 xl:row-start-1 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain" data-testid="studio-tracks">
            {song ? (
              <TrackPanel tracks={tracks} present={present} rerollable={rerollable} onChange={changeTrack} onNewTake={newTake} taps={taps} defaultOpen={wide} />
            ) : (
              <div className="hidden rounded-2xl border border-dashed border-white/10 p-4 text-center xl:block">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Tracks</p>
                <p className="mt-1 text-xs text-white/60">Drums, bass, chords, lead and texture show up here with live scopes, mute, solo, level and pan.</p>
              </div>
            )}
          </aside>

          {/* Right panel: the song, its style details, nudges and export */}
          <aside className="min-w-0 space-y-4 md:col-start-2 md:row-span-2 md:row-start-1 xl:sticky xl:top-[4.75rem] xl:col-start-3 xl:row-span-1 xl:max-h-[calc(100dvh-6rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain" data-testid="studio-side">
            {song && plan ? (
              <SongCard
                song={song}
                plan={plan}
                edits={edits}
                locks={locks}
                wild={wild}
                onOpen={(item, kind) => setSheet({ item, kind })}
                onCopyPrompt={() => setPromptOpen(true)}
                onEdit={onEdit}
                onTypedAvoid={addTypedAvoid}
              />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Song identity</p>
                <p className="mt-1 text-xs text-white/60">Genre, mood, groove, hook and mix of your song, each one tappable to change. The producer breakdown sits underneath.</p>
              </div>
            )}

            {song && <GroovePanel song={song} onEdit={onEdit} />}
            {song && <HarmonyPanel song={song} onEdit={onEdit} />}

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Nudge</h2>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-2">
                {DIMENSION_META.map((m) => (
                  <DimensionSlider key={m.key} label={m.label} hint={m.hint} value={dimensions[m.key]} disabled={!song} onChange={(v) => setDimensions((d) => ({ ...d, [m.key]: v }))} />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">Export (you own it)</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || !song} onClick={() => exportAudio(false)} className="min-h-11 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">
                  Mix (.wav)
                </button>
                <button type="button" disabled={busy || !song} onClick={() => exportAudio(true)} className="min-h-11 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
                  Mix + stems (.zip)
                </button>
                {exported && !busy && (
                  <button type="button" onClick={() => void saveFile(exported.blob, exported.name)} className="min-h-11 rounded-xl bg-indigo-500 px-4 py-2 text-xs font-semibold text-white" title={exported.name}>
                    Save {exported.name.endsWith(".zip") ? "zip" : "WAV"}
                  </button>
                )}
              </div>
              <p className="text-[11px] text-white/60">Full-length render on your device, mixed the way the Tracks panel is set. Stems are your audible tracks, named after them, and line up sample-for-sample.</p>
            </section>
          </aside>
        </div>
      </main>

      <OptionSheet
        item={sheet?.item ?? null}
        onClose={closeSheet}
        onPick={(o) => pickOption(o, sheet?.kind ?? "identity")}
        onKeep={keepItem}
        onUnlock={unlockItem}
        pickHint={sheet?.kind === "breakdown" ? "Pick one: it gets locked and everything else rerolls." : "Pick one: it changes in place."}
      />
      <LibraryPanel
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        activeProjectId={projectId}
        activeSongId={doc?.id ?? null}
        version={libVersion}
        onOpenSong={openSong}
        onSelectProject={setProjectId}
        onSongChanged={onLibrarySongChanged}
        onProjectDeleted={onProjectDeleted}
        onStatus={setStatus}
      />
      {song && plan && <PromptModal open={promptOpen} style={stylePrompt(song, plan)} timeline={timelinePrompt(song, plan)} onClose={() => setPromptOpen(false)} />}
      <ShortcutsModal open={shortcutsOpen} onClose={closeShortcuts} />
    </div>
  );
}
