"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { CardItem, ChipOption } from "@/lib/music/describe";
import { filterGroups, groupOptions, recentPicks, rememberPick, type SheetOption } from "./optionGroups";

export const chipCls = (active: boolean) =>
  `inline-flex min-h-11 md:min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
    active ? "border-indigo-300/70 bg-indigo-500/30 text-white" : "border-white/15 bg-white/5 text-white/80"
  }`;

/** A chip with a one-line plain-language explanation underneath (for Groove / Harmony panels). */
export function ExplainChip({ label, plain, active, onClick }: { label: string; plain?: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 flex-col items-start rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] ${
        active ? "border-indigo-300/70 bg-indigo-500/25" : "border-white/10 bg-white/[0.04]"
      }`}
    >
      <span className="text-xs font-semibold text-white">{label}</span>
      {plain && <span className="text-[11px] leading-snug text-white/60">{plain}</span>}
    </button>
  );
}

export function Collapsible({ title, subtitle, children, defaultOpen = false, testId }: { title: string; subtitle?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  return (
    <details open={defaultOpen} data-testid={testId} className="group rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">{title}</span>
          {subtitle && <span className="text-[11px] text-white/60">{subtitle}</span>}
        </span>
        <span className="text-white/60 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}

/** Options sheet for a card item: bottom sheet on phones, side panel on desktop. Grouped, with search for long lists. */
export function OptionSheet({
  item,
  onClose,
  onPick,
  onKeep,
  onUnlock,
  pickHint,
}: {
  item: CardItem | null;
  onClose: () => void;
  onPick: (o: ChipOption) => void;
  onKeep?: (item: CardItem) => void;
  onUnlock?: (item: CardItem) => void;
  pickHint?: string;
}) {
  const [query, setQuery] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);
  const groups = useMemo(() => (item ? groupOptions(item) : []), [item]);
  useEffect(() => {
    if (!item) return;
    setQuery("");
    setRecent(recentPicks(item.id));
    if (matchMedia("(pointer: fine)").matches) searchRef.current?.focus();
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [item, onClose]);
  if (!item) return null;
  const searchable = item.options.length > SEARCH_AT;
  const shown = filterGroups(groups, query);
  const all = groups.flatMap((g) => g.options);
  const recentOpts = searchable && !query ? recent.map((l) => all.find((o) => o.label === l)).filter((o): o is SheetOption => !!o) : [];
  const pick = (o: SheetOption) => {
    rememberPick(item.id, o.label);
    onPick(o);
  };
  const chip = (o: SheetOption, key: string) => (
    <button key={key} type="button" title={o.plain} onClick={() => pick(o)} className={chipCls(o.active)} aria-pressed={o.active}>
      {o.display}
    </button>
  );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center xl:items-stretch xl:justify-end xl:bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#11111a] shadow-2xl md:rounded-3xl xl:max-h-none xl:w-[30rem] xl:max-w-none xl:rounded-none xl:rounded-l-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 border-b border-white/5 px-4 pb-3 pt-3">
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200/80">{item.title}</p>
              <p className="text-sm font-medium text-white">{item.value}</p>
              {item.detail && <p className="mt-0.5 text-[11px] text-white/60">{item.detail}</p>}
            </div>
            <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full text-white/70 hover:bg-white/5" aria-label="Close">
              ✕
            </button>
          </div>
          {(onKeep || onUnlock) && (item.lock || item.locked) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {onKeep && item.lock && (
                <button type="button" onClick={() => onKeep(item)} className="min-h-11 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white">
                  🔒 Keep this, reroll the rest
                </button>
              )}
              {onUnlock && item.locked && (
                <button type="button" onClick={() => onUnlock(item)} className="min-h-11 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/80">
                  Unlock
                </button>
              )}
            </div>
          )}
          {searchable && (
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${item.options.length} options`}
              aria-label={`Search ${item.title} options`}
              className="mt-3 min-h-11 w-full rounded-xl border border-white/15 bg-white/5 px-3 text-sm text-white outline-none ring-indigo-400/40 placeholder:text-white/40 focus:ring-2"
            />
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-3" data-testid="option-groups">
          {item.options.length > 0 ? (
            <>
              {pickHint && <p className="mb-3 text-[11px] text-white/60">{pickHint}</p>}
              {recentOpts.length > 0 && (
                <div className="mb-4">
                  <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">Recent</h3>
                  <div className="flex flex-wrap gap-1.5">{recentOpts.map((o) => chip(o, `r-${o.label}`))}</div>
                </div>
              )}
              {shown.map((g) => (
                <div key={g.name || "_"} className="mb-4 last:mb-0">
                  {g.name && groups.length > 1 && <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">{g.name}</h3>}
                  <div className="flex flex-wrap gap-1.5">{g.options.map((o) => chip(o, o.label))}</div>
                </div>
              ))}
              {!shown.length && <p className="text-sm text-white/60">Nothing matches “{query}”.</p>}
            </>
          ) : (
            <p className="text-[11px] text-white/60">{item.flavor ? "Flavor only: these names describe the inspiration; this app approximates them with its own synths." : "Change the sounds in “What I heard”."}</p>
          )}
        </div>
      </div>
    </div>
  );
}

