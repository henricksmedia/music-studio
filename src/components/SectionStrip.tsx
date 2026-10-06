"use client";

import { useEffect, useState } from "react";
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

export function SectionStrip({ song, sectionIndex, progress, chord, playing, onSeek, onEdit }: Props) {
  const total = song.totalBeats;
  const [sel, setSel] = useState<number | null>(null);
  useEffect(() => {
    if (sel !== null && sel >= song.sections.length) setSel(null);
  }, [song, sel]);
  const shown = sel ?? (playing ? sectionIndex : null);
  const s = shown !== null ? song.sections[shown] : null;
  return (
    <div className="space-y-1.5" data-testid="section-strip">
      <div className="relative flex h-11 w-full overflow-hidden rounded-xl border border-white/10 bg-black/30">
        {song.sections.map((x, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setSel(sel === i ? null : i)}
            style={{ width: `${(x.beats / total) * 100}%` }}
            className={`relative h-full border-r border-white/10 text-[10px] font-semibold leading-tight transition ${
              i === sectionIndex && playing ? "bg-indigo-500/35 text-white" : shown === i ? "bg-white/10 text-white" : "text-white/55"
            }`}
            title={`${x.label} · ${x.bars} bars`}
            aria-label={`${x.label}, ${x.bars} bars`}
          >
            <span className="block truncate px-0.5">{short(x)}</span>
            <span className="absolute bottom-0 left-0 h-1 w-full bg-gradient-to-r from-indigo-400/50 to-pink-400/50" style={{ opacity: 0.2 + x.intensity * 0.8, transform: `scaleY(${0.5 + x.intensity})` }} />
          </button>
        ))}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white/80" style={{ left: `${progress * 100}%` }} />
      </div>
      <div className="flex justify-between text-[11px] text-white/45">
        <span>{song.sections[sectionIndex]?.label ?? ""} · tap a section for its breakdown</span>
        <span className="tabular-nums">{chordName(chord, song.keyRoot)}</span>
      </div>
      {s && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3" data-testid="section-detail">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              {s.label} <span className="font-normal text-white/45">· {s.bars} bars</span>
            </p>
            <button type="button" onClick={() => onSeek(s.startBeat)} className="min-h-9 rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white">
              ▶ Play from here
            </button>
          </div>
          <dl className="space-y-1.5 text-[12px] leading-snug">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Instruments</dt>
              <dd className="text-white/85">{s.desc.instruments.join(" · ") || "silence"}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Rhythm</dt>
              <dd className="text-white/85">{s.desc.rhythm}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Production changes</dt>
              <dd className="text-white/85">
                <ul className="list-disc pl-4">
                  {s.desc.changes.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-white/40">Role</dt>
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
