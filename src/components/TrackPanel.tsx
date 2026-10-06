"use client";

import { useEffect, useState } from "react";
import { STEM_IDS, type StemId } from "@/lib/music/compose";
import { MAX_DB, MIN_DB, TRACK_LABELS, isAudible, type TrackSettings, type Tracks } from "@/lib/music/tracks";
import type { Taps } from "@/lib/music/render";
import { Collapsible } from "./ui";
import { TrackScope } from "./Visuals";

type Props = {
  tracks: Tracks;
  present: Record<StemId, boolean>;
  rerollable: Record<StemId, boolean>;
  onChange: (id: StemId, patch: Partial<TrackSettings>) => void;
  onNewTake: (id: StemId) => void;
  taps?: Taps | null;
  defaultOpen?: boolean;
};

const dbLabel = (db: number) => (db <= MIN_DB ? "−∞ dB" : `${db > 0 ? "+" : ""}${db.toFixed(0)} dB`);
const panLabel = (p: number) => (Math.abs(p) < 0.03 ? "C" : `${p < 0 ? "L" : "R"}${Math.round(Math.abs(p) * 100)}`);

function NameInput({ value, fallback, onCommit }: { value: string; fallback: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim().slice(0, 40);
    if (!t) setV(value);
    else if (t !== value) onCommit(t);
  };
  return (
    <input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      aria-label={`${fallback} track name`}
      maxLength={40}
      className="min-h-11 min-w-0 flex-1 rounded-lg md:min-h-9 border border-transparent bg-transparent px-1.5 text-sm font-medium text-white outline-none focus:border-white/20 focus:bg-white/5"
    />
  );
}

export function TrackPanel({ tracks, present, rerollable, onChange, onNewTake, taps = null, defaultOpen = false }: Props) {
  const anySolo = STEM_IDS.some((id) => tracks[id].solo);
  const changed = STEM_IDS.filter((id) => tracks[id].seed || tracks[id].mute || tracks[id].solo || tracks[id].gainDb || tracks[id].pan).length;
  return (
    <Collapsible title="Tracks" subtitle={`5 parts${changed ? ` · ${changed} adjusted` : ""}${anySolo ? " · solo on" : ""} · keys 1–5 solo`} testId="track-panel" defaultOpen={defaultOpen}>
      <ul className="space-y-2">
        {STEM_IDS.map((id) => {
          const t = tracks[id];
          const heard = isAudible(tracks, id);
          return (
            <li key={id} data-testid={`track-${id}`} className={`rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-2 ${heard ? "" : "opacity-55"}`}>
              <div className="flex items-center gap-1.5">
                <NameInput value={t.name} fallback={TRACK_LABELS[id]} onCommit={(name) => onChange(id, { name })} />
                {!present[id] && <span className="shrink-0 text-[10px] text-white/60">silent here</span>}
                <button type="button" aria-pressed={t.mute} title="Mute" onClick={() => onChange(id, { mute: !t.mute })} className={`min-h-11 w-11 shrink-0 rounded-lg border text-xs font-bold md:min-h-9 md:w-9 ${t.mute ? "border-amber-300/60 bg-amber-500/30 text-white" : "border-white/15 text-white/70"}`}>
                  M
                </button>
                <button type="button" aria-pressed={t.solo} title="Solo" onClick={() => onChange(id, { solo: !t.solo })} className={`min-h-11 w-11 shrink-0 rounded-lg border text-xs font-bold md:min-h-9 md:w-9 ${t.solo ? "border-emerald-300/60 bg-emerald-500/30 text-white" : "border-white/15 text-white/70"}`}>
                  S
                </button>
              </div>
              {present[id] && (
                <div className="mt-1 rounded-md bg-black/30 px-1">
                  <TrackScope taps={taps} id={id} muted={!heard} />
                </div>
              )}
              <div className="mt-1.5 grid grid-cols-[1fr_5.5rem] items-center gap-x-3 gap-y-1">
                <label className="flex items-center gap-2">
                  <span className="w-9 text-[11px] text-white/60">Vol</span>
                  <input type="range" min={MIN_DB} max={MAX_DB} step={1} value={t.gainDb} onChange={(e) => onChange(id, { gainDb: Number(e.target.value) })} onDoubleClick={() => onChange(id, { gainDb: 0 })} aria-label={`${t.name} volume`} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-indigo-400" />
                </label>
                <span className="text-right text-[11px] tabular-nums text-indigo-200/80">{dbLabel(t.gainDb)}</span>
                <label className="flex items-center gap-2">
                  <span className="w-9 text-[11px] text-white/60">Pan</span>
                  <input type="range" min={-100} max={100} step={5} value={Math.round(t.pan * 100)} onChange={(e) => onChange(id, { pan: Number(e.target.value) / 100 })} onDoubleClick={() => onChange(id, { pan: 0 })} aria-label={`${t.name} pan`} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-indigo-400" />
                </label>
                <span className="text-right text-[11px] tabular-nums text-indigo-200/80">{panLabel(t.pan)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <button type="button" onClick={() => onNewTake(id)} disabled={!rerollable[id]} className="min-h-11 md:min-h-9 rounded-lg border border-white/15 bg-white/5 px-3 text-xs text-white disabled:opacity-40" title={rerollable[id] ? "Rewrite only this part; everything else stays" : "This part has no alternative takes in this song"}>
                  ↻ New take
                </button>
                {t.seed !== 0 && (
                  <button type="button" onClick={() => onChange(id, { seed: 0 })} className="min-h-11 rounded-lg px-2 text-xs text-white/70 underline-offset-2 hover:underline md:min-h-9">
                    Back to original part
                  </button>
                )}
                {(t.gainDb !== 0 || t.pan !== 0) && (
                  <button type="button" onClick={() => onChange(id, { gainDb: 0, pan: 0 })} className="min-h-11 rounded-lg px-2 text-xs text-white/70 underline-offset-2 hover:underline md:min-h-9">
                    Reset level & pan
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-white/60">Mute, solo, level and pan are heard live and used in exports. Stems export only the tracks you can hear.</p>
    </Collapsible>
  );
}