const SEARCH_AT = 12;

export const SHORTCUTS: [string, string][] = [
  ["Space", "Play / pause"],
  ["G", "Generate"],
  ["R", "Surprise (new take)"],
  ["W", "Go wild"],
  ["S", "Save"],
  ["L", "Library"],
  ["1–5", "Solo a track"],
  ["← →", "Move between sections (when the strip is focused)"],
  ["Esc", "Close a sheet"],
  ["?", "This list"],
];

export function ShortcutsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="w-full max-w-sm rounded-t-3xl border border-white/10 bg-[#11111a] p-4 pb-6 md:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Keyboard shortcuts</p>
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-full text-white/70" aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt>
                <kbd className="rounded-md border border-white/20 bg-white/5 px-1.5 py-0.5 font-mono text-xs text-white">{k}</kbd>
              </dt>
              <dd className="text-white/80">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] text-white/60">Shortcuts are off while you type in a text field.</p>
      </div>
    </div>
  );
}

/** A tappable card: each row is one item (title + value); tapping opens its options. */
export function CardRows({ items, onOpen, testId }: { items: CardItem[]; onOpen: (i: CardItem) => void; testId?: string }) {
  return (
    <ul className="divide-y divide-white/5" data-testid={testId}>
      {items.map((it) => (
        <li key={it.id}>
          <button type="button" onClick={() => onOpen(it)} className="flex min-h-11 w-full items-start gap-3 rounded-lg py-2 text-left hover:bg-white/[0.03] active:bg-white/5">
            <span className="w-28 shrink-0 text-[11px] font-medium uppercase leading-5 tracking-wide text-white/60">
              {it.title}
              {it.locked && <span className="ml-1 normal-case text-indigo-300">🔒</span>}
            </span>
            <span className={`min-w-0 flex-1 text-[13px] leading-5 ${it.flavor ? "italic text-white/70" : "text-white/90"}`}>{it.value}</span>
            {(it.options.length > 0 || it.lock) && <span className="pt-0.5 text-white/30">›</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** Preview + copy for the two-part prompt. */
export function PromptModal({ open, style, timeline, onClose }: { open: boolean; style: string; timeline: string; onClose: () => void }) {
  const [copied, setCopied] = useState<string>("");
  if (!open) return null;
  const all = `STYLE PROMPT\n${style}\n\nLYRICS / TIMELINE PROMPT\n${timeline}`;
  const doCopy = async (what: string, text: string) => setCopied((await copyText(text)) ? what : "select");
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Copy as prompt">
      <div className="max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#11111a] p-4 pb-8 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">Copy as prompt</p>
          <button type="button" onClick={onClose} className="min-h-9 px-3 text-white/60" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-3 text-[11px] text-white/60">Two parts, in the producer framework: paste the Style Prompt into the style field and the Timeline into the lyrics field.</p>
        {[
          ["Style Prompt", style],
          ["Lyrics / Timeline Prompt", timeline],
        ].map(([label, text]) => (
          <div key={label} className="mb-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-200/80">{label}</span>
              <button type="button" onClick={() => doCopy(label, text)} className="min-h-9 rounded-lg border border-white/15 px-3 text-xs text-white">
                {copied === label ? "Copied ✓" : "Copy"}
              </button>
            </div>
            <textarea readOnly value={text} rows={label === "Style Prompt" ? 9 : 12} onFocus={(e) => e.currentTarget.select()} className="w-full resize-none rounded-xl border border-white/10 bg-black/40 p-2 font-mono text-[11px] leading-relaxed text-white/85" />
          </div>
        ))}
        <button type="button" onClick={() => doCopy("all", all)} className="min-h-11 w-full rounded-xl bg-indigo-500 text-sm font-semibold text-white">
          {copied === "all" ? "Both parts copied ✓" : "Copy both parts"}
        </button>
        {copied === "select" && <p className="mt-2 text-[11px] text-amber-200/80">Clipboard blocked: tap a box above and use Select All → Copy.</p>}
      </div>
    </div>
  );
}
