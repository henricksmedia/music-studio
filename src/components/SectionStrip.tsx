"use client";

import type { Song } from "@/lib/music/compose";
import { parseRoman } from "@/lib/music/theory";
import { NOTE_NAMES } from "@/lib/music/theory";

type Props = { song: Song; sectionIndex: number; progress: number; chord: string; playing: boolean; onSeek: (beat: number) => void };

function chordName(sym: string, keyRoot: number) {
  if (!sym) return "";
  const c = parseRoman(sym);
  const root = NOTE_NAMES[(keyRoot + c.root) % 12];
  const minor = c.tones[1] === 3 && c.tones[2] !== 6;
  const dim = c.tones[2] === 6;
  const ext = sym.replace(/^[b#]?[ivxIVX]+/, "");
  if (ext === "5") return `${root}5`;
  return `${root}${dim ? "dim" : minor ? "m" : ""}${ext.replace(/^m(?=7b5)/, "")}`;
}

export function SectionStrip({ song, sectionIndex, progress, chord, playing, onSeek }: Props) {
  const total = song.totalBeats / 4;
  return (
    <div className="space-y-1.5">
      <div className="relative flex h-10 w-full overflow-hidden rounded-xl border border-white/10 bg-black/30">
        {song.sections.map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSeek(s.startBar * 4)}
            style={{ width: `${(s.bars / total) * 100}%` }}
            className={`relative h-full border-r border-white/10 px-1 text-[10px] font-medium leading-tight transition ${
              i === sectionIndex && playing ? "bg-indigo-500/35 text-white" : "text-white/55"
            }`}
            title={`${s.label} · ${s.bars} bars`}
          >
            <span className="block truncate">{s.label}</span>
            <span
              className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-indigo-400/40 to-pink-400/40"
              style={{ width: "100%", opacity: 0.25 + s.intensity * 0.75, transform: `scaleY(${0.5 + s.intensity})` }}
            />
          </button>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${progress * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-white/45">
        <span>{song.sections[sectionIndex]?.label ?? ""}</span>
        <span className="tabular-nums">{chordName(chord, song.keyRoot)}</span>
      </div>
    </div>
  );
}
