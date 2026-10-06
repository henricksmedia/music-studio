# Section continuity, section locks and per-section takes

Status: design proposal, nothing implemented yet. Written 2026-10-06 against the working tree while the style-registry refactor of `spec/genres/resolve/compose/parse` is in progress; all code references are to that snapshot.

User request: *"If there's a section I like, I want to lock that in and redo the rest of it, or section by section. I liked an intro just now, but the next section sounded nothing like the intro."*

## 0. Summary

**Why the next section sounds unrelated.** The intro is built from different musical material than what follows, the jump into the first verse is a hard switch, and nothing in the intro is developed later:

1. The intro shares **no melodic material** with the section after it (0 of 80 songs measured). Verse and hook are two independent random motifs (verse cells recurring in the hook: 1%). The "hook fragment" intro teases the hook, but the next section plays the verse motif, and the fragment itself is only 0–3 notes.
2. The first section adds **3 or more new parts in bar 1**. 67% of its instruments were not in the intro, and the intro's chord rhythm (a held chord) is replaced by a different figure (rhythm carry-over 0.17 for hook-fragment intros).
3. **Production jumps on the downbeat.** The low-pass steps from about 2.4 kHz to 9.8 kHz (filtered-pads intros), and the texture bed drops to about half its level.
4. 45% of intros are only **2 bars long**, because the form-fitting step shortens the intro early.

**Why "redo the rest" can't work today.** "Generate" or "Surprise" on the same prompt changes the intro too (0 of 60 intros survived), along with the lead instrument (about 60% of cases) and the hook (about 50%). Underneath that, the composer draws drums, bass, chords and humanize timing from shared random streams that run through the whole song. A change confined to the intro rewrites 91% of the later sections. A related problem: re-selecting the intro opening a song already has rewrites its ending, mix, effects or development in 16 of 16 songs.

**Proposal.**
- **Continuity rules** for new songs (engine ≥ 2): a shared motif seed ("germ"), layers that carry over between sections, staggered entries, ramped filters, and minimum intro lengths.
- A **section take model:**
  - Each section gets a stable key and can hold a lock, a take seed and per-track take seeds.
  - A take recomposes the whole song with fresh random streams for that one section only. Its events are then spliced into the base song.
  - Song-level material (key, tempo, form, chords, instruments, motifs, figures) always comes from the base song. So a new take still belongs, and locked sections stay byte-identical.
- Old saves have no section data and compose through today's exact code path.

**Decisions needed from you:** see section 5. The main ones are: what explicit edits do to locked sections, what Generate, Surprise and Go wild do when sections are locked, and whether the continuity rules ship as their own engine bump.

---

## 1. Root cause of the continuity problem

### 1.1 How it was measured

`scripts/_section-continuity.ts` is a throwaway script. It works with `scripts/_compose-probe.ts`, a snapshot copy of `compose.ts` with two debug hooks; the copy is verified to produce identical events to `src` on every case. Run it with:

```
npx tsx scripts/_section-continuity.ts            # summary
npx tsx scripts/_section-continuity.ts --detail   # per-song intro → next dumps (instruments, figures, pitch classes, motif keys)
```

It composes 20 prompts × 4 variations. The prompts are the app's idea prompts plus genre prompts, e.g. country rock, folk, techno, synthwave, lo-fi, cinematic, blues, trap, ambient, house, 7/8 funk, DnB, jazz, bossa, reggae, metal, pop and trance. Events are assigned to a section by their onset. Then, for each pair of adjacent sections, it measures how much of the earlier section reappears in the later one:

