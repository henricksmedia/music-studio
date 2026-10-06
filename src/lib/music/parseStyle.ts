/** Prompt → rhythm / harmony / production overrides (the cheat-sheet and framework vocabulary). */
import { AVOIDS, AVOID_IDS, EDM_IDS, type AvoidId, type HookId, type OpeningId, type StyleOverrides, type TrickId, type MeterId } from "./spec";
import type { ModeId } from "./theory";
import type { ProgressionId } from "./spec";

type Rule = { re: RegExp; f: (o: StyleOverrides, m: RegExpMatchArray, ctx: Ctx) => void; label?: (m: RegExpMatchArray) => string };
type Ctx = { mode?: ModeId; hash: number };

const trick = (id: TrickId) => (o: StyleOverrides) => {
  o.tricks = { ...(o.tricks ?? {}), [id]: true };
};
const meter = (id: MeterId) => (o: StyleOverrides) => {
  o.meter = id;
};
const prog = (id: ProgressionId) => (o: StyleOverrides) => {
  o.progression = id;
};
const mode = (id: ModeId) => (_o: StyleOverrides, _m: RegExpMatchArray, c: Ctx) => {
  c.mode = id;
};

const RULES: Rule[] = [
  // ---- meters (raw text keeps "/" and ":") ----
  { re: /\b(\d)\s*\/\s*8\s+over\s+(?:drums\s+in\s+)?4\s*\/\s*4\b/, f: (o, m) => { o.meter = "4/4"; o.polymeterCycle = Number(m[1]); trick("polymeter")(o); } },
  { re: /\b7\s*\/\s*8\b|\bseven[- ]eight\b/, f: meter("7/8") },
  { re: /\b5\s*\/\s*4\b|\bfive[- ]four\b|\bin five\b/, f: meter("5/4") },
  { re: /\b(?:6|12)\s*\/\s*8\b|\bsix[- ]eight\b/, f: meter("6/8") },
  { re: /\b3\s*\/\s*4\b|\bwaltz\b|\bthree[- ]four\b/, f: meter("3/4") },
  { re: /\b4\s*\/\s*4\b/, f: meter("4/4") },
  { re: /\bodd (?:time|meters?|time signatures?)\b|\basymmetric\b/, f: (o, _m, c) => { o.meter = c.hash % 2 ? "7/8" : "5/4"; } },
  { re: /\bmixed (?:meters?|bars|time)\b|\bchanging meters?\b|\bmeter changes?\b/, f: meter("mixed") },
  {
    re: /\b([23])\s*\+\s*([23])(?:\s*\+\s*([23]))?(?:\s*\+\s*([23]))?\b/,
    f: (o, m) => {
      const g = [m[1], m[2], m[3], m[4]].filter(Boolean).map(Number);
      const sum = g.reduce((s, x) => s + x, 0);
      if (sum === 7) { o.meter = o.meter ?? "7/8"; o.grouping = g; }
      else if (sum === 8) { o.meter = "4/4"; o.grouping = g; trick("additive")(o); }
      else if (sum === 5) { o.meter = "5/4"; o.grouping = g.map((x) => x * 2); }
      else if (sum === 6) { o.meter = o.meter ?? "6/8"; }
      else if (sum === 10) { o.meter = "5/4"; o.grouping = g; }
    },
  },
  // ---- feel ----
  { re: /\bshuffl(?:e|ed|ing)\b|\bboogie\b/, f: (o) => { o.feel = "shuffle"; } },
  { re: /\bswing(?:ing|y)?\b|\bswung\b/, f: (o) => { o.feel = o.feel ?? "swing"; } },
  { re: /\bstraight (?:8ths|eighths|feel|time)\b|\bquantized\b|\bmachine[- ]tight\b/, f: (o) => { o.feel = "straight"; } },
  // ---- rhythm tricks ----
  { re: /\bbackbeat\b|\bsnare on (?:2|two) (?:and|&) (?:4|four)\b/, f: trick("backbeat") },
  { re: /\bhalf[- ]?time\b/, f: trick("halftime") },
  { re: /\b(?:son |rumba )?clave\b/, f: trick("clave") },
  { re: /\b2\s*-\s*3\b/, f: (o) => { o.clave = "2-3"; } },
  { re: /\b3\s*-\s*2\b/, f: (o) => { o.clave = "3-2"; } },
  { re: /\bstop[- ]time\b|\bsyncopated breaks?\b|\bband hits\b|\bbreaks\b/, f: trick("breaks") },
  { re: /\bhemiola\b|\b2 (?:vs\.?|against) 3\b|\btwo against three\b/, f: trick("hemiola") },
  { re: /\bcross[- ]?rhythms?\b|\b3 over 4\b|\bthree (?:over|against) four\b/, f: trick("crossRhythm") },
  { re: /\bpoly[- ]?rhythm(?:s|ic)?\b/, f: trick("polyrhythm") },
  { re: /\b([2-9])\s*:\s*([2-9])\b/, f: (o, m) => { o.polyRatio = [Number(m[1]), Number(m[2])]; trick("polyrhythm")(o); } },
  { re: /\bpoly[- ]?met(?:er|re)s?\b|\bpolymetric\b/, f: trick("polymeter") },
  { re: /\blayered (?:poly)?rhythms\b|\binterlocking\b|\bpolyrhythmic layer(?:s|ing)?\b/, f: trick("layering") },
  { re: /\bquintuplets?\b/, f: trick("quintuplets") },
  { re: /\bseptuplets?\b/, f: trick("septuplets") },
  { re: /\b(?:triplets?|tuplets?)\b/, f: trick("triplets") },
  { re: /\bsyncopat(?:ed|ion)\b|\boff[- ]?beat accents\b/, f: (o) => { trick("syncopation")(o); o.syncopation = Math.max(o.syncopation ?? 0, 70); } },
  { re: /\b(?:metric )?displace(?:d|ment)\b/, f: trick("displacement") },
  { re: /\biso[- ]?rhythm(?:s|ic)?\b/, f: trick("isorhythm") },
  { re: /\badditive\b/, f: trick("additive") },
  { re: /\bdeconstruct(?:ed|ion)?\b|\bfalls? apart\b/, f: trick("deconstruction") },
  { re: /\bjitter(?:y)?\b|\bdrunk(?:en)?\b|\bwonky\b|\boff[- ]grid\b|\bloose timing\b/, f: (o) => { trick("jitter")(o); o.humanize = Math.max(o.humanize ?? 0, 85); } },
  { re: /\bbroken[- ]?(?:beat|time)\b|\bbreakbeats?\b|\b2[- ]step\b|\btwo[- ]step\b/, f: trick("brokenTime") },
  { re: /\bglitch(?:y|ed)?\b|\bstutter(?:s|ing|ed)?\b|\bchopp?(?:ed|y)\b|\bratchet(?:s|ing)?\b/, f: (o) => { trick("glitch")(o); o.glitch = Math.max(o.glitch ?? 0, 65); } },
  { re: /\bhumani[sz]ed?\b|\blive feel\b|\bplayed live\b|\bhuman feel\b/, f: (o) => { trick("humanize")(o); o.humanize = Math.max(o.humanize ?? 0, 65); } },
  { re: /\bdotted\b|\bgallop(?:ing)?\b/, f: trick("dotted") },
  { re: /\bcall (?:and|&|n) response\b|\bcall[- ]response\b|\bquestion and answer\b/, f: trick("callResponse") },
  { re: /\bostinato\b|\brepeating figure\b|\bhypnotic loop\b/, f: trick("ostinato") },
  // ---- modes ----
  { re: /\bionian\b/, f: mode("ionian") },
  { re: /\baeolian\b|\bnatural minor\b/, f: mode("aeolian") },
  { re: /\bdorian\b(?! vamp)/, f: mode("dorian") },
  { re: /\bphrygian\b(?! tension)/, f: mode("phrygian") },
  { re: /\bmixolydian\b(?! rock)/, f: mode("mixolydian") },
  { re: /\blydian\b/, f: mode("lydian") },
  { re: /\blocrian\b(?! unrest)/, f: mode("locrian") },
  { re: /\bharmonic minor\b/, f: mode("harmonicMinor") },
  // ---- chord colors ----
  { re: /\bsus(?:2|4|pended)?\b|\bsuspended\b/, f: (o) => { o.chordColor = "sus"; } },
  { re: /\bsevenths?\b|\b7th chords\b|\bjazzy chords\b/, f: (o) => { o.chordColor = "sevenths"; } },
  { re: /\b9ths?\b|\bninths?\b|\blush chords\b|\brich chords\b/, f: (o) => { o.chordColor = "rich"; } },
  { re: /\bpower chords?\b/, f: (o) => { o.chordColor = "power"; } },
  { re: /\bdiminished\b/, f: (o) => { o.chordColor = "diminished"; } },
  { re: /\baugmented\b/, f: (o) => { o.chordColor = "augmented"; } },
  { re: /\btriads\b|\bsimple chords\b/, f: (o) => { o.chordColor = "plain"; } },
  // ---- named progressions ----
  { re: /\bpop uplift\b|\bi\s*[–-]\s*v\s*[–-]\s*vi\s*[–-]\s*iv\b/, f: prog("popUplift") },
  { re: /\bepic progression\b|\bvi\s*[–-]\s*iv\s*[–-]\s*i\s*[–-]\s*v\b/, f: prog("epic") },
  { re: /\bdark trap progression\b|\bi\s*[–-]\s*vi\s*[–-]\s*vii\b/, f: prog("darkTrap") },
  { re: /\bdreamy progression\b|\bi\s*[–-]\s*ii\s*[–-]\s*iv\b/, f: prog("dreamy") },
  { re: /\bandalusian\b/, f: prog("andalusian") },
  { re: /\broyal road\b/, f: prog("royalRoad") },
  { re: /\bdoo[- ]?wop\b/, f: prog("doowop") },
  { re: /\bmixolydian rock\b/, f: prog("mixoRock") },
  { re: /\bdorian vamp\b/, f: prog("dorianVamp") },
  { re: /\bphrygian tension\b/, f: prog("phrygianTension") },
  { re: /\bminor plagal\b/, f: prog("minorPlagal") },
  { re: /\blocrian unrest\b/, f: prog("locrianUnrest") },
  // ---- harmony tricks ----
  { re: /\bpedal(?! steel)(?: tone| point| note)?\b/, f: (o) => { o.harmonyTricks = { ...(o.harmonyTricks ?? {}), pedal: true }; } },
  { re: /\bdron(?:e|es|ing|ey)\b/, f: (o) => { o.harmonyTricks = { ...(o.harmonyTricks ?? {}), drone: true }; } },
  { re: /\bborrowed chords?\b|\bmodal interchange\b|\bmode mixture\b/, f: (o) => { o.harmonyTricks = { ...(o.harmonyTricks ?? {}), borrowed: true }; } },
  { re: /\bchromatic(?:ism)?\b/, f: (o) => { o.harmonyTricks = { ...(o.harmonyTricks ?? {}), chromatic: true }; } },
  // ---- production: opening / hook / mix / vocal / ending / development / fx / form ----
  {
    re: /\b(?:opens?|opening|starts?|begins?|intro)\s+(?:with|on)\s+(?:an?\s+|the\s+|some\s+)?([a-z][a-z -]{2,30})/,
    f: (o, m) => {
      const w = m[1];
      let id: OpeningId | null = null;
      if (/drone|hum|room tone/.test(w)) id = "distantDrone";
      else if (/bass/.test(w)) id = "soloBass";
      else if (/pad|chord|keys|organ|filtered/.test(w)) id = "filteredPads";
      else if (/drum|beat|kick|percussion|hats?/.test(w)) id = "drumsAlone";
      else if (/rain|vinyl|crackle|texture|field|tape|noise|hiss|wind/.test(w)) id = "textureBed";
      else if (/hook|riff|melody|motif|lead|guitar|harmonica|piano|banjo|bell/.test(w)) id = "hookFragment";
      if (id) o.opening = id;
    },
  },
  { re: /\bfiltered pads?\b/, f: (o) => { o.opening = o.opening ?? "filteredPads"; } },
  { re: /\bsolo bass\b/, f: (o) => { o.opening = o.opening ?? "soloBass"; } },
  { re: /\bdistant drone\b/, f: (o) => { o.opening = o.opening ?? "distantDrone"; } },
  {
    re: /\bhook\s*(?:is|on|:|=)?\s*(?:an?\s+|the\s+)?(riff|bass ?line|bass|chord stabs?|stabs?|chords?|rhythm|percussion|texture|vocal chops?|bells?)\b|\b(bass ?line|riff|stab|chord|rhythm|texture) hook\b/,
    f: (o, m) => {
      const w = m[1] ?? m[2];
      const id: HookId = /bass/.test(w) ? "bassline" : /stab/.test(w) ? "stab" : /chord/.test(w) ? "chords" : /rhythm|percussion/.test(w) ? "rhythm" : /texture|vocal|bell/.test(w) ? "texture" : "riff";
      o.hook = id;
    },
  },
  { re: /\bcatchy riff\b|\bguitar riff\b/, f: (o) => { o.hook = o.hook ?? "riff"; } },
  { re: /\bmono (?:sub|bass|low end)\b/, f: () => {} , label: () => "mono sub" },
  { re: /\bwide (?:pads|stereo|chords)\b|\bwide\b(?! (?:chorus|hook))/, f: (o) => { o.pads = "wide"; } },
  { re: /\bnarrow verses?\b|\bwide (?:chorus|hook)\b/, f: (o) => { o.contrast = true; } },
  { re: /\bnarrow\b(?! verses?)|\bmono\b(?! sub| bass| low)/, f: (o) => { o.pads = "narrow"; } },
  { re: /\bdry drums\b|\bdry\b/, f: (o) => { o.drumsRoom = "dry"; } },
  { re: /\broomy\b|\bbig room drums\b|\bambient drums\b/, f: (o) => { o.drumsRoom = "roomy"; } },
  { re: /\bdrop ?outs?\b/, f: (o) => { o.development = { ...(o.development ?? {}), dropouts: true }; } },
  { re: /\binstrumental\b/, f: (o) => { o.vocal = "instrumental"; } },
  { re: /\bvocal chops?\b|\bsynthetic voice\b|\brobot(?:ic)? voices?\b|\bvocoder\b|\bsynth vox\b/, f: (o) => { o.vocal = "synthVoice"; } },
  { re: /\bfade[sd]? ?out\b|\bfading out\b|\bfade ending\b/, f: (o) => { o.ending = "fade"; } },
  { re: /\britard(?:ando)?\b|\brallentando\b|\bslows? down at the end\b|\bslow ending\b/, f: (o) => { o.ending = "ritard"; } },
  { re: /\bhard stop\b|\babrupt(?:ly)? end|\bcut off\b|\bsudden end|\bstops? dead\b|\bhard cut\b/, f: (o) => { o.ending = "cut"; } },
  { re: /\bbig ending\b|\bfinal hit\b|\bends? on a (?:big )?hit\b|\bstab ending\b/, f: (o) => { o.ending = "finalHit"; } },
  { re: /\bfilter (?:sweeps?|automation|opens?|opening)\b/, f: (o) => { o.development = { ...(o.development ?? {}), filter: true }; } },
  { re: /\b(?:stereo )?widening\b/, f: (o) => { o.development = { ...(o.development ?? {}), widening: true }; } },
  { re: /\bsaturat(?:ed|ion)\b/, f: (o) => { o.development = { ...(o.development ?? {}), saturation: true }; } },
  { re: /\brhythmic edits\b/, f: (o) => { o.development = { ...(o.development ?? {}), edits: true }; } },
  { re: /\brising percussion\b|\bpercussion (?:builds|density)\b/, f: (o) => { o.development = { ...(o.development ?? {}), percRise: true }; } },
  { re: /\bspring reverb\b/, f: (o) => { o.reverb = "spring"; } },
  { re: /\bplate reverb\b/, f: (o) => { o.reverb = "plate"; } },
  { re: /\bhall reverb\b|\bcathedral\b/, f: (o) => { o.reverb = "hall"; } },
  { re: /\bshimmer(?:ing)? reverb\b|\bshimmer\b/, f: (o) => { o.reverb = "shimmer"; } },
  { re: /\broom reverb\b|\bsmall room\b/, f: (o) => { o.reverb = "room"; } },
  { re: /\btape (?:delay|echo)\b|\bspace echo\b/, f: (o) => { o.delay = "dotted8"; o.tape = true; } },
  { re: /\bslap ?back\b/, f: (o) => { o.delay = "slap"; } },
  { re: /\bdotted (?:8th|eighth) (?:delay|echo)\b/, f: (o) => { o.delay = "dotted8"; } },
  { re: /\btriplet (?:delay|echo)\b/, f: (o) => { o.delay = "triplet8"; } },
  { re: /\bside ?chain(?:ed)?\b|\bpumping\b|\bducking\b/, f: (o) => { o.pump = true; } },
  { re: /\bbit ?crush(?:ed|er)?\b|\bcrushed\b/, f: (o) => { o.crush = true; } },
  { re: /\btape (?:saturation|warmth|hiss)\b|\bcassette\b/, f: (o) => { o.tape = true; } },
  { re: /\bslow burn\b/, f: (o) => { o.form = "slowBurn"; } },
  { re: /\bhook first\b|\bcold open\b/, f: (o) => { o.form = "hookFirst"; } },
  { re: /\bgo wild\b|\brandomi[sz]e everything\b|\brandom edm fusion\b/, f: (o, _m, c) => { o.wild = true; o.edm = o.edm ?? EDM_IDS[c.hash % EDM_IDS.length]; } },
];

