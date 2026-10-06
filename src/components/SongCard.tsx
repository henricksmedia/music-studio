"use client";

import { useMemo, useState } from "react";
import type { Song } from "@/lib/music/compose";
import type { Plan, PlanEdits } from "@/lib/music/parse";
import { breakdownCard, identityCard, type CardItem } from "@/lib/music/describe";
import { AVOIDS, AVOID_IDS } from "@/lib/music/spec";
import { CardRows, chipCls } from "./ui";

export type SheetKind = "identity" | "breakdown";

type Props = {
  song: Song;
  plan: Plan;
  edits: PlanEdits;
  locks: PlanEdits;
  wild: boolean;
  onOpen: (item: CardItem, kind: SheetKind) => void;
  onCopyPrompt: () => void;
  onEdit: (e: PlanEdits) => void;
  onTypedAvoid: (text: string) => boolean;
};

/** One Song card: identity rows, the Producer breakdown as a disclosure inside it, and the avoid toggles underneath. */
export function SongCard({ song, plan, edits, locks, wild, onOpen, onCopyPrompt, onEdit, onTypedAvoid }: Props) {
  const [avoidText, setAvoidText] = useState("");
  const { idRows, bdRows } = useMemo(() => {
    const id = identityCard(song, plan, edits);
    const bd = breakdownCard(song, plan, locks).filter((r) => r.value.trim());
    const fusion = bd.find((r) => r.id === "fusion");
    // Genre and Fusion describe the same thing: show one row that can also be kept (locked).
    const idRows = id.map((r) =>
      r.id === "genre" && fusion ? { ...r, title: fusion.detail ? "Fusion" : r.title, detail: fusion.detail ?? r.detail, lock: fusion.lock, locked: r.locked || fusion.locked } : r
    );
    return { idRows, bdRows: bd.filter((r) => r.id !== "fusion") };
  }, [song, plan, edits, locks]);
  const avoid = song.spec.production.avoid;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03]" data-testid="identity-card">
      <div className="flex items-center justify-between gap-2 px-3 pt-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-white/80">Song identity</h2>
          <p className="text-[11px] text-white/60">What stays true for the whole track. Tap a line to change it.</p>
        </div>
        <button type="button" onClick={onCopyPrompt} className="min-h-11 shrink-0 rounded-lg border border-white/15 bg-white/5 px-3 text-xs font-medium text-white hover:bg-white/10 md:min-h-9">
          Copy as prompt
        </button>
      </div>
      <div className="px-3">
        <CardRows items={idRows} onOpen={(item) => onOpen(item, "identity")} testId="identity-rows" />
      </div>

      <details
        key={wild ? "wild" : "plain"}
        open={wild}
        data-testid="breakdown-card"
        className={`group mx-2 mb-2 rounded-xl border ${wild ? "border-orange-300/25 bg-gradient-to-b from-orange-500/10 to-fuchsia-500/5" : "border-white/10 bg-white/[0.02]"}`}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2">
          <span className="flex flex-col">
            <span className={`text-xs font-semibold uppercase tracking-wide ${wild ? "text-orange-100/90" : "text-white/80"}`}>Producer breakdown</span>
            <span className="text-[11px] text-white/60">{bdRows.length} production choices · change one and the rest rerolls, or lock it</span>
          </span>
          <span className="text-white/60 transition group-open:rotate-180">▾</span>
        </summary>
        <div className="px-3 pb-2">
          <CardRows items={bdRows} onOpen={(item) => onOpen(item, "breakdown")} testId="breakdown-rows" />
        </div>
      </details>

      <div className="space-y-1.5 border-t border-white/5 px-3 py-3" data-testid="avoid-chips">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-white/60">
          Avoid <span className="font-normal normal-case">· really left out</span>
        </p>
        <div className="-mx-3 flex gap-1.5 overflow-x-auto px-3 pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
          {AVOID_IDS.map((a) => {
            const on = avoid.includes(a);
            return (
              <button key={a} type="button" title={AVOIDS[a].plain} aria-pressed={on} className={`${chipCls(on)} shrink-0 whitespace-nowrap`} onClick={() => onEdit({ style: { avoid: on ? avoid.filter((x) => x !== a) : [...avoid, a] } })}>
                {on ? "✕ " : ""}
                {AVOIDS[a].label}
              </button>
            );
          })}
        </div>
        <form
          className="flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (onTypedAvoid(avoidText)) setAvoidText("");
          }}
        >
          <input value={avoidText} onChange={(e) => setAvoidText(e.target.value)} placeholder="type e.g. no supersaws" aria-label="Type something to avoid" className="min-h-11 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-3 text-xs text-white outline-none placeholder:text-white/40 focus:ring-2 focus:ring-indigo-400/40 md:min-h-9" />
          <button type="submit" className="min-h-11 rounded-full border border-white/15 px-4 text-xs text-white md:min-h-9">
            Add
          </button>
        </form>
      </div>
    </section>
  );
}
