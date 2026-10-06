"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { CardItem, ChipOption } from "@/lib/music/describe";

export const chipCls = (active: boolean) =>
  `inline-flex min-h-9 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
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
      {plain && <span className="text-[11px] leading-snug text-white/50">{plain}</span>}
    </button>
  );
}

export function Collapsible({ title, subtitle, children, defaultOpen = false, testId }: { title: string; subtitle?: string; children: ReactNode; defaultOpen?: boolean; testId?: string }) {
  return (
    <details open={defaultOpen} data-testid={testId} className="group rounded-2xl border border-white/10 bg-white/[0.03]">
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="flex flex-col">
          <span className="text-xs font-semibold uppercase tracking-wide text-white/70">{title}</span>
          {subtitle && <span className="text-[11px] text-white/45">{subtitle}</span>}
        </span>
        <span className="text-white/40 transition group-open:rotate-180">▾</span>
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  );
}

/** Bottom sheet (phone-first) for a card item's options. */
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
  useEffect(() => {
    if (!item) return;
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [item, onClose]);
  if (!item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={item.title}>
      <div className="max-h-[78dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-white/10 bg-[#11111a] p-4 pb-8 shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20 sm:hidden" />
        <div className="mb-1 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-indigo-200/70">{item.title}</p>
            <p className="text-sm font-medium text-white">{item.value}</p>
            {item.detail && <p className="mt-0.5 text-[11px] text-white/45">{item.detail}</p>}
          </div>
          <button type="button" onClick={onClose} className="min-h-9 rounded-full px-3 text-white/60" aria-label="Close">
            ✕
          </button>
        </div>
        {(onKeep || onUnlock) && (item.lock || item.locked) && (
          <div className="my-3 flex flex-wrap gap-2">
            {onKeep && item.lock && (
              <button type="button" onClick={() => onKeep(item)} className="min-h-10 rounded-xl bg-indigo-500 px-3 py-2 text-xs font-semibold text-white">
                🔒 Keep this, reroll the rest
              </button>
            )}
            {onUnlock && item.locked && (
              <button type="button" onClick={() => onUnlock(item)} className="min-h-10 rounded-xl border border-white/15 px-3 py-2 text-xs text-white/80">
                Unlock
              </button>
            )}
          </div>
        )}
        {item.options.length > 0 ? (
          <>
            {pickHint && <p className="mb-2 text-[11px] text-white/45">{pickHint}</p>}
            <div className="flex flex-wrap gap-1.5">
              {item.options.map((o) => (
                <button key={o.label} type="button" title={o.plain} onClick={() => onPick(o)} className={chipCls(o.active)}>
                  {o.label}
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-2 text-[11px] text-white/45">{item.flavor ? "Flavor only: these names describe the inspiration; this app approximates them with its own synths." : "Change the sounds in “What I heard” below."}</p>
        )}
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
          <button type="button" onClick={() => onOpen(it)} className="flex w-full items-start gap-3 py-2 text-left active:bg-white/5">
            <span className="w-28 shrink-0 text-[11px] font-medium uppercase leading-5 tracking-wide text-white/45">
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
        <p className="mb-3 text-[11px] text-white/45">Two parts, in the producer framework: paste the Style Prompt into the style field and the Timeline into the lyrics field.</p>
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
