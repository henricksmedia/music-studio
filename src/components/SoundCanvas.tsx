"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_DIMENSIONS, type Dimensions } from "@/lib/types";
import { parsePrompt, resolvePlan, suggestDimensions, type ParseResult, type PlanEdits } from "@/lib/music/parse";
import { compose } from "@/lib/music/compose";
import { keyLabel } from "@/lib/music/theory";
import { GENRES } from "@/lib/music/genres";
import { engine, type Position } from "@/lib/music/engine";
import { DimensionSlider } from "./DimensionSlider";
import { WavePulse } from "./WavePulse";
import { UnderstoodPanel } from "./UnderstoodPanel";
import { SectionStrip } from "./SectionStrip";

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

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

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
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const [pos, setPos] = useState<Position | null>(null);
  const restartRef = useRef(false);

  const plan = useMemo(() => (parse ? resolvePlan(parse, edits) : null), [parse, edits]);
  const { drumFeel, pulse, genrePull, vocalCharacter } = dimensions;
  const song = useMemo(
    () => (plan ? compose(plan, { drumFeel, pulse, genrePull, vocalCharacter }, variation) : null),
    [plan, drumFeel, pulse, genrePull, vocalCharacter, variation]
  );

  // Hand new songs to the engine: restart for Generate/Surprise, keep position for nudges/chip edits.
  useEffect(() => {
    if (!song) return;
    if (restartRef.current) {
      restartRef.current = false;
      engine.setSong(song, "restart");
      engine.play(0);
      setPlaying(true);
      setAnalyser(engine.getAnalyser());
    } else {
      const t = setTimeout(() => engine.setSong(song, "continue"), 120);
      return () => clearTimeout(t);
    }
  }, [song]);

  // Mix-only nudges apply instantly without recomposing.
  useEffect(() => {
    engine.setMix(dimensions);
  }, [dimensions]);

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
      if (text) setIntent(text);
      restartRef.current = true;
      if (prompt === lastPrompt && parse) {
        setVariation((v) => v + 1);
        setStatus("Same vibe, new take.");
        return;
      }
      const p = parsePrompt(prompt);
      const pl = resolvePlan(p);
      setParse(p);
      setEdits({});
      setVariation(0);
      setDimensions(suggestDimensions(pl, p, DEFAULT_DIMENSIONS));
      setLastPrompt(prompt);
      setStatus(`${pl.genres.map((g) => GENRES[g.id].label).join(" × ")} · ${pl.bpm} BPM · ${keyLabel(pl.root, pl.mode)}`);
    },
    [intent, lastPrompt, parse]
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
      setAnalyser(engine.getAnalyser());
      setStatus("Playing.");
    }
  };

  const seek = (beat: number) => {
    if (!song) return;
    engine.unlock();
    engine.play(beat);
    setPlaying(true);
    setAnalyser(engine.getAnalyser());
  };

  const onEdit = (e: PlanEdits) =>
    setEdits((prev) => {
      const next: PlanEdits = { ...prev, ...e, instruments: e.instruments ?? prev.instruments };
      // Re-blending styles keeps the key you're in; mood changes may move the mode (dark → phrygian), not the root.
      if (plan && e.genres) {
        next.root = prev.root ?? plan.root;
        next.mode = prev.mode ?? plan.mode;
      }
      if (plan && e.moods) next.root = prev.root ?? plan.root;
      return next;
    });

  const exportAudio = async (withStems: boolean) => {
    if (!song) return;
    setBusy(true);
    try {
      const { blob, ext } = await engine.exportAudio(song, dimensions, withStems, setStatus);
      const slug = (lastPrompt || "piece").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
      downloadBlob(blob, `${slug}-${song.bpm}bpm${withStems ? "-stems" : ""}.${ext}`);
      setStatus(withStems ? "Mix + stems downloaded as a zip. They're yours." : "Mix downloaded (WAV). It's yours.");
    } catch (err) {
      setStatus(err instanceof Error ? `Export failed: ${err.message}` : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pb-12 pt-6 sm:max-w-2xl sm:pt-10">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">Music Studio</p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Sound canvas</h1>
        <p className="text-sm text-white/55">Say it or shape it. Everything is made on your device. Nothing goes to the cloud.</p>
      </header>

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
          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none ring-indigo-400/40 placeholder:text-white/30 focus:ring-2"
        />
        <div className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => generate()} className="min-h-11 flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50">
            Generate
          </button>
          <button type="button" disabled={busy} onClick={surprise} className="min-h-11 rounded-xl border border-pink-300/30 bg-pink-500/15 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50" title="Same vibe, new take">
            🎲 Surprise
          </button>
          <button type="button" disabled={busy} onClick={togglePlay} className="min-h-11 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50">
            {playing ? "Pause" : "Play"}
          </button>
        </div>
        {!song && (
          <div className="flex flex-wrap gap-1.5">
            {IDEAS.slice(0, 6).map((idea) => (
              <button key={idea} type="button" onClick={() => generate(idea)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/70 active:scale-95">
                {idea}
              </button>
            ))}
          </div>
        )}
      </section>

      <WavePulse analyser={analyser} active={playing} />
      {song && <SectionStrip song={song} sectionIndex={pos?.sectionIndex ?? 0} progress={pos?.progress ?? 0} chord={pos?.chord ?? ""} playing={playing} onSeek={seek} />}
      <p className="min-h-[1.25rem] text-center text-xs text-indigo-100/70" aria-live="polite">
        {status}
      </p>

      {plan && song && <UnderstoodPanel plan={plan} song={song} onEdit={onEdit} />}

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">Nudge</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {DIMENSION_META.map((m) => (
            <DimensionSlider key={m.key} label={m.label} hint={m.hint} value={dimensions[m.key]} disabled={!song} onChange={(v) => setDimensions((d) => ({ ...d, [m.key]: v }))} />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">Export (you own it)</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || !song} onClick={() => exportAudio(false)} className="min-h-10 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-medium text-white disabled:opacity-40">
            Mix (.wav)
          </button>
          <button type="button" disabled={busy || !song} onClick={() => exportAudio(true)} className="min-h-10 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">
            Mix + stems (.zip)
          </button>
        </div>
        <p className="text-[11px] text-white/40">Full-length render on your device. The stems are drums, bass, chords, lead and texture, and they line up sample-for-sample.</p>
      </section>
    </div>
  );
}
