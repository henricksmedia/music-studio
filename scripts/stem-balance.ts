import { OfflineAudioContext } from "node-web-audio-api";
import { parsePrompt, resolvePlan, suggestDimensions } from "../src/lib/music/parse";
import { compose, STEM_IDS } from "../src/lib/music/compose";
import { renderSong, type OfflineCtor } from "../src/lib/music/render";
import { DEFAULT_DIMENSIONS } from "../src/lib/types";
const prompts = process.argv.slice(2);
(async () => {
  for (const p of prompts) {
    const pr = parsePrompt(p); const plan = resolvePlan(pr); const dims = suggestDimensions(plan, pr, DEFAULT_DIMENSIONS);
    const song = compose(plan, dims, 0);
    const ch = song.sections.find((s) => ["chorus", "drop", "solo"].includes(s.type)) ?? song.sections[1];
    const secs = Math.min(10, ch.bars * 4 * 60 / song.bpm);
    const line: string[] = [];
    for (const st of [...STEM_IDS, "mix"] as const) {
      const buf = await renderSong(song, dims, { stems: st === "mix" ? undefined : [st], sampleRate: 22050, seconds: secs, startBeat: ch.startBar * 4, Ctor: OfflineAudioContext as unknown as OfflineCtor });
      const d = buf.getChannelData(0); let s = 0, pk = 0; for (const x of d) { s += x * x; pk = Math.max(pk, Math.abs(x)); }
      line.push(`${st} ${(10 * Math.log10(s / d.length + 1e-12)).toFixed(0)}/${pk.toFixed(2)}`);
    }
    const a = song.arrangement;
    console.log(p.slice(0, 28).padEnd(28), `[${a.kit},${a.bassTimbre},${a.harmonyInst},${a.leadInst}]`.padEnd(42), line.join(" | "));
  }
})();
