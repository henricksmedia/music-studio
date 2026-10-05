"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_DIMENSIONS,
  STEM_LABELS,
  type Dimensions,
  type StemId,
} from "@/lib/types";
import { engine } from "@/lib/audioEngine";
import { DimensionSlider } from "./DimensionSlider";
import { WavePulse } from "./WavePulse";

const DIMENSION_META: {
  key: keyof Dimensions;
  label: string;
  hint: string;
}[] = [
  { key: "space", label: "Space", hint: "More air, width, echo" },
  { key: "bass", label: "Bass", hint: "Low-end weight" },
  { key: "drumFeel", label: "Drum feel", hint: "Soft & sparse → hard & busy" },
  { key: "grit", label: "Grit", hint: "Clean → textured edge" },
  { key: "pulse", label: "Pulse", hint: "Calm → driving energy" },
  {
    key: "vocalCharacter",
    label: "Vocal character",
    hint: "Airy lead → present & close",
  },
  {
    key: "genrePull",
    label: "Genre pull",
    hint: "Folk / organic ← → electronic / cyborg",
  },
];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function SoundCanvas() {
  const [intent, setIntent] = useState(
    "dusk indie country rock with a pulse of trance"
  );
  const [dimensions, setDimensions] = useState<Dimensions>(DEFAULT_DIMENSIONS);
  const [seed, setSeed] = useState(1);
  const [generated, setGenerated] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Describe a vibe, then Generate.");
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const params = useMemo(
    () => ({ intent: intent.trim() || "ambient mood", dimensions, seed }),
    [intent, dimensions, seed]
  );

  const generate = useCallback(async () => {
    setBusy(true);
    try {
      await engine.ensure();
      const nextSeed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
      setSeed(nextSeed);
      const p = {
        intent: intent.trim() || "ambient mood",
        dimensions,
        seed: nextSeed,
      };
      await engine.play(p);
      setGenerated(true);
      setPlaying(true);
      setAnalyser(engine.getAnalyser());
      setStatus("Playing — nudge any dimension; the piece stays one song.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Audio failed to start");
    } finally {
      setBusy(false);
    }
  }, [intent, dimensions]);

  const togglePlay = useCallback(async () => {
    if (!generated) {
      await generate();
      return;
    }
    if (playing) {
      engine.pause();
      setPlaying(false);
      setStatus("Paused.");
    } else {
      await engine.play(params);
      setPlaying(true);
      setAnalyser(engine.getAnalyser());
      setStatus("Playing.");
    }
  }, [generated, playing, generate, params]);

  // Live nudges: rebuild coherent loop when dimensions change while playing
  useEffect(() => {
    if (!generated || !playing) return;
    const t = window.setTimeout(() => {
      engine.update(params).catch(() => {});
    }, 180);
    return () => clearTimeout(t);
  }, [params, generated, playing]);

  const setDim = (key: keyof Dimensions, value: number) => {
    setDimensions((d) => ({ ...d, [key]: value }));
  };

  const exportOne = async (stem: StemId | "mix") => {
    if (!generated) {
      setStatus("Generate a piece first.");
      return;
    }
    setBusy(true);
    setStatus(`Rendering ${stem}…`);
    try {
      // ensure params are current even if paused
      await engine.ensure();
      if (!playing) {
        // seed params into engine without necessarily playing long
        await engine.play(params);
        engine.pause();
        setPlaying(false);
      }
      const blob = await engine.exportWav(stem, 4);
      const slug = (intent.trim() || "piece")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      downloadBlob(blob, `${slug}-${stem}.wav`);
      setStatus(
        stem === "mix"
          ? "Mix WAV downloaded (local render)."
          : `${STEM_LABELS[stem]} WAV downloaded.`
      );
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const exportAll = async () => {
    if (!generated) {
      setStatus("Generate a piece first.");
      return;
    }
    setBusy(true);
    setStatus("Rendering mix + stems…");
    try {
      await engine.ensure();
      if (!playing) {
        await engine.play(params);
        engine.pause();
        setPlaying(false);
      }
      const slug = (intent.trim() || "piece")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 40);
      const mix = await engine.exportWav("mix", 4);
      downloadBlob(mix, `${slug}-mix.wav`);
      for (const id of Object.keys(STEM_LABELS) as StemId[]) {
        const blob = await engine.exportWav(id, 4);
        downloadBlob(blob, `${slug}-${id}.wav`);
      }
      setStatus("Mix + stems exported (local WAV). You own these files.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-2xl sm:pt-10">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-300/80">
          Music Studio
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          Sound canvas
        </h1>
        <p className="text-sm text-white/55">
          Say a vibe. Hear a piece. Nudge feel — not plugins. Local-first; nothing
          phones home for the sound.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-white/50">
            Intent
          </span>
          <textarea
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            rows={3}
            placeholder="lonely country rock with a pulse of trance…"
            className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-base text-white outline-none ring-indigo-400/40 placeholder:text-white/30 focus:ring-2"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={generate}
            className="min-h-11 flex-1 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50"
          >
            Generate
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={togglePlay}
            className="min-h-11 rounded-xl border border-white/15 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white active:scale-[0.98] disabled:opacity-50"
          >
            {playing ? "Pause" : "Play"}
          </button>
        </div>
      </section>

      <WavePulse analyser={analyser} active={playing} />

      <p className="min-h-[1.25rem] text-center text-xs text-indigo-100/70">
        {status}
      </p>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">
          Nudge
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {DIMENSION_META.map((m) => (
            <DimensionSlider
              key={m.key}
              label={m.label}
              hint={m.hint}
              value={dimensions[m.key]}
              disabled={!generated}
              onChange={(v) => setDim(m.key, v)}
            />
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-white/50">
          Export (you own it)
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy || !generated}
            onClick={() => exportOne("mix")}
            className="min-h-10 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
          >
            Mix WAV
          </button>
          {(Object.keys(STEM_LABELS) as StemId[]).map((id) => (
            <button
              key={id}
              type="button"
              disabled={busy || !generated}
              onClick={() => exportOne(id)}
              className="min-h-10 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
            >
              {STEM_LABELS[id]}
            </button>
          ))}
          <button
            type="button"
            disabled={busy || !generated}
            onClick={exportAll}
            className="min-h-10 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
          >
            All stems
          </button>
        </div>
        <p className="text-[11px] text-white/40">
          Prototype audio is on-device Web Audio (not a cloud model). Stems are
          separate local layers rendered to WAV.
        </p>
      </section>
    </div>
  );
}
