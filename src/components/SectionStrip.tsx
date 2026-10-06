"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Section, Song } from "@/lib/music/compose";
import type { PlanEdits } from "@/lib/music/parse";
import { parseRoman, NOTE_NAMES } from "@/lib/music/theory";
import { ENDINGS, HOOKS, OPENINGS, type StyleOverrides } from "@/lib/music/spec";
import { chipCls } from "./ui";

type Props = { song: Song; sectionIndex: number; progress: number; chord: string; playing: boolean; onSeek: (beat: number) => void; onEdit?: (e: PlanEdits) => void };

function chordName(sym: string, keyRoot: number) {
  if (!sym) return "";
  const c = parseRoman(sym);
  const root = NOTE_NAMES[(keyRoot + c.root) % 12];
  const minor = c.tones[1] === 3 && c.tones[2] !== 6;
  const dim = c.tones[2] === 6;
  const ext = sym.replace(/^[b#]?[ivxIVX]+/, "");
  if (ext === "5") return `${root}5`;
  return `${root}${dim ? "dim" : minor ? "m" : ""}${ext.replace(/^(m|dim)(?=7|$)/, "").replace(/^\+$/, "aug")}`;
}

const SHORT: Record<string, string> = { intro: "In", verse: "V", build: "Bld", chorus: "Hook", drop: "Drop", dropout: "Out", breakdown: "Brk", bridge: "Br", solo: "Solo", outro: "End" };
const short = (s: Section) => (s.type === "verse" ? (s.final ? "V" : `V${s.part ?? ""}`) : s.final ? `${SHORT[s.type]}!` : SHORT[s.type]);

type Tweak = { label: string; active: boolean; patch: StyleOverrides };
function tweaksFor(s: Section, song: Song): Tweak[] {
  const R = song.spec.rhythm;
  const H = song.spec.harmony;
  const P = song.spec.production;
  const tr = (id: (typeof R.tricks)[number], label: string): Tweak => ({ label, active: R.tricks.includes(id), patch: { tricks: { [id]: !R.tricks.includes(id) } } });
  const dv = (id: (typeof P.development)[number], label: string): Tweak => ({ label, active: P.development.includes(id), patch: { development: { [id]: !P.development.includes(id) } } });
  const ht = (id: "pedal" | "drone" | "borrowed" | "chromatic", label: string): Tweak => ({ label, active: H[id], patch: { harmonyTricks: { [id]: !H[id] } } });
  switch (s.type) {
    case "intro":
      return (Object.keys(OPENINGS) as (keyof typeof OPENINGS)[]).map((o) => ({ label: OPENINGS[o].label, active: P.opening === o, patch: { opening: o } }));
    case "verse":
      return s.part === "B" ? [tr("brokenTime", "Broken-time kick"), tr("displacement", "Shift an 8th late"), dv("percRise", "Extra percussion"), tr("polyrhythm", "Polyrhythm layer")] : [ht("pedal", "Pedal bass"), tr("callResponse", "Call & response"), tr("breaks", "Break in last bar"), tr("polymeter", "Polymeter line")];
    case "build":
      return [dv("filter", "Filter sweep"), dv("saturation", "Push saturation"), dv("dropouts", "Cut drums last bar"), { label: "No snare roll/riser", active: P.avoid.includes("festivalBuilds"), patch: { avoid: P.avoid.includes("festivalBuilds") ? P.avoid.filter((x) => x !== "festivalBuilds") : [...P.avoid, "festivalBuilds"] } }];
    case "chorus":
    case "drop":
      return s.final
        ? [ht("borrowed", "Borrowed chord"), ht("chromatic", "Chromatic bII7"), tr("displacement", "Altered hook rhythm"), dv("saturation", "More saturation")]
        : (Object.keys(HOOKS) as (keyof typeof HOOKS)[]).map((h) => ({ label: `Hook: ${HOOKS[h].label}`, active: P.hook === h, patch: { hook: h } }));
    case "dropout":
      return [dv("filter", "Filtered delay throw"), dv("dropouts", "Drum dropouts")];
    case "bridge":
    case "breakdown":
      return [ht("drone", "Drone"), tr("deconstruction", "Deconstruct beat"), ht("borrowed", "Borrowed chord")];
    case "outro":
      return (Object.keys(ENDINGS) as (keyof typeof ENDINGS)[]).map((e) => ({ label: ENDINGS[e].label, active: P.ending === e, patch: { ending: e } }));
    default:
      return [tr("callResponse", "Call & response")];
  }
}

/** Labels from longest to shortest; a segment shows the first one that fits, never a word cut in half. */
function labelForms(s: Section): string[] {
  const full = s.label;
  const noParen = full.replace(/\s*\(.*\)$/, "");
  const word = noParen.replace(/^Final /, "").replace(/ [AB]$/, "");
  return Array.from(new Set([full, noParen, word, short(s)]));
}
// Geist 11px semibold: ~6.4 px per character, plus padding.
const fits = (text: string, px: number) => text.length * 6.4 + 10 <= px;

export function chordLabel(chord: string, song: Song) {
  return chordName(chord, song.keyRoot);
}

export function SectionStrip({ song, sectionIndex, progress, chord, playing, onSeek, onEdit, lanes }: Props & { lanes?: (sel: number | null, select: (i: number) => void) => ReactNode }) {
  const total = song.totalBeats;
  const [sel, setSel] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (sel !== null && sel >= song.sections.length) setSel(null);
  }, [song, sel]);
  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const shown = sel ?? (playing ? sectionIndex : null);
  const s = shown !== null ? song.sections[shown] : null;
  const select = (i: number) => setSel((cur) => (cur === i ? null : i));
  const chipsRef = useRef<HTMLDivElement>(null);
  const focusIdx = shown ?? sectionIndex;
  useEffect(() => {
    const row = chipsRef.current;
    const chip = row?.children[focusIdx] as HTMLElement | undefined;
    if (!row || !chip || !row.clientWidth) return;
    const left = chip.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollTo({ left: left - 12, behavior: "smooth" });
  }, [focusIdx]);
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = song.sections.length;
    const to = e.key === "ArrowRight" ? Math.min(n - 1, i + 1) : e.key === "ArrowLeft" ? Math.max(0, i - 1) : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to >= 0) {
      e.preventDefault();
      setSel(to);
      (barRef.current?.children[to] as HTMLElement | undefined)?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      setSel(i);
      onSeek(song.sections[i].startBeat);
    }
  };
  return (
    <div className="space-y-2" data-testid="section-strip">
      <div className="flex gap-2">
        {lanes && <div className="hidden w-16 shrink-0 self-center text-[11px] font-semibold uppercase tracking-wide text-white/60 sm:block">Sections</div>}
        <div ref={barRef} className="relative flex h-3 min-w-0 flex-1 overflow-hidden rounded-full border border-white/10 bg-black/30 sm:h-12 sm:rounded-xl md:h-14" role="toolbar" aria-label="Sections">
          {song.sections.map((x, i) => {
            const px = (x.beats / total) * width;
            const text = labelForms(x).find((t) => fits(t, px)) ?? "";
            const showBars = fits(`${x.bars} bars`, px);
            const isPlaying = i === sectionIndex && playing;
            return (
              <button
                key={i}
                type="button"
                onClick={() => select(i)}
                onKeyDown={(e) => onKey(e, i)}
                tabIndex={i === (shown ?? 0) ? 0 : -1}
                style={{ width: `${(x.beats / total) * 100}%` }}
                className={`relative flex h-full flex-col items-center justify-center overflow-hidden max-sm:pointer-events-none whitespace-nowrap border-r border-white/10 leading-tight transition last:border-r-0 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-indigo-300 ${
                  isPlaying ? "bg-indigo-500/35 text-white" : shown === i ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/5"
                }`}
                title={`${x.label} · ${x.bars} bars`}
                aria-label={`${x.label}, ${x.bars} bars`}
                aria-pressed={shown === i}
              >
                <span className="hidden px-1 text-[11px] font-semibold sm:inline">{text}</span>
                {showBars && <span className="hidden px-1 text-[10px] text-white/55 md:block">{x.bars} bars</span>}
                <span className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-400/50 to-pink-400/50" style={{ opacity: 0.2 + x.intensity * 0.8, transform: `scaleY(${0.5 + x.intensity})` }} />
              </button>
            );
          })}
          <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${progress * 100}%` }} />
        </div>
      </div>
      <div ref={chipsRef} className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:hidden" data-testid="section-chips">
        {song.sections.map((x, i) => (
          <button
            key={i}
            type="button"
            onClick={() => select(i)}
            aria-pressed={shown === i}
            className={`flex min-h-11 min-w-16 shrink-0 flex-col items-start justify-center rounded-xl border px-3 leading-tight ${
              i === sectionIndex && playing ? "border-indigo-300/60 bg-indigo-500/30 text-white" : shown === i ? "border-white/30 bg-white/12 text-white" : "border-white/10 bg-white/[0.04] text-white/80"
            }`}
          >
            <span className="whitespace-nowrap text-xs font-semibold">{x.label}</span>
            <span className="text-[10px] text-white/60">{x.bars} bars</span>
          </button>
        ))}
      </div>
      {lanes?.(shown, select)}
      <div className="flex justify-between gap-2 text-[11px] text-white/60">
        <span>
          {playing ? `Now: ${song.sections[sectionIndex]?.label ?? ""} · ` : ""}
          <span className="hidden sm:inline">Select a section for its breakdown · ← → to move, Enter to play</span>
          <span className="sm:hidden">Tap a section for its breakdown</span>
        </span>
        <span className="tabular-nums">{chordName(chord, song.keyRoot)}</span>
      </div>
      {s && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" data-testid="section-detail">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              {s.label} <span className="font-normal text-white/60">· {s.bars} bars</span>
            </p>
            <button type="button" onClick={() => onSeek(s.startBeat)} className="min-h-11 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white md:min-h-9">
              ▶ Play from here
            </button>
          </div>
          <dl className="space-y-1.5 text-[12px] leading-snug">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/60">Instruments</dt>
              <dd className="text-white/85">{s.desc.instruments.join(" · ") || "silence"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/60">Rhythm</dt>
              <dd className="text-white/85">{s.desc.rhythm}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/60">Production changes</dt>
              <dd className="text-white/85">
                <ul className="list-disc pl-4">
                  {s.desc.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/60">Role</dt>
              <dd className="text-white/85">{s.desc.role}</dd>
            </div>
          </dl>
          {onEdit && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tweaksFor(s, song).map((t) => (
                <button key={t.label} type="button" className={chipCls(t.active)} onClick={() => onEdit({ style: t.patch })}>
                  {t.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
