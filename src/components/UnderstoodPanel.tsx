"use client";

import { GENRES, GENRE_IDS, LEAD_LABELS, HARMONY_LABELS, BASS_LABELS, KIT_LABELS, type GenreId, type LeadInst, type HarmonyInst, type BassTimbre, type DrumKit } from "@/lib/music/genres";
import { MOODS, MOOD_IDS, type MoodId, type Plan, type PlanEdits } from "@/lib/music/parse";
import { MODES, MODE_IDS, NOTE_NAMES, type ModeId } from "@/lib/music/theory";
import type { Song } from "@/lib/music/compose";

type Props = {
  plan: Plan;
  song: Song;
  onEdit: (e: PlanEdits) => void;
};

const chip = "inline-flex min-h-11 items-center gap-1 rounded-full border px-3 py-0 text-xs md:min-h-9 font-medium transition active:scale-95";
const sel =
  "min-h-11 md:min-h-9 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-indigo-400/40";

export function UnderstoodPanel({ plan, song, onEdit }: Props) {
  const a = song.arrangement;
  const genreIds = plan.genres.map((g) => g.id);

  const setGenres = (gs: { id: GenreId; weight: number }[]) => onEdit({ genres: gs });
  const makeLead = (id: GenreId) => {
    const rest = plan.genres.filter((g) => g.id !== id);
    setGenres([{ id, weight: 0.6 }, ...rest.map((g) => ({ id: g.id, weight: 0.4 / Math.max(1, rest.length) }))]);
  };
  const removeGenre = (id: GenreId) => {
    if (plan.genres.length <= 1) return;
    setGenres(plan.genres.filter((g) => g.id !== id));
  };
  const addGenre = (id: GenreId) => {
    const scaled = plan.genres.map((g) => ({ id: g.id, weight: g.weight * 0.7 }));
    setGenres([...scaled, { id, weight: 0.3 }].slice(0, 3));
  };
  const toggleMood = (m: MoodId) => {
    const has = plan.moods.includes(m);
    onEdit({ moods: has ? plan.moods.filter((x) => x !== m) : [...plan.moods, m].slice(-3) });
  };
  const setInst = (k: "lead" | "harmony" | "bass" | "kit", v: string) => onEdit({ instruments: { ...plan.instruments, [k]: v || undefined } });

  return (
    <section className="@container space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-white/70">What I heard</h2>
        <span className="text-[11px] text-white/60">tap to reshape — no typing needed</span>
      </div>

      {plan.fallback ? (
        <p className="text-[11px] text-amber-200/80">No style words recognized, so I improvised a style from your words. Tap below to steer it.</p>
      ) : plan.heard.length ? (
        <p className="text-[11px] text-white/60">
          Picked up: {plan.heard.slice(0, 10).map((w) => `“${w}”`).join(" · ")}
        </p>
      ) : null}

      {/* Genres */}
      <div className="flex flex-wrap items-center gap-1.5">
        {plan.genres.map((g, i) => (
          <span key={g.id} className={`${chip} ${i === 0 ? "border-indigo-300/60 bg-indigo-500/25 text-white" : "border-white/15 bg-white/5 text-white/85"}`}>
            <button type="button" onClick={() => makeLead(g.id)} title="Make this the lead style" className="min-h-11 md:min-h-9">
              {GENRES[g.id].label} <span className="tabular-nums text-white/60">{Math.round(g.weight * 100)}%</span>
            </button>
            {plan.genres.length > 1 && (
              <button type="button" aria-label={`Remove ${GENRES[g.id].label}`} onClick={() => removeGenre(g.id)} className="-mr-2 flex min-h-11 min-w-11 items-center justify-center text-white/60 hover:text-white md:min-h-9 md:min-w-7">
                ×
              </button>
            )}
          </span>
        ))}
        {plan.genres.length < 3 && (
          <select className={sel} value="" onChange={(e) => e.target.value && addGenre(e.target.value as GenreId)} aria-label="Blend in a style">
            <option value="">+ blend style</option>
            {GENRE_IDS.filter((id) => !genreIds.includes(id)).map((id) => (
              <option key={id} value={id}>
                {GENRES[id].label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Moods */}
      <div className="flex flex-wrap items-center gap-1.5">
        {plan.moods.map((m) => (
          <button key={m} type="button" onClick={() => toggleMood(m)} className={`${chip} border-pink-300/40 bg-pink-500/15 text-white`}>
            {MOODS[m].label} <span className="text-white/60">×</span>
          </button>
        ))}
        <select className={sel} value="" onChange={(e) => e.target.value && toggleMood(e.target.value as MoodId)} aria-label="Add a mood">
          <option value="">+ mood</option>
          {MOOD_IDS.filter((m) => !plan.moods.includes(m)).map((m) => (
            <option key={m} value={m}>
              {MOODS[m].label}
            </option>
          ))}
        </select>
      </div>

      {/* Tempo + key */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`${chip} border-white/15 bg-white/5 text-white`}>
          <button type="button" aria-label="Slower" onClick={() => onEdit({ bpm: Math.max(50, plan.bpm - 4) })} className="-mx-1.5 flex min-h-11 min-w-11 items-center justify-center text-base leading-none md:min-h-9 md:min-w-8">
            −
          </button>
          <span className="tabular-nums">{plan.bpm} BPM</span>
          <button type="button" aria-label="Faster" onClick={() => onEdit({ bpm: Math.min(190, plan.bpm + 4) })} className="-mx-1.5 flex min-h-11 min-w-11 items-center justify-center text-base leading-none md:min-h-9 md:min-w-8">
            +
          </button>
        </span>
        <select className={sel} value={plan.root} onChange={(e) => onEdit({ root: Number(e.target.value) })} aria-label="Key root">
          {NOTE_NAMES.map((n, i) => (
            <option key={n} value={i}>
              {n}
            </option>
          ))}
        </select>
        <select className={sel} value={plan.mode} onChange={(e) => onEdit({ mode: e.target.value as ModeId })} aria-label="Mode">
          {MODE_IDS.map((m) => (
            <option key={m} value={m}>
              {MODES[m].label}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-white/60">
          {Math.floor(song.durationSec / 60)}:{String(Math.round(song.durationSec % 60)).padStart(2, "0")} · {song.sections.length} sections
        </span>
      </div>

      {/* Sounds */}
      <div className="grid grid-cols-2 gap-1.5 @lg:grid-cols-4">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-white/60">
          Lead
          <select className={sel} value={a.leadInst} onChange={(e) => setInst("lead", e.target.value as LeadInst)}>
            {(Object.keys(LEAD_LABELS) as LeadInst[]).map((k) => (
              <option key={k} value={k}>
                {LEAD_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-white/60">
          Chords
          <select className={sel} value={a.harmonyInst} onChange={(e) => setInst("harmony", e.target.value as HarmonyInst)}>
            {(Object.keys(HARMONY_LABELS) as HarmonyInst[]).map((k) => (
              <option key={k} value={k}>
                {HARMONY_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-white/60">
          Bass
          <select className={sel} value={a.bassTimbre} onChange={(e) => setInst("bass", e.target.value as BassTimbre)}>
            {(Object.keys(BASS_LABELS) as BassTimbre[]).map((k) => (
              <option key={k} value={k}>
                {BASS_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wide text-white/60">
          Drums
          <select className={sel} value={a.kit} onChange={(e) => setInst("kit", e.target.value as DrumKit)}>
            {(Object.keys(KIT_LABELS) as DrumKit[]).map((k) => (
              <option key={k} value={k}>
                {KIT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {plan.genres.length > 1 && (
        <p className="text-[11px] text-white/60">
          Groove from {GENRES[a.drumsFrom].label} · chords from {GENRES[a.harmonyFrom].label} · melody from {GENRES[a.leadFrom].label}
        </p>
      )}
    </section>
  );
}
