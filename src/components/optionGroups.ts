import type { CardItem, ChipOption } from "@/lib/music/describe";
import { EDM, EDM_IDS, METERS, METER_IDS } from "@/lib/music/spec";
import { GENRES } from "@/lib/music/genres";

export type SheetOption = ChipOption & { display: string; group: string };
export type OptionGroup = { name: string; options: SheetOption[] };

const EDM_BY_LABEL = new Map(EDM_IDS.map((id) => [EDM[id].label, id]));
const METER_LABELS = new Set(METER_IDS.map((m) => METERS[m].label));

/** Which heading an option sits under in the sheet. Purely presentational: the card data is unchanged. */
function classify(item: CardItem, o: ChipOption): { group: string; display: string } {
  const edm = EDM_BY_LABEL.get(o.label);
  if (edm) return { group: GENRES[EDM[edm].genre].label, display: o.label };
  if (item.id === "genre" || item.id === "fusion") return { group: "Base", display: o.label };
  if (item.id === "tempoKey") {
    if (/BPM$/.test(o.label)) return { group: "Tempo", display: o.label };
    if (/^Key /.test(o.label)) return { group: "Key", display: o.label.slice(4) };
    return { group: "Mode", display: o.label };
  }
  if (item.id === "meter") return { group: METER_LABELS.has(o.label) ? "Meter" : "Rhythm tricks", display: o.label };
  const m = /^([^:]{2,24}): (.+)$/.exec(o.label);
  if (m) return { group: m[1], display: m[2] };
  return { group: "", display: o.label };
}

export function groupOptions(item: CardItem): OptionGroup[] {
  const groups: OptionGroup[] = [];
  const byName = new Map<string, OptionGroup>();
  for (const o of item.options) {
    const c = classify(item, o);
    let g = byName.get(c.group);
    if (!g) {
      g = { name: c.group, options: [] };
      byName.set(c.group, g);
      groups.push(g);
    }
    g.options.push({ ...o, ...c });
  }
  return groups;
}

export function filterGroups(groups: OptionGroup[], query: string): OptionGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({ ...g, options: g.options.filter((o) => `${g.name} ${o.label} ${o.plain ?? ""}`.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length);
}

const RECENT_KEY = (id: string) => `music-studio:recent:${id}`;
export function recentPicks(itemId: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY(itemId)) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function rememberPick(itemId: string, label: string) {
  try {
    localStorage.setItem(RECENT_KEY(itemId), JSON.stringify([label, ...recentPicks(itemId).filter((l) => l !== label)].slice(0, 6)));
  } catch {
    /* storage full or blocked */
  }
}
