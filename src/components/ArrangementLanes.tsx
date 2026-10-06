"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { STEM_IDS, type Song, type StemId } from "@/lib/music/compose";
import type { Tracks } from "@/lib/music/tracks";
import { isAudible } from "@/lib/music/tracks";
import { TRACK_COLORS } from "./Visuals";

type Props = { song: Song; tracks: Tracks; progress: number; selected: number | null; onSelect: (i: number) => void };

/** Notes per track over the whole song (from `song.events`, not audio), with the section columns of the strip above. */
export function ArrangementLanes({ song, tracks, progress, selected, onSelect }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(0);
  const total = song.totalBeats;
  const rows = useMemo(() => STEM_IDS.filter((id) => song.events.some((e) => e.stem === id)), [song]);
  const range = useMemo(() => {
    const r = {} as Record<StemId, [number, number]>;
    for (const id of STEM_IDS) r[id] = [127, 0];
    for (const e of song.events) {
      const ns = e.notes?.length ? e.notes : [e.midi];
      for (const n of ns) {
        r[e.stem][0] = Math.min(r[e.stem][0], n);
        r[e.stem][1] = Math.max(r[e.stem][1], n);
      }
    }
    return r;
  }, [song]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ro = new ResizeObserver(() => setW(c.getBoundingClientRect().width));
    ro.observe(c);
    return () => ro.disconnect();
  }, []);

  const rowH = 18;
  const h = rows.length * rowH;
  useEffect(() => {
    const c = ref.current;
    if (!c || !w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    rows.forEach((id, r) => {
      const y0 = r * rowH;
      ctx.fillStyle = r % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.045)";
      ctx.fillRect(0, y0, w, rowH);
      ctx.fillStyle = TRACK_COLORS[id];
      ctx.globalAlpha = isAudible(tracks, id) ? 0.85 : 0.25;
      const [lo, hi] = range[id];
      const span = Math.max(1, hi - lo);
      for (const e of song.events) {
        if (e.stem !== id) continue;
        const x = (e.t / total) * w;
        const ew = Math.max(1, (e.dur / total) * w);
        if (id === "drums") {
          const lane = e.midi % 3;
          ctx.fillRect(x, y0 + 3 + lane * 4, Math.max(1, Math.min(ew, 2)), 3);
        } else {
          const ns = e.notes?.length ? e.notes : [e.midi];
          for (const n of ns) ctx.fillRect(x, y0 + 2 + (1 - (n - lo) / span) * (rowH - 6), ew, 2);
        }
      }
      ctx.globalAlpha = 1;
    });
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    for (const s of song.sections.slice(1)) ctx.fillRect(Math.round((s.startBeat / total) * w), 0, 1, h);
  }, [song, tracks, rows, range, w, h, total]);

  return (
    <div className="relative" data-testid="arrangement-lanes">
      <div className="flex gap-2">
        <ul className="hidden w-16 shrink-0 text-[11px] leading-[18px] text-white/60 sm:block" aria-hidden>
          {rows.map((id) => (
            <li key={id} className="truncate">
              {tracks[id].name}
            </li>
          ))}
        </ul>
        <div className="relative min-w-0 flex-1">
          <canvas ref={ref} style={{ height: h }} className="block w-full rounded-md" role="img" aria-label={`Arrangement: ${rows.map((id) => tracks[id].name).join(", ")} over ${song.sections.length} sections`} />
          {selected !== null && song.sections[selected] && (
            <div
              className="pointer-events-none absolute inset-y-0 rounded-sm border border-indigo-300/50 bg-indigo-400/10"
              style={{ left: `${(song.sections[selected].startBeat / total) * 100}%`, width: `${(song.sections[selected].beats / total) * 100}%` }}
            />
          )}
          <div className="absolute inset-0 flex">
            {song.sections.map((s, i) => (
              <button key={i} type="button" tabIndex={-1} aria-hidden onClick={() => onSelect(i)} style={{ width: `${(s.beats / total) * 100}%` }} className="h-full" />
            ))}
          </div>
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${progress * 100}%` }} />
        </div>
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-white/60 sm:hidden" aria-hidden>
        {rows.map((id) => (
          <li key={id} className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: TRACK_COLORS[id] }} />
            {tracks[id].name}
          </li>
        ))}
      </ul>
    </div>
  );
}
