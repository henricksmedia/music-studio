"use client";

import { useEffect, useRef, useState } from "react";
import type { Song } from "@/lib/music/compose";
import type { PlanEdits } from "@/lib/music/parse";
import { MODE_IDS, MODE_INFO, NOTE_NAMES, type ChordColorId } from "@/lib/music/theory";
import { CHORD_COLORS, FEELS, HARMONY_TRICKS, METERS, METER_IDS, MIXED_CYCLES, POLYMETER_CYCLES, POLY_RATIOS, PROGRESSIONS, PROGRESSION_IDS, TRICKS, TRICK_IDS, type FeelId, type StyleOverrides, type TrickId } from "@/lib/music/spec";
import { Collapsible, ExplainChip, chipCls } from "./ui";

type Props = { song: Song; onEdit: (e: PlanEdits) => void };

const GROUP_LABEL: Record<string, string> = { pulse: "Pulse & accents", cycles: "Cycles & polyrhythm", subdivision: "Subdivisions", parts: "How parts behave", feel: "Feel & texture" };

function DebouncedSlider({ label, hint, value, onCommit }: { label: string; hint: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const t = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setV(value), [value]);
  return (
    <label className="flex flex-col gap-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <span className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-white">{label}</span>
        <span className="tabular-nums text-indigo-200/80">{v}</span>
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          setV(n);
          if (t.current) clearTimeout(t.current);
          t.current = setTimeout(() => onCommit(n), 300);
        }}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-indigo-400"
      />
      <span className="text-[11px] leading-snug text-white/60">{hint}</span>
    </label>
  );
}

export function GroovePanel({ song, onEdit }: Props) {
  const R = song.spec.rhythm;
  const st = (s: StyleOverrides) => onEdit({ style: s });
  const on = (t: TrickId) => R.tricks.includes(t);
  const groups = ["pulse", "cycles", "subdivision", "parts", "feel"] as const;
  const meter = METERS[R.meter];
  return (
    <Collapsible title="Groove" subtitle={`${song.meterLabel} · ${FEELS[R.feel].label} · ${R.tricks.filter((t) => t !== "humanize").map((t) => TRICKS[t].label).slice(0, 3).join(", ") || "plain"}`} testId="groove-panel">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Meter</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {METER_IDS.map((m) => (
            <ExplainChip key={m} label={METERS[m].label} plain={METERS[m].plain} active={R.meter === m} onClick={() => st({ meter: m, grouping: undefined })} />
          ))}
        </div>
        {meter.groupings.length > 1 && R.meter !== "mixed" && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-white/60">Accent groups:</span>
            {meter.groupings.map((g) => (
              <button key={g.join("+")} type="button" className={chipCls(R.grouping.join() === g.join())} onClick={() => st({ grouping: g })}>
                {g.join("+")}
              </button>
            ))}
          </div>
        )}
        {R.meter === "mixed" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {MIXED_CYCLES.map((c, i) => (
              <button key={c.label} type="button" className={chipCls(R.meterLabel.includes(c.label) || false)} onClick={() => st({ mixedCycle: i })}>
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Feel</p>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(FEELS) as FeelId[]).map((f) => (
            <ExplainChip key={f} label={FEELS[f].label} plain={FEELS[f].plain} active={R.feel === f} onClick={() => st({ feel: f })} />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <DebouncedSlider label="Swing" hint="How long-short the off-beats are." value={Math.round(R.swing * 100)} onCommit={(v) => st(v > 8 && R.feel === "straight" ? { swing: v, feel: "swing" } : { swing: v })} />
        <DebouncedSlider label="Syncopation" hint="How often accents land between beats." value={Math.round(R.syncopation * 100)} onCommit={(v) => st({ syncopation: v })} />
        <DebouncedSlider label="Human feel" hint="Tiny timing and loudness drift, like a player." value={Math.round(R.humanize * 100)} onCommit={(v) => st({ humanize: v })} />
        <DebouncedSlider label="Glitch" hint="Stutters and chopped repeats at phrase ends." value={Math.round(R.glitch * 100)} onCommit={(v) => st({ glitch: v, tricks: { glitch: v > 15 } })} />
      </div>
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">{GROUP_LABEL[g]}</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {TRICK_IDS.filter((t) => TRICKS[t].group === g).map((t) => (
              <ExplainChip key={t} label={`${on(t) ? "✓ " : ""}${TRICKS[t].label}`} plain={TRICKS[t].plain} active={on(t)} onClick={() => st({ tricks: { [t]: !on(t) } })} />
            ))}
          </div>
          {g === "pulse" && on("clave") && (
            <div className="mt-1.5 flex gap-1.5">
              {(["3-2", "2-3"] as const).map((d) => (
                <button key={d} type="button" className={chipCls(R.clave === d)} onClick={() => st({ clave: d })}>
                  {d} clave
                </button>
              ))}
            </div>
          )}
          {g === "cycles" && on("polyrhythm") && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {POLY_RATIOS.map((r) => (
                <button key={r.join(":")} type="button" className={chipCls(R.polyRatio.join() === r.join())} onClick={() => st({ polyRatio: r })}>
                  {r[0]}:{r[1]}
                </button>
              ))}
            </div>
          )}
          {g === "cycles" && on("polymeter") && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {POLYMETER_CYCLES.map((c) => (
                <button key={c} type="button" className={chipCls(R.polymeterCycle === c)} onClick={() => st({ polymeterCycle: c })}>
                  {c}-step riff
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </Collapsible>
  );
}

export function HarmonyPanel({ song, onEdit }: Props) {
  const H = song.spec.harmony;
  const st = (s: StyleOverrides) => onEdit({ style: s });
  return (
    <Collapsible title="Harmony" subtitle={`${NOTE_NAMES[song.keyRoot]} ${MODE_INFO[song.mode].name} · ${song.progressionLabel}`} testId="harmony-panel">
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Mode (the color of the scale)</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {MODE_IDS.map((m) => (
            <ExplainChip key={m} label={MODE_INFO[m].name} plain={MODE_INFO[m].plain} active={song.mode === m} onClick={() => onEdit({ mode: m })} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Chord color</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
          {(Object.keys(CHORD_COLORS) as ChordColorId[]).map((c) => (
            <ExplainChip key={c} label={CHORD_COLORS[c].label} plain={CHORD_COLORS[c].plain} active={H.chordColor === c} onClick={() => st({ chordColor: c })} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Progression</p>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <ExplainChip label="Style's own" plain="Let the genre pick its usual changes." active={H.progression === "genre"} onClick={() => st({ progression: "genre" })} />
          {PROGRESSION_IDS.map((p) => (
            <ExplainChip key={p} label={`${PROGRESSIONS[p].label} · ${PROGRESSIONS[p].roman.join("–")}`} plain={PROGRESSIONS[p].plain} active={H.progression === p} onClick={() => st({ progression: p })} />
          ))}
        </div>
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-white/60">Harmony tricks</p>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(HARMONY_TRICKS) as (keyof typeof HARMONY_TRICKS)[]).map((k) => (
            <ExplainChip key={k} label={`${H[k] ? "✓ " : ""}${HARMONY_TRICKS[k].label}`} plain={HARMONY_TRICKS[k].plain} active={H[k]} onClick={() => st({ harmonyTricks: { [k]: !H[k] } })} />
          ))}
        </div>
      </div>
    </Collapsible>
  );
}
