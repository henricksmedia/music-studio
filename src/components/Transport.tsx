"use client";

import type { Song } from "@/lib/music/compose";
import type { Position } from "@/lib/music/engine";
import type { Taps } from "@/lib/music/render";
import { keyLabel } from "@/lib/music/theory";
import { chordLabel } from "./SectionStrip";
import { MasterMeter } from "./Visuals";

type Props = {
  song: Song | null;
  playing: boolean;
  busy: boolean;
  pos: Position | null;
  status: string;
  taps: Taps | null;
  onToggle: () => void;
  onShortcuts: () => void;
};

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Always-visible player: pinned to the bottom on phones, to the top on tablets and desktops. */
export function Transport({ song, playing, busy, pos, status, taps, onToggle, onShortcuts }: Props) {
  const section = song && pos ? song.sections[pos.sectionIndex] : null;
  const elapsed = song && pos ? pos.progress * song.durationSec : 0;
  const chord = song && pos ? chordLabel(pos.chord, song) : "";
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#0b0b14]/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:sticky md:top-0 md:bottom-auto md:border-b md:border-t-0 md:pb-0"
      data-testid="transport"
    >
      <div className="mx-auto flex max-w-lg items-center gap-3 px-3 py-2 md:max-w-none md:px-6">
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          aria-label={playing ? "Pause" : song ? "Play" : "Generate and play"}
          title={`${playing ? "Pause" : "Play"} (Space)`}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-lg text-white shadow-lg shadow-indigo-500/30 transition hover:bg-indigo-400 active:scale-95 disabled:opacity-50 md:h-11 md:w-11"
          data-testid="play-toggle"
        >
          <span aria-hidden>{playing ? "❚❚" : "▶"}</span>
        </button>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex items-baseline gap-2 text-sm text-white">
            <span className="truncate font-semibold">{section ? section.label : song ? "Ready" : "No song yet"}</span>
            {song && (
              <span className="shrink-0 text-xs tabular-nums text-white/60">
                {mmss(elapsed)} / {mmss(song.durationSec)}
              </span>
            )}
            {song && (
              <span className="hidden shrink-0 text-xs text-white/60 sm:inline">
                · {song.bpm} BPM · {keyLabel(song.keyRoot, song.mode)}
                {chord && playing ? ` · ${chord}` : ""}
              </span>
            )}
          </div>
          <p className="line-clamp-2 text-xs text-indigo-100/80 md:truncate" aria-live="polite" title={status}>
            {status}
          </p>
        </div>
        <MasterMeter taps={taps} className="hidden h-6 w-24 shrink-0 sm:block lg:w-36" />
        <button type="button" onClick={onShortcuts} className="hidden min-h-9 shrink-0 rounded-lg border border-white/15 px-2.5 text-xs text-white/70 hover:text-white md:block" title="Keyboard shortcuts (?)">
          ⌨ ?
        </button>
      </div>
    </div>
  );
}