const AVOID_LEAD = String.raw`\b(?:no|without|avoid(?:ing)?|minus|skip|ditch|lose|zero|not? any|never|nothing like)\s+(?:any\s+|the\s+|more\s+|those\s+)?`;

export type StyleParse = { style: StyleOverrides; heard: string[]; mode?: ModeId; stripped: string };

/** Parse production/rhythm/harmony vocabulary. `raw` keeps punctuation (7/8, 3:4, 2+2+3). */
export function parseStyle(raw: string, hash: number): StyleParse {
  const text = raw.toLowerCase().replace(/[‘’']/g, "");
  const o: StyleOverrides = {};
  const heard: string[] = [];
  const ctx: Ctx = { hash };
  let stripped = text;

  // Avoid rules first (and remove them so "no supersaws" doesn't request supersaws)
  const avoid = new Set<AvoidId>();
  for (const id of AVOID_IDS) {
    const re = new RegExp(AVOID_LEAD + `(?:${AVOIDS[id].words})\\b`, "g");
    for (const m of text.matchAll(re)) {
      avoid.add(id);
      heard.push(m[0].trim());
      stripped = stripped.replace(m[0], " ");
    }
  }
  const list = text.match(/\bavoid\s*:\s*([a-z0-9 ,&/-]+)/);
  if (list) {
    for (const part of list[1].split(/,|\band\b|&|\//)) {
      const w = part.trim();
      if (!w) continue;
      const id = AVOID_IDS.find((a) => new RegExp(`^(?:${AVOIDS[a].words})$`).test(w));
      if (id) avoid.add(id);
    }
    stripped = stripped.replace(list[0], " ");
  }
  if (avoid.size) o.avoid = [...avoid];
  if (avoid.has("vocals") || avoid.has("choirPads")) o.vocal = "instrumental";

  for (const r of RULES) {
    const m = stripped.match(r.re);
    if (!m) continue;
    r.f(o, m, ctx);
    heard.push(r.label ? r.label(m) : m[0].trim());
  }
  return { style: o, heard, mode: ctx.mode, stripped };
}