| Metric | Meaning |
|---|---|
| inst | Share of the earlier section's `stem:instrument` keys still present |
| rhythm | Per stem, share of the earlier section's one-bar onset figures (16th-quantized) that recur |
| pc | Per pitched stem, share of the earlier section's pitch classes that recur |
| cells | Melodic cells: three consecutive (interval, inter-onset) pairs of the lead, transposition-invariant |
| motif | Same motif key (`kind:phraseSteps`, read from the probe's section plans) |
| dropStems | Stems that stop sounding at the boundary |
| filterJump | Low-pass step at the boundary, in normalized units (0.55 ≈ 2.4 kHz, 0.85 ≈ 9.8 kHz) |
| tex→ | Texture bed level after the boundary ÷ before |

### 1.2 Findings

**Intro → first section (Verse A, Groove A or Theme A), n = 80:**

| Opening | n | inst | rhythm | pc | motif shared | filter step | texture after/before |
|---|---|---|---|---|---|---|---|
| all | 80 | 0.93 | 0.51 | 0.92 | **0.00** | +0.17 | 0.48 |
| filteredPads | 10 | 0.92 | 0.60 | 1.00 | 0.00 | **+0.30** | 0.39 |
| soloBass | 8 | 1.00 | 0.75 | 0.90 | 0.00 | 0.00 | 1.00 |
| distantDrone | 3 | 0.78 | – | – | 0.00 | +0.35 | 0.37 |
| hookFragment | 25 | 1.00 | **0.17** | 0.84 | 0.00 | +0.25 | 0.70 |
| drumsAlone | 19 | 0.95 | 0.84 | – | 0.00 | 0.00 | 0.40 |
| textureBed | 15 | 0.82 | 0.47 | 1.00 | 0.00 | +0.20 | 0.28 |

Other measurements:
- Share of the first section's instruments that are **new**: 0.67.
- Lead notes in an intro: average 0.54, maximum 3. In hook-fragment intros the counts were `[0,2,1,2,2,3,1,2,3,2,2,1,1,3,1,2,2,2,1,1,1,2,1,3,2]`.
- Intro length: 2 bars in 36 of 80 songs, 4 bars in 44.
- Motif families per song: 3.44 on average (hook, verse, bridge, counter or solo). Verse A cells that recur in the first hook: **0.01**. Verse A cells that recur in Verse B: 0.68.

Here is what each finding means and where it comes from in the code (`compose.ts` unless noted):

1. **The intro and the next section share no motif.**
   - The melody kit keys motifs by `kind:phraseSteps` (`melody.ts`, `section()`). The intro either has no lead at all (five of the six openings) or plays `fragment`, which reads the `hook` motif. The first section plays `verse`.
   - `verse`, `hook`, `bridge` and `counter` are created by independent `makeMotif` calls, each from its own fork. So the song has 3 or 4 unrelated tunes, and the hook doesn't grow out of the verse (cell overlap 0.01).
   - The verse returns in Verse B (0.68) and the hook returns in every hook section (96% use one key), so repetition exists. *Development* doesn't: nothing is introduced, then varied, then answered.

2. **The hook fragment is almost silent.** `fragment` takes `motif.slice(0, 4)`, and `longNotes` then keeps only notes on group starts (`cls === 0`). That leaves 0–3 notes. On a 2-bar intro, `harm` is also `"none"` (`s.bars > 2` is required for the held chord).
   - Example, "lonely country rock with a trance pulse": a 2-bar intro of wind noise and no lead notes. Then Verse A starts drums, organ, FM bass and a distorted-guitar line all at once.

3. **Each part changes figure at the boundary.** The intro plays its parts with intro-only figures: `harm: "sustain"` for filteredPads, hookFragment and textureBed, and the bass style without its hook or ostinato for soloBass. Verse A switches to `mainHarm` and `groovesBass(mainBass)`.
   - Measured rhythm carry-over: 0.17 for hookFragment and 0.47 for textureBed. 0.00 is common, e.g. lo-fi, where a held piano chord becomes `0.7.12 | 0.10 | 2.8.14` comping.
   - With `P.hook === "bassline"`, a soloBass intro plays the hook bassline and the verse drops it for `inst.bassStyle`.

4. **Everything enters at once.** `LAYERS` and `planSection` turn on drums, bass, harmony and lead together in bar 1 of Verse A. There is no staggered entry, and no layer from the intro is used as a bridge. On average, 2 of every 3 of the verse's instruments are new.

5. **Production steps instead of ramping.** Automation is two points per section (start and end), and the next section starts at its own value.
   - filteredPads ends at 0.55 (about 2.4 kHz) and Verse A starts at 0.85 (about 9.8 kHz) on the downbeat.
   - Texture beds play at `L.texture` 1.0 × 1.4 (the bed boost) in the intro and 0.5 in the verse. Measured after/before ratio: 0.28–0.48.
   - The distantDrone intro's drone (its only sound) disappears in Verse A unless `H.drone` is set.

6. **Short intros.** In the duration fit, `order()` ranks the intro 6th of 10 for shortening. 45% of intros end up 2 bars long, which is too short to set up anything before the full band arrives.

7. **The random streams cross sections.** This makes regeneration unsafe, even though it isn't audible as a discontinuity:
   - `drumRng` is used for drums, `bassBar`, `harmonyBar`, shimmer textures, glitches and deconstruction.
   - `humRng` provides timing jitter for every non-texture event.
   - Both are single streams consumed in push order across the whole song. In the probe, swapping only the intro's opening (inside `planSection`, with the spec untouched) changed **639 of 700 middle sections (91%)**. By type: verse 178/195, chorus 130/140, build 108/120, dropout 87/95, bridge 65/70, drop 44/50, breakdown 22/25.

8. **Re-selecting the opening changes the whole song's production.** In `resolveSpec`, `ov.opening ?? rng.weighted(...)` skips a draw when an override is present, so every later draw shifts. Re-selecting the opening the song already has changed, in 16 of 16 songs, at least one of: ending (7), mix (12), FX (12), development (12), lyric theme (12), gear (3), form (1). The same pattern applies to `hook`, `ending`, `reverb`, `delay` and so on.

9. **Today's only "redo" redoes everything.** `variation + 1` reseeds sources, instruments, spec and form. Over 60 v → v+1 pairs:
   - The intro survived 0 times.
   - Changes: response instrument 42, section lengths 40, harmony instrument 39, lead instrument 37, hook instrument 33, hook type 28, opening 26, bass timbre 23.

**What is already good** (keep it):
- Key, mode, tempo and the chord progression family are song-wide.
- Figures (`bassHookFig`, `ostFig`, `chordHookFig`, `stabFig`, `rhythmHook`, `iso`) are drawn once per song.
- One instrument per stem, apart from the deliberate lead, response and hook swaps.
- `drumsAlone` → Verse A keeps the kick/hat figure (rhythm 0.84).
- `soloBass` keeps the bass (0.75).

For comparison, the deliberate contrast sections are expected to break continuity, and they do: chorus → dropout has inst 0.38, rhythm 0.07 and a filter step of −0.70. The problem is that intro → verse is treated like a contrast boundary when it should be a growth boundary.

### 1.3 Continuity rules (new arrangement behavior, engine ≥ 2)

These rules change the sound, so they apply only to songs with `engine >= 2` (see section 2.4 and decision D5). Engine-1 songs keep today's output exactly.

**R1. One germ, developed everywhere.**
- `makeMelodyKit` draws a **germ** once per song: a 3–5 note cell of degrees and rhythm.
- The verse motif is the germ plus continuation.
- The hook motif is the germ lifted (`lift` +2 or +3 degrees) with a rhythmic variant (augmentation or a shifted onset).
- The bridge plays the germ inverted or in long notes. The counter-line plays the germ's strong-beat notes.
- Every lead-bearing section's motif reports a `germ` id, and tests check that melodic cells overlap with the germ (≥ 0.3).
- **Intro rule:** every opening except drumsAlone plays the germ at least once in its last 2 bars, on the instrument that will carry it next. This is `inst.leadInst` before a verse and `hookInst` before a cold hook. The intro filter and reverb treatment stay.

**R2. Fix the hook fragment.**
- The fragment keeps the first 4–6 motif notes at their rhythm, lengthening only the last note. It no longer filters to strong beats.
- It is guaranteed at least 3 audible notes, and repeats once if the intro is 4 bars or longer.
- With call and response, it uses the same motif key as the hook (today's `c` suffix splits them in 4% of songs).

**R3. Minimum intro length.** 4 bars when the opening is hookFragment, filteredPads, textureBed or distantDrone. `order()` shortens the intro last, just before the final hook.

**R4. Layer carry.**
- Every stem audible in section *k* stays audible in the first bar of *k+1*, unless *k+1* is a contrast section (dropout, breakdown, bridge, or the outro's planned removals).
- Exits are scheduled (the outro rule), not dropped. Specific cases:
  - distantDrone: the drone fades over the first 2 bars of Verse A.
  - textureBed and filteredPads: the bed or pad level ramps to the verse level over 1 bar instead of halving on the downbeat.

**R5. Staggered entry.**
- After a sparse intro, at most **2 stems** enter on bar 1 of the first section. The rest enter on bar 3 and bar 5 (a 4-bar section: bar 1 and bar 3).
- Order, by opening:
  - drumsAlone: bass, then harmony, then lead.
  - soloBass: drums, then harmony, then lead.
  - Pad-type openings: drums with bass, then lead.
- Hook sections are exempt: they're supposed to hit with everything.

**R6. Figure handoff.** The intro's held chord becomes the verse figure through a 1-bar preview: the intro's last bar plays the verse harmony rhythm at reduced velocity behind the filter. If the hook is a bassline, a soloBass intro hands the hook bassline to Verse A for its first 4 bars, then switches to the verse bass style.

**R7. Ramped production.**
- At growth boundaries (intro → verse, verse → build, build → hook), automation starts at the previous section's end value and reaches its target within 1 bar. Contrast boundaries keep their steps: hook → dropout, → breakdown, → bridge, and the hard stop for "cut" endings.
- Add a third automation point per section: `startBeat + 1 bar`.

**R8. Stable palette.**
- Allowed to change between sections:
  - drum pattern A/B/broken, fills and percussion density;
  - bass style within the stem's style pair (`mainBass` ↔ `altBass`);
  - harmony rhythm within the section role's list;
  - lead register (±12), the lead/response/hook instrument swap, and the motif treatment;
  - width, filter, saturation and delay.
- Never allowed to change: key and mode (until a deliberate "key change up" section move from the genre plan), tempo (except a ritard ending), the drum kit, the timbre of each stem's instrument, the texture set (textures may fade, not swap), the motif family (germ) and the song figures.

**R9. Spec draw order.** Draw every spec choice first, then apply overrides (`const drawn = rng.weighted(...); const opening = ov.opening ?? drawn`), so a section-level tweak never moves global draws. Engine ≥ 2 only, because saves with overrides would otherwise change. This must be coordinated with the in-flight `resolve.ts` refactor.

**R10. Per-section random streams.** This is a structural precondition for section takes (section 2), not a sound rule in itself:
- With engine ≥ 2, drums, bass, harmony, texture and humanize draw from `partRng.fork("<stream>@<sectionKey>")`.
- Editing one section's plan can then never re-randomize another.
- Engine 1 keeps the shared streams. Takes on engine-1 songs still work (section 2.5), because a take always forks its own streams.

---

## 2. Section lock and regenerate design

### 2.1 Concepts

| Term | Meaning |
|---|---|
| **Section key** | A stable identity derived from the form template, not the index: `intro`, `verse.A`, `build`, `chorus`, `dropout`, `verse.B`, `bridge`, `chorus.final`, `outro`. Repeats get `#2` (`build#2` in EDM). Cold opens are `chorus.cold` and `drop.cold`; blues uses `verse.A`, `solo.B`, `verse.final`. Computed by `sectionKeys(sections)` from `type`, `part`, `final` and the "Cold Open" label, so `Section` gets no new field and the golden hashes don't move. |
| **Base song** | Today's composition: `composeWithParts(plan, dims, variation, trackSeeds)`. |
| **Take** | A 32-bit seed for one section. 0 or missing means the base song's own version. |
| **Cell take** | A seed for one section × one stem. It overrides the section's take for that stem. |
| **Lock** | A flag on a section key. Locked sections are never given new seeds by any regenerate action. |

### 2.2 Deterministic seed model

- Song seed (unchanged): `songSeed = plan.seed ^ imul(variation + 1, 0x9e3779b1)`. With a track take: `^ imul(trackSeed, 0x85ebca6b)`, exactly as today.
- A take's random streams, for section key `K` and seed `S` (cell seed if set, else the section's take):
  `takeRng = makeRng(songSeed ^ imul(S, 0xc2b2ae35) ^ hashString(K))`.
  Its forks are `"drums"`, `"bass"`, `"harmony"`, `"texture"`, `"human"`, `"melody"` and `"variant"`. Each stem gets its own stream; today bass and harmony borrow `drumRng`.
- **Shared by every take** (from the base streams, never reseeded by a take): form, timeline, chords, sources, instruments, spec, gear, figures, `arpDir`, drum patterns A/B and broken index, `breakHits`, the motif map and germ, and automation.
- **Owned by a take:** drum micro-choices (ghosts, deconstruction, glitch, fill type, sync-kick pickups); bass and harmony realization randomness; shimmer; humanize; melody realization (`vary`, the phrase-3 variant, clash snapping, velocities, bends, call-and-response shift); and the variant choices in section 2.3.
- **Melody detail:**
  - `section()` gains `ctx.take`. Realization uses `rng.fork(seed + "#" + take)`.
  - Motif creation keeps `rng.fork(seed).fork("m" + key)` with the base section's density and bar layout. A take on the first verse can therefore never change the verse motif that Verse B reuses.
  - With `take` absent, both forks equal today's `r`, so engine-1 output is unchanged.
- New seeds come from `crypto.getRandomValues` at click time (non-zero, `>>> 0`). The same seed → the same take, forever.

### 2.3 What a take may change ("variant", drawn from `takeRng.fork("variant")`)

A take must sound different but keep the R8 palette. The defaults below are "medium" boldness (decision D6):

| Stem | Varies | Fixed |
|---|---|---|
| Drums | Ghost and velocity detail; fill type (snare, tom, tuplet, none); extra-perc on/off in verse, chorus and solo; sync-kick pickups | Kit, pattern letter of the section role, crashes, build roll, outro removal order |
| Bass | Style ∈ {role default, `altBass[default]`} in verse, chorus and solo; approach-note and passing-note choices | Timbre, octave, hook and ostinato figure, pedal; build, dropout, bridge and outro styles |
| Harmony | Rhythm ∈ the role default plus one neighbor (sustain↔swells, stabs↔pulse8, strum↔pick, arp↔ostinato if the trick is on); voicing top-note target | Instrument, chord symbols, hook figure in hook sections, `reduced` in bridges |
| Lead | Treatment ∈ {restate, vary tail, sequence +1/+2 degrees, 8th displacement, thinned (−25% density)}; register 0 or ±12 within the instrument's range | Motif family (germ or kind key), instrument choice of the role (lead, response or hook), call-and-response on/off (set by the trick) |
| Texture | Shimmer positions | Beds, drones, risers, impacts |
| Production | – | Automation endpoints (a take never changes filter, width or saturation, so boundaries stay predictable) |

Stems keep their on/off state: a take can't silence a stem the base song plays in that section, or add one it doesn't. This keeps the voice-leading chain (`prevVoicing`) and boundary fills valid.

**Linked stems.** A bass style that follows the kick (`slide808`) is linked to drums. A drums cell take on a section also re-takes that section's bass with the same seed, and the UI says "Drums + 808 bass".

### 2.4 `SongState` additions and back-compat

```ts
// src/lib/music/sections.ts (new)
export type SectionState = {
  locked?: boolean;
  /** 0 / missing = the song's own version of this section. */
  take?: number;
  /** Per-track takes inside this section; override `take` for that stem. */
  stems?: Partial<Record<StemId, number>>;
};
export type SectionStates = Record<string /* section key */, SectionState>;
export type TimelineEntry = { key: string; bars: number };

// src/lib/library/types.ts
export type SongState = {
  ...existing fields (prompt, edits, locks, wild, variation, dimensions, tracks, engine);
  /** Section locks and takes by section key. Missing / {} = every section is the song's own version. */
  sections?: SectionStates;
  /** Frozen section lengths while any section is locked or retaken. Missing = fit to the target duration as today. */
  timeline?: TimelineEntry[];
};
```

- `normalizeSongState` adds `sections: normalizeSections(s.sections)` and `timeline: normalizeTimeline(s.timeline)`:
  - Keys must match `/^[a-z]+(\.[A-Za-z]+)?(#\d+)?$/` and be at most 24 characters.
  - Seeds are `Math.trunc(x) >>> 0`. Seeds equal to 0 and empty entries are dropped.
  - A state with no locks and no seeds normalizes to `{}`.
  - The timeline has at most 24 entries with bars from 1 to 32. A malformed timeline is dropped as a whole, never partially applied.
- **Back-compat guarantee:** `sections` empty and `timeline` absent → `composeSong(...)` returns the `composeWithParts(...)` object itself, without a second compose. Every golden fixture keeps its hash.
- **Project files** stay format v1. The fields are optional, so older builds ignore them (the genre plan's section 10.4 rule).
- `stateOf()`, `current`, session restore, `openSong`, save, and the dirty check in `SoundCanvas.tsx` carry both fields.
- **Not the same as the existing `locks`.** The existing `locks: PlanEdits` are identity locks for Go wild ("keep this kit"). `sections[k].locked` is a different concept. The UI calls section locks "Lock section" and identity locks "Keep".

### 2.5 Compose API and splicing

```ts
// compose.ts (internal options; public signature stays compatible)
compose(plan, dims, variation, partSeed, opts?: {
  take?: { key: string; index: number; seeds: Partial<Record<StemId, number>> };
  timeline?: TimelineEntry[];
});
// src/lib/music/sectionTakes.ts (new; keeps the splice out of compose.ts, which is being refactored)
composeSong(plan, dims, variation, trackSeeds, sections?: SectionStates, timeline?: TimelineEntry[]): Song;
```

**Ownership.**
- `push()` tags each event with the index of the section being rendered, using a module-private `Symbol`. Events from the ending block are tagged with the last section.
- `stable()`, `JSON.stringify` and `Object.keys` ignore symbol keys, so golden hashes and saved data are unaffected. Spreads (`{...e}` in the glitch code) copy the tag.
- Ownership by composing section, not by onset time, avoids misfiling a downbeat that humanize pulled 45 ms earlier.

**Timeline.** When `opts.timeline` is given, `formRng.range()` is still drawn (to keep the stream aligned). The fit loop is skipped, and `tpl` is rebuilt from the keys and bars. If those equal the fitted result, output is byte-identical. This is tested.

**Algorithm.**

```
base = composeWithParts(plan, dims, variation, trackSeeds, { timeline })
if no seeds in sections → return base
keys = sectionKeys(base.sections)
for each section index k with a take or cell seeds (keys[k] in sections):
  group k's stems by (effective take seed, track partSeed)
  for each group g:
    alt = compose(plan, dims, variation, g.partSeed, { take: { key: keys[k], index: k, seeds }, timeline })
    replace base events owned by k with stem ∈ g.stems by alt events owned by k with stem ∈ g.stems
    if g covers all stems: section k's desc = alt.sections[k].desc (the description follows the take)
sort events by t (stable); automation, barStarts, sections and tonicTail come from base
```

- Cost: compose is 1–2.5 ms per call on desktop (measured). A full "redo 8 sections" is at most 8–16 extra composes, about 40 ms. Cache alt composes by `(key, seed, partSeed, baseInputsHash)` in a small LRU (64 entries) inside `useMemo`, so toggling a lock or a mix change doesn't recompose.
- **Why locked sections are byte-identical.** Section *k*'s events depend only on the base inputs, *k*'s key, *k*'s own seeds, and the track `partSeed`. In the alt compose, every section other than *k* is the plain base path, so the streams, motif map and voicing chain entering *k* are the same regardless of other sections' takes. Regenerating other sections never touches *k*'s inputs.

**Boundaries, tails and overlap.**
1. Events owned by *k−1* that ring into *k* are kept exactly as composed: held chords, crash (4 beats), riser end, impact. They were composed against *k*'s section type, which a take never changes.
2. An event owned by *k* may start up to the humanize jitter before *k*'s start: at most `jitterSec / beatSec` beats, e.g. 0.1 beat at 140 BPM. That is allowed, and tests bound it.
3. The lead is already clamped to `secEnd − 0.05`. The tuplet run starts at `secEnd − 1`, so takes never spill forward. Bass `tail` and dropout notes end within their section.
4. Reverb, delay, pump and the master bus live in the render graph (`render.ts`), not in events. Tails from *k−1* decay naturally into *k*, whatever take *k* uses, so the splice needs no crossfade.
   - One exception: the bus compressor and limiter react a few milliseconds early to *k*'s downbeat. The audio lock test therefore ignores the last 50 ms of a locked section.
5. Endings (fade, finalHit, cut, ritard) run inside each compose on the same timeline. A take on the outro is warped, faded and truncated exactly like the base, and the base `barStarts` (warped by the ritard) stays valid.
6. Voice leading: a take keeps each stem on or off (section 2.3), so `prevVoicing` entering *k+1* is unchanged whatever take *k* has. On engine ≥ 2, a section's first voicing is also computed from the canonical previous chord, not the previous rendered voicing, to remove this dependence completely.
7. Playback:
   - `engine.setSong(song, "continue")` already swaps songs in place. If the retaken section is playing or ahead of the playhead, the new take is heard from the next scheduler tick (300 ms lookahead).
   - "New take" on the selected section also starts playback **one bar before** that section (pre-roll), so you hear the transition from the locked section into it. This is what the user's complaint is about.

### 2.6 Interactions

| Action | With no section locks or takes | With locks or takes present |
|---|---|---|
| Section "New take" | `sections[k].take = newSeed()`; clears `sections[k].stems` | Disabled on locked sections ("Unlock to redo") |
| Section × track "New take" | `sections[k].stems[stem] = newSeed()` (plus linked stems) | Disabled on locked sections |
| "Redo unlocked sections" | n/a (hidden) | Every unlocked key gets a new `take`, and its `stems` are cleared. Variation, edits and tracks are unchanged |
| Lock or unlock a section | First lock: freeze `timeline` from the current song (no audible change) | Unlocking keeps the section's take, so nothing changes until you redo it |
| **Generate** (same prompt) | `variation + 1` (today) | Becomes **Redo unlocked sections**, and the button label changes. Recommended (D2) |
| Generate (new prompt) or Open song | New song | Confirm "Start a new song? Your N locked sections will be cleared." Then clear `sections` and `timeline` |
| **Surprise** | `variation + 1` | Recommended (D2): "Surprise" stays a whole-song reroll with a confirm "This rewrites locked sections too". The alternative is to disable it |
| **Go wild** | Fusion edits + `variation + 1` | Recommended (D3): confirm, then unlock all and clear takes. Fusing only unlocked sections would mix two palettes, which breaks R8 |
| Track "New take" (TrackPanel) | `tracks[id].seed = newSeed()` (today; also reseeds that stem's motifs and figures) | Writes `sections[k].stems[id]` for every **unlocked** section and leaves `tracks[id].seed` alone. The panel says "New take in unlocked sections". Recommended (D4) |
| Mix-only changes: gain, pan, mute, solo, and the space, grit, bass and width dims | No recompose | No effect on locks. Locks pin the composition, not the mix |
| Compose dims (drum feel, pulse, genre pull, vocal character), identity edits (genre, mood, key, BPM, meter, instruments, avoid, style chips) | Recompose | The edit applies to the whole song including locked sections. A notice says "Also changed locked: Intro, Chorus · Undo". Locks guard against regeneration, not explicit edits. Recommended (D1) |
| BPM or meter edits | The bar fit may change | The frozen `timeline` keeps every section's bar count, so locked sections keep their length in bars. Their duration in seconds scales |
| Form edits (opening, form slow-burn or hook-first, hook type, ending) | Recompose | Keys that disappear (e.g. `intro` under hookFirst) keep their entries **dormant** in `sections`, and the notice says so. They come back if the form returns. Changing a locked section's own opening or ending chip is disabled (the chip shows a lock) |
| Engine "Upgrade" (genre plan section 10) | Re-render | Locks and takes are kept as data, and content changes. A notice and Undo are shown |
| Undo | – | Section actions push the previous `sections` map onto a session-only undo stack (10 levels). Each section also keeps a session-only take history (the last 5 seeds) for ◀ ▶ A/B comparison |

---

## 3. UI design

### 3.1 Desktop and the full-width studio layout: "Section lane" + grid

The current `SectionStrip` (a 44 px proportional bar plus a detail card) becomes a **SectionLane** that spans the studio width:

```
┌ toolbar ───────────────────────────────────────────────────────────────────────┐
│ [⟳ Redo unlocked (6)]  [🔒 Lock all] [Unlock all]   [⟲ Loop section] [◀ pre-roll 1 bar ✓] │
├ lane (proportional widths, playhead, loop brace) ──────────────────────────────┤
│ 🔒Intro│ Verse A  t2 │ Build │ Chorus     │Out│ Verse B │Bridge│ 🔒Final Chorus │End│
│ 4 bars │ 8 bars      │ 4     │ 8          │ 2 │ 8       │ 4    │ 8              │ 4 │
├ track grid (rows = tracks, columns = sections, same widths) ───────────────────┤
│ Drums  ▁▃▅ ▒▒▒▒│▅▅▅▆▅▅▅▅ ⟳│▆▇▇█│█████████│▂ │…                                  │
│ Bass   ░░░ ▒▒▒▒│▃▃▃▃▃▃▃▃ ⟳│…                                                  │
│ Chords …                                                                        │
│ Lead   …                                                                        │
│ Texture…                                                                        │
└────────────────────────────────────────────────────────────────────────────────┘
```

- **Lane block:**
  - Label, bar count and a lock toggle (a 24 px icon button inside a 44 px hit area).
  - A take badge (`t2`, `t3`) when the section isn't the song's own version.
  - The intensity underline is kept.
  - Click to select; double-click to play from the section with pre-roll.
- **Grid cell:**
  - A density sparkline of that stem's owned events.
  - On hover or focus, a ⟳ button (cell take). A dot shows when the cell has its own seed.
  - Empty cells (the stem is silent there) show a dash and have no button.
- **Locked cue:**
  - Amber border and lock glyph on the lane block, and an amber 6% tint with a diagonal hatch over the whole column.
  - Cell buttons in the column are hidden.
  - `aria-label` is "Intro, 4 bars, locked".
- **Detail panel** (right column on desktop): today's description (instruments, rhythm, changes, role) with these buttons:
  - ▶ Play from here (with pre-roll if enabled)
  - ⟲ Loop
  - 🔒 Lock / Unlock
  - ⟳ New take, with ◀ ▶ through the take history and "Back to original" (take 0)
  - A "Tracks in this section" list: five rows, each with ⟳

  The existing tweak chips stay, and are disabled with a lock icon on locked sections.
- **Status line:** "Kept Intro and Final Chorus · rewrote 6 sections" or "Verse A take 3 · playing from the bar before".

### 3.2 Phones

- **Overview bar:** a thin (8 px) proportional bar with the playhead and amber marks for locked sections, for orientation only.
- **Chip strip:** one 44 px tall chip per section, at least 64 px wide, in a horizontally scrolling row. The playing section scrolls into view. Each chip shows its label, a 🔒 badge when locked, and a take dot.
- **Tap a chip** to open a **bottom sheet** (`max-h-[85dvh]`, the same shell as the OptionSheet):
  - Big buttons: Play from here, Loop, Lock, New take.
  - Take ◀ ▶.
  - The per-track list (five 44 px rows with "New take").
  - The section description, collapsed by default.
- **Sticky action bar.** When at least one section is locked, a bar above the Nudge area holds **"⟳ Redo unlocked (6)"**, and Generate's label changes to match (D2).
- No hidden gestures: no long-press-to-lock. Every action is a visible button.

### 3.3 Playback: play-from and loop-section

- `MusicEngine.play(fromBeat)` exists. Add `setLoop({ start, end } | null)`:
  - In `tick()`, when the next event's beat is past `end`, advance `startTime` by `(end − start) × beatSec`, set `cursor = indexAt(start)`, and set the automation cursor to `start` with `setAuto(autoAt(song, start))` scheduled at the wrap time.
  - Held notes ring past the wrap, like the song's own loop.
- `position()` reports beats inside the loop. The lane draws the loop brace.
- The loop survives `setSong` when the looped section key still exists, re-resolved by key to new beats.
- **Pre-roll:** "Play from here" starts at `startBeat − 1 bar` when the toggle is on (on by default, because judging transitions is the point).

### 3.4 Keyboard and accessibility

- Arrow keys move the selection along the lane. `L` locks, `N` makes a new take, `Space` plays from the section, `Shift+L` loops.
- The lock button has `aria-pressed`, and take changes are announced through the existing `aria-live` status.

---

## 4. Implementation steps

The refactor of `spec/genres/resolve/compose/parse` must land first. Every step below runs `npx tsx scripts/golden.ts check` and must stay green, except step 9, which deliberately changes the sound of engine-2 songs only.

**Phase A: section takes (no sound change for existing songs)**

1. **`src/lib/music/sections.ts`** (new):
   - `sectionKeys(sections)`, `SectionState` and its types, `normalizeSections`, `normalizeTimeline`, `newSeed()`.
   - `cellsOf(sections, keys)`, which expands takes, cell seeds and linked stems.
   - `redoUnlocked(sections, keys)` and `trackTakeUnlocked(sections, keys, stem)`.
2. **`compose.ts`:**
   - (a) A module `SECTION` symbol, set in `push()` from a `curSection` variable that the section loop updates. The ending block uses the last index.
   - (b) An `opts.timeline` path in the template build.
   - (c) An `opts.take` path:
     - When `si === take.index`, swap in that section's stream set: drums, bass and harmony rng (instead of `drumRng` for `bassBar` and `harmonyBar`), shimmer and glitch rng, and `push`'s humanize rng.
     - Apply the variant to `sp` after `planSection(s, si)` (section 2.3), and pass `take` to `mel.section`.
   - (d) Export a `SectionTakeOpts` type. The legacy path stays a no-op when `opts` is absent.
3. **`melody.ts`:**
   - `section(kind, phrases, ctx)` gains `ctx.take?: number` and `ctx.motifDensity?: number`.
   - Motif creation uses `rng.fork(ctx.seed).fork("m"+key)` with the base density; realization uses the take fork. Identity holds when `take` is absent.
   - Add lead treatments (sequence, displace, thin) as pure functions on `MotifNote[]`.
4. **`src/lib/music/sectionTakes.ts`** (new): `composeSong(...)` (section 2.5), with an LRU cache and the ownership-based splice. It also exports `ownedBy(song, index)` for the UI sparklines and tests.
5. **`src/lib/library/types.ts` and `db.ts`:** add `sections?` and `timeline?` to `SongState`, and normalize them. `scripts/golden.ts` adds legacy states with garbage `sections` and `timeline` values that must load and compose as base.
6. **`engine.ts`:**
   - `setLoop` and the loop wrap in `tick()`. `position()` reports `loop`.
   - `play(fromBeat)` is unchanged; pre-roll is computed by the caller.
7. **UI:**
   - `SectionStrip.tsx` → `SectionLane.tsx`, plus `SectionSheet.tsx` for phones. The tweak chips move into the sheet and panel.
   - `SoundCanvas.tsx`:
     - State for `sections` and `timeline`, and `composeSong` instead of `composeWithParts`.
     - Handlers `lockSection`, `sectionTake`, `cellTake`, `redoUnlocked`, `loopSection` and `playFromSection(pre-roll)`.
     - Branches in `generate`, `surprise`, `doGoWild`, `newTake` and `onEdit` per section 2.6. The "also changed locked" notice with Undo.
     - Persistence wiring.
   - `TrackPanel.tsx`: the "in unlocked sections" wording and tooltip when locks exist.
   - `describe.ts`: the section description reflects a take (via the spliced `desc`), and the "Copy as prompt" text is unaffected.
8. **Browser test** (`scripts/browser-test.mjs`): generate a song, lock the intro, redo the unlocked sections. Assert that the intro's lock badge is present, that the take badges changed on the others, and that the save → reload round trip keeps both.

**Phase B: continuity rules (engine ≥ 2, new songs only)**

9. Implement R1–R10 behind `engine >= 2`. The engine number is passed into compose through `ComposeDims`, or a new `opts.engine`.
   - `melody.ts`: germ, R1 and R2.
   - `compose.ts`, `planSection`: R3–R7 and R10.
   - `resolve.ts`: R9.
   - Engine-1 golden fixtures stay identical. New fixtures are captured for engine 2.

**Tests** (`scripts/section-check.ts`, new; run alongside golden):

| Test | Assertion |
|---|---|
| Back-compat | For every golden state with `sections` missing, `{}` or containing only zero seeds, `composeSong` deep-equals `composeWithParts` (same object when empty). Old project and session JSON loads, and normalizes to `{}` with no timeline |
| Timeline identity | `compose(..., { timeline: keysAndBarsOf(base) })` is identical to `base` for all golden cases |
| Determinism | The same `SongState` gives the same song hash twice in-process and in a fresh process, and after a JSON round trip |
| Locked sections byte-identical | 40 prompts × 4 variations × 5 random lock sets: run `redoUnlocked` 3 times, then a track take with locks. For every locked *k*: the owned-event hash, `desc` and automation points are identical. With the Phase-A audio print, the RMS windows of the locked span (minus its last 50 ms) are within 0.01 dB |
| Take isolation | Changing the seed of section *j* doesn't change any other section's owned events, including unlocked sections that have their own takes |
| Take does something | In ≥ 90% of cases, a new section take changes ≥ 25% of that section's lead and drum events. A cell take changes only its stem, plus linked stems |
| Palette kept | In take sections: key, mode, BPM, each stem's instrument (from the role's allowed set) and the motif kind are unchanged. Lead cells overlap with the base take of the same section by ≥ 0.3 for restate and vary-tail treatments |
| Boundaries | Every event owned by *k* starts ≥ `start(k) − jitter − ε`, and owned events sum to the total. No duplicated or dropped events at any boundary |
| Form edits | With locks: a BPM edit keeps bars per key. A hookFirst edit keeps the `intro` entry dormant, and reverting restores it |
| Spec draw order (engine 2) | Re-selecting the current opening, hook or ending is a no-op on the spec hash. On engine 1 it currently fails 16 of 16, which is recorded as frozen legacy behavior |
| Continuity metric (engine 2) | `continuity(prev→next) = 0.3·instCarry + 0.2·figureCarry + 0.3·motifLink + 0.1·(1 − min(1, newStemsAtBar1 / 3)) + 0.1·(1 − min(1, abs(filterStep) / 0.3))`, measured on the next section's first 4 bars (definitions from `_section-continuity.ts`; `motifLink` = share of the next section's lead cells found in any earlier section or the germ). Engine 2: intro→first-section ≥ 0.6 for every style × 4 variations, and growth boundaries (verse→build→hook) ≥ 0.5. Engine-1 values are recorded as the baseline (table in section 1.2), not asserted |

---

## 5. Decisions for you

- **D1. Explicit edits on a song with locked sections** (key, tempo, genre, instruments, compose sliders).
  - Recommended: apply to everything, with an "Also changed locked: …" notice and Undo. Locks guard against regenerating, not against editing.
  - Alternatives: block those edits while locks exist, or freeze each locked section's inputs. Freezing gives byte-identical audio, but a locked intro could end up in the old key or tempo.
- **D2. Generate and Surprise when sections are locked.**
  - Recommended: Generate (same prompt) becomes "Redo unlocked sections". Surprise stays a whole-song reroll behind a confirm.
  - Alternative: Surprise also redoes only unlocked sections, with bolder takes.
- **D3. Go wild with locks.**
  - Recommended: confirm, then unlock all.
  - Alternative: disable Go wild while sections are locked.
- **D4. Track "New take" with locks.** Recommended: re-take that track only in unlocked sections, keeping its motifs and figures. Today's behavior also rewrites the track's motifs, which would change locked sections or break their connection to the rest.
- **D5. Shipping the continuity rules.**
  - The rules change the sound, so they need an engine bump. New songs get them; old saves keep their sound and get "Upgrade".
  - Should they take `engine: 2` now, ahead of the genre plan's sound phases, or wait and ship with the first genre-engine bump?
  - Recommended: ship Phase A (locks and takes) immediately, since it has no sound change, and decide Phase B timing together with the genre plan's engine numbering.
- **D6. How different a section take should be.** Recommended: medium, i.e. the variant table in section 2.3. A later "bolder" toggle could allow pattern-letter and harmony-family changes.
- **D7. Take history.** Recommended: session-only ◀ ▶ history (the last 5 takes per section); only the current take is saved. Alternative: save the history in the song.

## Appendix: probe and script housekeeping

- `scripts/_compose-probe.ts` is a frozen copy of `compose.ts` with two debug hooks, and `scripts/_section-continuity.ts` is the measuring script. Both are throwaway. Delete them once `scripts/section-check.ts` exists. The probe will drift from `src` as the refactor lands, and the script prints "probe copy matches src compose: yes/NO" to show it.
- Raw output of `npx tsx scripts/_section-continuity.ts`, 2026-10-06, abridged to the baseline rows:

```
verse→build    n=76 inst 0.79 rhythm 0.23 pc 0.54 cells 0.00 dropStems 1.00 filterJump -0.30
dropout→verse  n=76 inst 0.67 rhythm 0.03 pc 0.93            dropStems 0.00 filterJump +0.62
build→chorus   n=56 inst 0.78 rhythm 0.31 pc 0.93            dropStems 0.00 filterJump  0.00
chorus→dropout n=56 inst 0.38 rhythm 0.07 pc 0.12 cells 0.00 dropStems 1.52 filterJump -0.70
verse→bridge   n=56 inst 0.48 rhythm 0.14 pc 0.42 cells 0.00 dropStems 0.18 filterJump -0.34
bridge→chorus  n=56 inst 0.82 rhythm 0.20 pc 0.84 cells 0.00 dropStems 0.16 filterJump +0.32
Intro-only change → 639/700 middle sections changed (91%)
Variation v→v+1 → intro identical 0/60
```
