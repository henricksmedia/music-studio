# Genre expansion plan: 200 genres, real gear sounds, and a Producer breakdown that covers them all

Status: approved Oct 6, 2026 (decisions in section 13). Phase 0 is done; phase 0.5 (studio layout and visuals, sections 15–16) is next.

## 1. Summary

The app knows 15 genre recipes and 18 "EDM substyles". Many genre requests land on the wrong recipe, the substyle label is often picked at random, and the "gear" list is text that never changes the sound. This plan replaces that with four layers:

1. **Synthesis primitives.** Oscillators, noise colors, wavetables, FM operators, granular sources, filters, envelopes, LFOs and effects, all built from Web Audio nodes with no audio files.
2. **Patch archetypes.** Sounds producers name by type, such as reese bass, wobble, donk, acid, supersaw, pluck, chord stab, hoover, log drum or gated pad, built from the primitives.
3. **Gear models.** Synthesized models of real instruments' sound engines, such as the TR-808, TR-909, TB-303, Juno-106, DX7, Minimoog, Rhodes, Hammond and Leslie, and Space Echo. Each model realizes one or more archetypes and changes what you hear when chosen.
4. **Style recipes.** 200 styles in 24 families. Each style declares its tempo, groove, named drum patterns, bass line style, chord and lead approach, song form, production moves and default gear.

The prompt parser, composer, Producer breakdown and Song identity card are all driven from the style and gear registries. Adding a style becomes adding data rather than code.

The 50 electronic styles you listed are the first full content milestone (phase 5). They get deeper trance, psytrance and lo-fi families around them.

## 2. Where the app is today (evidence)

Findings from running 35 genre prompts through the real parser and composer (`scripts/_genre-survey.ts`):

- **Unrecognized genres become random genres.** Dubstep, reggae, afrobeat and salsa aren't recognized. They fall back to blends like ambient plus rock in 6/8.
- **Proxies lose the genre's feel.** Bossa nova comes out as swung jazz with walking bass, sometimes in 3/4 or 5/4. Funk is house plus boom bap with EDM drops. R&B, soul and gospel are a 12-bar blues shuffle. Pop is folk plus synthwave plus rock. Hardstyle is trance, punk and metal are generic rock, and bluegrass has drums.
- **Random labels.** `resolve.ts` picks a substyle name at random from `SUBSTYLES`, and the sound doesn't change to match. Plain "techno" gets labeled Dub Techno, trap gets Drill, and house gets Afro House.
- **Shallow substyle profiles.** `EdmProfile` can only change BPM, a few tricks, kit, timbres, mode, reverb, delay and pump. It can't change drum patterns, bass line rhythm, form, section moves or sounds.
- **One structure for nearly everything.** Every genre except blues gets the same nine-section, EDM-style timeline, with builds and dropouts, including jazz and folk.
- **Gear is flavor text.** `GEAR` and `EdmProfile.gear` are names printed in the breakdown. The card even says "flavor only".
- **Small vocabulary.**
  - Kits: 7 (`acoustic`, `electronic`, `808`, `brush`, `lofi`, `cinematic`, `gated`).
  - Bass sounds: 9, bass line styles: 11.
  - Chord sounds: 12, lead sounds: 17.
  - Drum voices: 11, with no cowbell, conga, bongo, timbale, tambourine, claves, woodblock or snaps.
- **Hard limits.** The tempo is clamped to 55–180 BPM in `parse.ts` and 55–185 in the breakdown. Frenchcore, gabber, hi-tech psy and breakcore need up to 220.
- **The UI doesn't scale.** The breakdown's option sheet (`OptionSheet` in `ui.tsx`) renders every option as one wrapping list of chips. "+ blend style" in `UnderstoodPanel.tsx` is a plain select of 15 genres. Neither works for 200 styles.

## 3. Definition of done for a style

A style counts as supported only when all of these hold over 4 variations and 2 dimension settings:

| Check | Example (UK Garage) |
|---|---|
| Tempo inside the style's range | 130–136 BPM |
| Meter and feel inside the style's set | 4/4, swung 16ths 55–65% |
| Signature drum pattern present | 2-step: kick on 1 and the "and" of 2, no four-on-the-floor, shuffled hats |
| Bass line style in the allowed set | syncopated sub or "warp" bass |
| Signature sounds present | organ or Rhodes chord stabs, chopped vocal |
| Form family correct | Club form with a bass switch-up |
| Default gear in the allowed set | MPC3000-style swing, Korg M1 organ |
| The label shown is the style actually used | never a random substyle name |
| Forbidden elements absent | no 16th-note trance roll bass |

The style-check harness (section 11) asserts these automatically.

## 4. Architecture

```
prompt ─▶ parser (style alias index) ─▶ Plan { styles[], moods, edits }
                                              │
                                   resolver: StyleRecipe ⊕ blend ⊕ locks
                                              │
            composer: form template ▸ section moves ▸ drum pattern set ▸ bass line ▸ harmony ▸ lead
                                              │  NoteEvent { inst/archetype, gear, params }
                                              ▼
           render graph: per-stem gear insert FX ▸ shared buses ▸ master   (live and offline share code)
                                              │
          describe layer: Song identity + Producer breakdown, built from the same registries
```

New modules (names are proposals):

| Module | Contents |
|---|---|
| `src/lib/music/synth/primitives.ts` | Oscillators, PWM, sub-oscillator, noise colors, wavetable, FM operator graph, granular, filters (including the ladder), envelopes, LFOs, drive curves |
| `src/lib/music/synth/fx.ts` | BBD chorus (Juno I/II), phaser, Leslie, tape echo, spring/plate/hall/gated reverb IR generators, bitcrusher, tape saturation |
| `src/lib/music/synth/worklets/` | Optional AudioWorklet processors for the ladder filter, 303 filter, sync and wavefolder (section 6.6) |
| `src/lib/music/patches.ts` | Patch archetype registry (section 5) |
| `src/lib/music/gear/*.ts` | One file per gear model, plus `gear/index.ts` (registry) |
| `src/lib/music/styles/*.ts` | One file per family, plus `styles/index.ts` (registry, aliases, inheritance) |
| `src/lib/music/patterns.ts` | Named drum patterns, fills and bass line rhythms |
| `src/lib/music/forms.ts` | Form templates per family plus section moves |

The existing `genres.ts`, `spec.ts` EDM table, `instruments.ts` and `resolve.ts` keep working during migration. They become thin adapters over the registries and are retired gradually (phase 0 and later).

## 5. Synthesis source taxonomy (the foundation layer)

### 5.1 Primitives: what exists vs what's needed

The "today" column comes from reading `instruments.ts` and `render.ts`.

| Taxonomy item | Engine primitive | Today | Gap |
|---|---|---|---|
| Sine | `OscillatorNode` sine | Yes | — |
| Saw | `OscillatorNode` sawtooth | Yes | No band-limit control (fine) |
| Square | `OscillatorNode` square | Yes | — |
| Triangle | `OscillatorNode` triangle | Yes (snare, rim) | Not offered as a tonal voice |
| Pulse / PWM | Two saws with one inverted and delay-offset (width = offset), or a PeriodicWave table set swept by gain crossfade; AudioWorklet for true PWM | **No** | Needed for Juno, SID, NES and Prophet sounds |
| Sub-oscillator (−1/−2 oct) | Square or sine at f/2 or f/4, gain-mixed | Partly (fixed sine at f/2 in `saw`/`reese`) | Make it a parameter of every bass patch |
| White noise | Seeded buffer | Yes (seeded LCG, deterministic) | — |
| Pink noise | Buffer filtered by the Voss-McCartney or Kellet method at creation | **No** | Hats, risers, pads, ocean/wind |
| Brown noise | Integrated white buffer | **No** | Rumble, techno "rumble kick", drones |
| Blue noise | Differentiated white buffer | **No** | Hi-hat air, chip noise, glitch |
| Wavetable | Bank of `PeriodicWave` frames; morph by crossfading 2 oscillators with gain automation, or an AudioWorklet table scanner | **No** (single fixed PeriodicWaves only) | Growl and wobble, future bass, modern bass |
| FM carrier/modulator | Operator graph: osc → gain(index) → carrier.frequency; algorithms as op lists; feedback via an op → own-frequency loop through a 1-quantum `DelayNode` (approximate) or a worklet | Partly (2-op in `fm`, `epiano`, `bell`, `fmLead`) | Needs 4–6 operators with DX7-style algorithms and per-op envelopes |
| Granular | Grain scheduler: many short `AudioBufferSourceNode`s with windowed envelopes, randomized (seeded) position, pitch and pan, over synthesized source buffers | **No** | Ambient, IDM, glitch, psybient, vocal-chop clouds |
| Karplus-Strong | Pre-rendered buffer (exists) | Yes (`ksBuffer`: guitar, banjo, bass, nylon) | Add harp, koto, sitar-buzz (bridge) variants |
| Hard sync | AudioWorklet (Web Audio has no native sync) | **No** | Complextro, electro house, Prophet sync lead |
| Ring mod / AM | Gain node with an audio-rate gain param | Partly (tremolo only) | Metallic percussion, industrial |
| Wavefolder / drive | `WaveShaperNode` curve library | Partly (2 curves) | Folder, tube, diode, hard clip, rectify for gabber and hardstyle kicks |
| Ladder low-pass (24 dB, resonant) | AudioWorklet (Huovilainen/Zavalishin TPT model); fallback of 2 cascaded biquads with Q | **No** (single 12 dB biquad) | Minimoog, 303 character, acid squelch |
| State-variable / band / notch / comb | Biquad and comb via a `DelayNode` with feedback | Partly | Comb is needed for Karplus-like plucks, flanger and metallic hits |
| Envelopes (ADSR, multi-stage, exponential) | `AudioParam` automation helpers | Yes (`envGain`) | Add AD/AR/ADSR-H, curve shapes, retrigger and legato |
| LFO (tempo-synced) | `OscillatorNode` → gain → param, with sync from song BPM | Partly (free-running only) | Wobble at 1/4, 1/8, 1/8T or 1/16 synced to BPM, plus sample-and-hold |
| Pitch envelope | Frequency automation | Yes (kick, 808, tom) | — |
| Glide / portamento | Frequency ramps | Yes (`applyGlide`) | Slide only on tied notes (303), constant-time glide |
| Formant filter | Bandpass bank | Yes (`voice`, `choir`) | Vowel morphing over time, for vocal chops and talkbox |

### 5.2 Patch archetypes (the taxonomy you supplied, plus what the 200 genres need)

| Category | Archetype | Built from | Today | Main styles |
|---|---|---|---|---|
| Bass | Sub | Sine (+2nd harmonic), clean | Yes | Nearly all electronic |
| Bass | Reese | 2–4 detuned saws, slow phase drift, LP filter, optional chorus and comb | Partly (2 saws) | DnB, jungle, bass house, darkstep, UKG |
| Bass | Wobble | Saw/square or wavetable → LP or formant filter with a tempo-synced LFO (1/4 to 1/16T), plus drive | **No** | Dubstep, brostep, riddim, jump-up |
| Bass | Growl / talking bass | Wavetable or FM + formant filter + LFO + distortion | **No** | Brostep, neurofunk, riddim, complextro |
| Bass | Donk | Short pitched square/organ with a fast pitch drop and bandpass "bounce" on the offbeat | **No** | Hard house, bassline, UK bounce, scouse |
| Bass | Acid | Saw/square → resonant ladder filter with env-mod, accent and slide | Partly (12 dB biquad, no accent or slide logic) | Acid house, acid techno, acid trance, goa |
| Bass | 808 glide | Sine with pitch-env punch, saturation and pitch glides between overlapping notes | Partly | Trap, drill, phonk, future bass, footwork |
| Bass | FM bass | 2–4 op FM, fast index decay | Partly | Synthwave, deep house, future garage, city pop |
| Bass | Rolling psy bass | Short saw/FM bass, 3 notes per beat after the kick (kick-bass-bass-bass), tight envelope | **No** (rhythm and voice) | All psytrance |
| Bass | Octave bass | Saw/square alternating root and octave in 8ths | **No** (rhythm) | Disco, nu-disco, italo, eurodance, hi-NRG |
| Bass | Log drum | Sine/triangle with pitch drop, bandpass "wood" body, saturation and short decay, played melodically with slides | **No** | Amapiano, private school piano |
| Bass | Hoover bass | Alpha Juno-style PWM saw stack with pitch-bend dive and chorus | **No** | Hardcore, gabber, techstep, hard trance |
| Bass | Upright, finger, pick, slap | Karplus-Strong + body EQ; slap adds a thumb transient and pop | Partly (no slap) | Jazz, funk, rock, folk, disco |
| Lead | Supersaw | 7 saws (JP-8000 detune curve) + mix control + HPF + chorus | Partly (5 saws, fixed detune) | Trance, big room, hardstyle, future bass, eurodance |
| Lead | Pluck | Saw/square through a fast filter envelope; optional Karplus-Strong | Yes | House, trance, future bass, tropical |
| Lead | Chord stab | Short polyphonic hit (organ, M1 piano, rave stab, dub stab) | Partly (stab rhythm exists, no dedicated voices) | House, rave, dub techno, hardcore, garage |
| Lead | Key | Piano, Rhodes, Wurlitzer, DX7 E.piano, clav, organ | Partly | Lo-fi, house, R&B, jazz, funk |
| Lead | Hoover lead | Same as hoover bass, higher register | **No** | Hardcore, gabber, rave |
| Lead | Screech | Distorted saw/FM through resonant filter with pitch automation | **No** | Hardstyle, rawstyle, neurofunk |
| Lead | Chip lead and arps | Pulse 12.5/25/50% + triangle + noise channels, fast arpeggios (1/32 or per-frame), vibrato tables | **No** | Chiptune, hyperpop, video game |
| Lead | Vocal chop | Formant voice with vowel morph, pitch quantization, chopping rhythm and glitch repeats | Partly (static formant voice) | Future bass, UKG, footwork, house, hyperpop |
| Lead | Talkbox / vocoder | Formant filter bank driven by vowel sequence on a saw source | **No** | G-funk, electro, French house, italo |
| Lead | Brass, sax, strings, flute | Existing subtractive voices; add breath noise and section detune | Partly | Jazz, funk, cinematic, electro swing |
| Atmos | Pad | Detuned saws/PWM → LP + chorus; slow attack | Yes (saws only) | Everything |
| Atmos | Gated pad / trance gate | Pad × 16th-note gain pattern (trance gate) | **No** | Trance, psy, progressive house |
| Atmos | Drone | Stacked saws/sines with slow filter LFO; brown noise layer | Yes | Ambient, drone, dark ambient |
| Atmos | Granular cloud | Granular source over pad and noise buffers | **No** | Ambient, IDM, psybient |
| FX | Riser / downlifter | Pink-noise bandpass sweep, pitch sweep up/down, reverse-reverb swell | Partly (riser only) | All club forms |
| FX | Impact / boom | Sine drop + noise | Yes | Cinematic, EDM |
| FX | Laser / zap / siren | Fast pitch envelope; dub siren LFO | **No** | Dub, reggae, psy, dubstep |
| Perc | Pitched percussion | Marimba, kalimba, steel pan, vibraphone, tuned cowbell, agogo (modal synthesis: sum of inharmonic sine partials with per-partial decay) | Partly (one triangle "perc") | Afro house, tropical, amapiano, latin, gamelan-tinged IDM |
| Perc | Hand drums | Conga, bongo, djembe, timbale, tabla, darbuka (pitched membrane: sine + pitch drop + bandpass noise slap, tone/slap/mute strokes) | **No** | Latin, afro, house, world |
| Perc | Small perc | Cowbell, claves, woodblock, tambourine, guiro, snaps, shaker variants | Partly (shaker, rim) | Most families |

## 6. Gear models: authentic synthesized sounds, no samples

### 6.1 What a gear model is

A gear model is a **sound engine**: a function that, given a note event and the model's parameters, builds a Web Audio node graph reproducing the instrument's *architecture*. Examples:

- 808 kick: a bridged-T resonator with pitch drop, decay knob and tone.
- 303: one oscillator into a 4-pole filter with env-mod, accent and constant-time slide.

It is not a recording, and no audio files ship.

```ts
type GearRole = "drums" | "bass" | "keys" | "pad" | "lead" | "perc" | "fx" | "kitchar";

type GearModel = {
  id: GearId;                       // "tr808", "tb303", "juno106", ...
  name: string;                     // real product name, e.g. "Roland TR-808" (approved naming)
  maker?: string;                   // "Roland" (descriptive only)
  roles: GearRole[];
  archetypes: ArchetypeId[];        // which patch archetypes it can realize (e.g. tb303 → acid bass, acid lead)
  voices?: DrumVoiceId[];           // for drum machines: which voices it has (808 has cowbell + clave, no ride)
  params: Record<string, ParamSpec>; // engine knobs with defaults and ranges (decay, tone, accent, detune, chorus mode...)
  authentic: string[];              // "what makes it sound like the real thing", shown in the breakdown
  cost: { nodesPerVoice: number; maxPoly: number }; // for the CPU budget
  insert?: FxModelId[];             // insert FX that belong to the instrument (Juno chorus, Leslie)
  play(v: VoiceCtx, ev: NoteEvent, when: number, beatSec: number, out: AudioNode): void;
};
```

How it plugs in:

- **Resolution order** for each part (drums, bass, harmony, lead, FX): user lock in the breakdown, then the style's default gear for that role (weighted list), then the archetype's generic engine (today's voices refactored onto the primitives).
- **Events carry gear.** `NoteEvent` gains `gear?: GearId` and `p?: Partial<params>` (for example a 303 accent or slide flag, or Leslie speed). `playEvent` dispatches to `GEAR[ev.gear].play` when set, else to the archetype engine.
- **Insert FX are per stem and per song.** `buildGraph` in `render.ts` reads `song.arrangement.gear` and inserts the model's FX: Juno chorus on harmony, Leslie on the organ, Space Echo on a send. The same graph runs live and offline, so playback and export stay identical.
- **Archetype vs gear.** "Acid bass" is the archetype. The TB-303 model is the default engine for it, and an SH-101 or MC-202 model could be alternatives. Choosing a different gear for the same archetype changes the tone but not the musical part.
- **Determinism.** All randomness (detune drift, analog "slop", grain positions, tape wow) comes from a seeded RNG keyed on song seed + event index, never `Math.random`. The existing noise buffers are already seeded. The same song state renders the same samples on every run, which render-check asserts.

### 6.2 Authenticity notes per model (first tiers)

Values marked "≈" are design targets to verify with the gear-check harness (section 11.3). Sources and the facts to confirm for each model are tracked in [`docs/gear-references.md`](gear-references.md).

| Model | Engine design | What makes it authentic |
|---|---|---|
| **TR-808 style** | Kick: sine resonator with exponential pitch drop and long decay (tunable). Snare: two tuned sines (≈ 180/330 Hz) + highpassed noise with "snappy" mix. Hats/cymbal: 6 square oscillators at ≈ 205.3, 304.4, 369.6, 522.7, 540, 800 Hz, summed → two bandpasses (≈ 7 kHz and 10 kHz) → VCA (closed/open decays). Cowbell: two squares at ≈ 540 and 800 Hz → bandpass + 2-stage decay. Clap: 3–4 noise bursts then reverb tail. Also clave, rim, toms, congas. | Pure-sine boom with an adjustable tail; metallic, not noisy, hats from the 6-oscillator bank; the 2-square cowbell |
| **TR-909 style** | Kick: triangle-ish VCO with fast pitch envelope + noise/click "attack" + saturation. Snare: two tuned oscillators + noise with tone/snappy. Claps: noise bursts. **Hats and cymbals on the real 909 are 6-bit samples**, so they're synthesized here as a metallic oscillator bank + noise, run through a 6-bit quantizer and lowpass to mimic that grit. | Punchy, short-pitch kick with click; gritty, lo-bit hats; snappy snare |
| **TB-303 style** | Saw or square VCO → 4-pole low-pass (worklet ladder, 18–24 dB character) → VCA. Env-mod and decay knobs; **accent** raises filter and VCA and shortens decay; **slide** = constant ≈ 60 ms glide only between tied notes; tuned for the "squelch" resonance. | Accent and slide behavior, filter resonance that whistles without self-oscillating, square-wave hollowness |
| **Juno-106 style** | One DCO (saw + pulse with PWM + sub square + noise) → 24 dB filter → VCA, **chorus I (≈ 0.5 Hz) and II (≈ 0.8 Hz)** as a stereo BBD-style modulated delay with its characteristic noise. | The chorus is the sound; one stable DCO (not detuned stacks); PWM strings |
| **JP-8000 supersaw style** | 7 saws with the JP's non-linear detune curve and "mix" (centre vs sides), HPF tied to pitch, optional chorus | Wide but not phasey; trance-lead brightness |
| **DX7 style** | 6-operator FM with selectable algorithms (e.g. 5 for E.piano, 32-op bell stacks), per-operator rate/level envelopes, velocity → mod index. Presets modeled after the famous E.piano, bell, bass and brass patches (re-created from FM principles, not ROM data). | Glassy tine attack fading to sine; velocity changes timbre more than volume |
| **Minimoog style** | 3 VCOs (saw/tri/square, detune, octave), noise, 24 dB ladder with drive, filter contour, glide | Fat bass, warm filter overdrive, glide leads (funk, G-funk, prog) |
| **Rhodes style** | Tine + tonebar modal model: sine fundamental + inharmonic tine partials, velocity-dependent "bark" (soft saturation), pickup asymmetry, stereo tremolo (suitcase) | Bell-like attack, bark when hit hard, tremolo pan |
| **Hammond + Leslie style** | 9 drawbars as additive sines (16', 5⅓', 8', 4', 2⅔', 2', 1⅗', 1⅓', 1'), percussion (2nd/3rd harmonic, fast decay), key click, tube drive. **Leslie**: split crossover → horn (doppler via modulated `DelayNode` + AM, ≈ 0.8 Hz slow / ≈ 6.7 Hz fast) and drum rotor (slower), ramp-up time between speeds | Drawbar registrations, percussion click, the Leslie speed-up |
| **Space Echo style** | Tape delay: feedback loop through `DelayNode` with wow/flutter LFO on delay time, high/low loss filter and saturation in the loop, "repeat rate" in head combinations, spring reverb send | Darkening, wobbling repeats that run away when feedback is high (dub) |
| **Plate / spring / gated** | Generated impulse responses: plate (dense, bright, fast build), spring (dispersive chirp "boing" with drip), gated (big room IR × hard gate at ≈ 250–350 ms) | Spring "drip" on snares (surf, dub); 80s gated snare |
| **SP-1200 / MPC character** | Not a sound source but a "kit character": 12-bit quantization at ≈ 26 kHz (SP-1200) or 16-bit with swing timing (MPC 50–75%), low-pass, slight saturation | Crunchy hip-hop and jungle drums; MPC swing |
| **Alpha Juno "hoover"** | Stacked PWM saws with chorus and a downward pitch bend on attack (the "What the" patch idea re-created by synthesis) | The dive-bomb attack and buzzy width |
| **Chip (NES / SID / Game Boy)** | NES: 2 pulse channels (12.5/25/50/75%), triangle (4-bit stepped), noise (LFSR short/long); SID: 3 osc with ring/sync + multimode filter; per-frame (≈ 60 Hz) arpeggios and vibrato tables | Stepped triangle bass, LFSR noise drums, fast arpeggiated chords |
| **Log drum (amapiano)** | Sine/triangle body with fast pitch drop, bandpass wood resonance, saturation, glides between notes | The tuned "thud" playing the bass line |
| **Hardstyle kick chain** | Punchy kick + distorted tail (pitch-tracked tonal "tok") via waveshaper chain and EQ, played as kick + bass in one; reverse-bass offbeat variant | The distorted tonal kick that carries the key |

### 6.3 Gear priority (how many of the 200 styles each model serves)

These counts are estimated from the genre map in Appendix A. The exact counts will be generated from the style-to-gear table once it's authored (a script prints coverage per model).

| Tier | Model | ≈ Styles served | Why |
|---|---|---|---|
| 1 | TR-909 style | 70 | House, techno, trance, psy, hard dance, eurodance |
| 1 | Analog poly pad (Juno-106 / Prophet-5 style) | 65 | Pads and stabs in most electronic and pop |
| 1 | Plate + hall reverb models | 120 | Every family |
| 1 | TR-808 style | 45 | Trap, hip hop, electro, Miami bass, footwork, reggaeton, R&B, phonk |
| 1 | Supersaw (JP-8000 style) | 30 | Trance, big room, future bass, hardstyle, eurodance |
| 1 | DX7 style (EP, bell, FM bass) | 35 | Synthwave, city pop, R&B, lo-fi, garage, house |
| 1 | Rhodes style | 30 | Lo-fi, neo-soul, jazz, deep house, liquid DnB |
| 1 | Minimoog style | 25 | Funk, G-funk, disco, synthwave, prog, psy bass |
| 1 | TB-303 style | 15 | Acid house, acid techno, acid trance, goa, electro |
| 1 | Space Echo + spring | 25 | Dub, reggae, dub techno, trip hop, surf, psydub |
| 2 | Hand percussion models | 30 | Latin, afro, house, tropical, amapiano |
| 2 | Reese (CZ-style) | 18 | DnB, bass house, UKG |
| 2 | Wavetable growl/wobble | 14 | Dubstep family, neuro, complextro |
| 2 | Hammond + Leslie | 20 | Gospel, soul, blues, rock, jazz, garage house |
| 2 | LinnDrum / DMX / TR-707 style | 18 | Synthwave, 80s pop, italo, hi-NRG, darkwave |
| 2 | SP-1200 / MPC character | 22 | Boom bap, lo-fi, jungle, trip hop |
| 2 | Formant vocal-chop and talkbox | 25 | Future bass, UKG, footwork, G-funk, hyperpop |
| 2 | Hardstyle kick chain | 12 | Hard dance, hard techno, industrial |
| 2 | Alpha Juno hoover | 10 | Hardcore, gabber, techstep, hard trance |
| 2 | Korg M1 style (organ bass, house piano) | 10 | Garage house, eurodance, 90s house |
| 3 | Chip (NES/SID/Game Boy) | 6 | Chiptune, hyperpop, video game |
| 3 | Log drum | 3 | Amapiano (must-have from your list) |
| 3 | Clavinet, Wurlitzer, Mellotron | 15 | Funk, soul, psych rock |
| 3 | Guitar amp models (clean Twin, Marshall crunch, fuzz, metal hi-gain) | 30 | Rock, metal, punk, country, surf |
| 3 | Brass and sax section, orchestral strings, timpani | 20 | Jazz, funk, ska, cinematic |
| 3 | World instruments (sitar, tabla, oud, darbuka, steel pan, accordion, nylon guitar) | 12 | Latin, world, Caribbean |

### 6.4 Style-to-gear defaults

Each style lists weighted defaults per role, for example:

- Acid techno: drums `tr909` (0.7) or `tr808`; bass `tb303`; pad `juno106`; FX `spaceEcho` (0.3).
- Dub techno: drums `tr909` with soft kick; chords `prophet5` dub stab; FX `spaceEcho` (always) + `spring`.

Weights are drawn with the song's seeded RNG, so a song is reproducible and a reroll can pick the alternative. Gear the user picks in the breakdown is stored as a lock and wins over the defaults.

### 6.5 CPU budget

- **Measure first.** Phase 1 adds a benchmark: offline render speed (× realtime) per model at fixed polyphony, in Node and in Chrome. Targets: offline export ≥ 4× realtime on a desktop, ≥ 1.5× on a mid-range phone; live playback under 50% of the audio thread on that phone.
- **Per-model cost.** Each model declares its nodes per voice and maximum polyphony (supersaw chords and 808 hats are the expensive ones). The composer caps polyphony per stem and steals the oldest voices, so the same events play live and offline.
- **Shared nodes.** Per-voice node counts stay low by sharing what can be shared per stem: one Juno chorus, one Leslie and one tape echo per stem, not per note. LFOs for synced wobble are shared per stem too.
- **Quality tier (approved).** On weak devices, live playback may use a lighter tier, for example 5 saws instead of 7 or a biquad filter instead of the worklet ladder. Export always uses full quality.
  - It turns on automatically when a short offline benchmark at startup shows the device can't keep up, and a setting can override it ("Playback quality: Auto / Full / Light").
  - This is the only case where live playback may differ from export, and the settings screen says so.

### 6.6 AudioWorklet

The ladder filter, 303 filter, hard sync, true PWM and wavefolder are much better as AudioWorklet processors. Phase 1 has to confirm three things:

1. Worklets run in Chrome's live and offline contexts.
2. They run in Safari and iOS, including the installed PWA.
3. They run in `node-web-audio-api`, which the test scripts use. Support exists in recent versions but must be checked against the installed one.

Every worklet model gets a pure-node fallback (cascaded biquads and so on) for environments where it isn't available. Determinism holds because worklet code is plain JS with seeded state.

## 7. Style recipes

### 7.1 Data model

```ts
type StyleRecipe = {
  id: StyleId; label: string; family: FamilyId;
  extends?: StyleId;                 // inherit and override (e.g. deepHouse extends house)
  aliases: string[];                 // prompt words; longest match wins ("deep house" before "house")
  blurb: string;                     // one plain-English line for the picker
  tempo: [number, number]; halfTimeFeel?: boolean; meters: MeterWeights; feel: FeelSpec; // swing amount and grid
  drums: { gear: Weighted<GearId>; patterns: PatternRef[]; fills: FillRef[]; perc?: PatternRef[]; level: number };
  bass:  { archetypes: Weighted<ArchetypeId>; gear?: Weighted<GearId>; lines: Weighted<BassLineId>; octave: number };
  harmony: { archetypes: Weighted<ArchetypeId>; gear?: Weighted<GearId>; rhythms: Weighted<HarmonyRhythmId>; colors: ChordColorId[];
             progressions: { major: Roman[][]; minor: Roman[][] }; barsPerChord: number; modes: Weighted<ModeId> };
  lead:  { archetypes: Weighted<ArchetypeId>; gear?: Weighted<GearId>; style: MelodyStyle; density: number; scale: ScaleId };
  form: FormFamilyId; moves: SectionMoveId[];   // what happens in builds, drops, breakdowns, solos
  fx: { reverb: Weighted<FxModelId>; delay?: Weighted<FxModelId>; pump?: number; tape?: number; crush?: number; inserts?: FxModelId[] };
  textures: TextureId[]; dims: DimensionDefaults; energy: number; rootPrefs?: number[];
  signature: SignatureCheck[];       // machine-checkable "must have" list for the style-check harness and the breakdown checklist
  forbid?: SignatureCheck[];         // e.g. "no four-on-the-floor" for UKG, "no drums" for drone
  fusion?: { partners: StyleId[]; tempoMode: "same" | "half" | "double" | "any" };
  gearNotes?: string[];              // "Juno chords + 909 hats" style production notes for the explainer
};
```

The existing `GenreProfile` maps one-to-one onto this. The 15 current genres become the root styles of their families with the same ids, so `house` stays `house`.

### 7.2 Families (24)

These come from the genre map:

- **Electronic (11):** House; Techno; Trance; Psytrance; Drum & Bass; Dubstep & UK Bass; Breaks & Electro; Hard Dance; Synth, Retro & Dark; Downtempo, Chill & Lo-fi; Ambient & Experimental.
- **Other (13):** Hip Hop; Pop; R&B, Soul & Funk; Rock; Punk & Metal; Blues; Jazz; Country & Folk; Latin; Caribbean; African; World; Cinematic & Classical.

### 7.3 Drum patterns and fills

`DrumPattern` (16-step strings) stays, extended in five ways:

- **Named patterns** with ids and labels, so they can appear in the breakdown. Examples: "Four on the floor", "2-step", "Amen-style break", "One drop", "Dembow", "Jersey club bounce", "Footwork triplets", "Half-time", "D-beat", "Blast beat", "Bossa".
- **Pattern sets per section**: intro, verse, groove, drop, breakdown and fill variants per style instead of one global pair.
- **More voices**: cowbell, conga hi/lo, bongo, timbale, tambourine, claves, woodblock, guiro, snap, agogo, metal perc, kick tail (hardstyle), and "reverse bass" offbeat.
- **Variable step grids**: 12 and 24 steps for triplet styles (footwork, shuffle, 6/8 afro), 32 for blast beats and hi-tech. Tempo up to 220.
- **Fills library**: snare roll builds, tom fills, break edits, 808 hat rolls (1/32, 1/16T), reverse cymbals.

### 7.4 Bass line styles to add

Octave (disco), rubber 16th (tech house), psy roll (kick-bass-bass-bass), wobble rhythm (synced LFO pattern), dembow, tumbao (salsa anticipation), one-drop riddim, 2-step skippy, log-drum melody, metal chug (palm-muted, kick-locked), punk 8ths, funk 16th slap, boogie, garage "warp", donk offbeat, hoover dive, Reese sustain with movement, and 808 glide phrasing (drill sliding).

### 7.5 Song forms per family

These replace the single nine-section template.

| Form id | Sections | Used by |
|---|---|---|
| Club | Intro (DJ-friendly drums) ▸ Groove A ▸ Build ▸ Drop ▸ Breakdown ▸ Build ▸ Drop 2 ▸ Outro (drums) | House, trance, big room, eurodance |
| DJ tool | Intro ▸ layers added every 8/16 bars ▸ Peak ▸ Break (filter/delay) ▸ Peak 2 ▸ layers removed ▸ Outro. No "chorus" | Techno, minimal, dub techno, hardgroove |
| Psy | Long intro ▸ Groove ▸ Break with FX ▸ Main theme ▸ Breakdown (ambient, spoken-word slot) ▸ Peak ▸ Outro | Psytrance family |
| Bass | Intro ▸ Build ▸ Drop 1 ▸ Break ▸ Build ▸ **Switch-up** Drop 2 (new bass) ▸ Outro | Dubstep, DnB, bass house, future bass |
| Hard | Intro ▸ Break (melody) ▸ Climax (anti-climax variant for rawstyle) ▸ Mid-intro ▸ Break ▸ Final climax ▸ Outro | Hardstyle, hardcore, gabber |
| Pop | Intro ▸ Verse ▸ Pre-chorus ▸ Chorus ▸ Verse ▸ Pre ▸ Chorus ▸ Bridge ▸ Final chorus ▸ Outro | Pop, K-pop, R&B, synthpop, hyperpop |
| Hip hop | Intro ▸ Verse (16) ▸ Hook (8) ▸ Verse (16) ▸ Hook ▸ Bridge/beat switch ▸ Hook ▸ Outro | Hip hop, trap, drill, phonk, lo-fi |
| Rock | Intro riff ▸ Verse ▸ Chorus ▸ Verse ▸ Chorus ▸ Solo ▸ Chorus ▸ Outro (big ending) | Rock, punk, metal, country rock |
| Jazz | Intro ▸ Head ▸ Solos (lead, then keys) ▸ Trading 4s ▸ Head ▸ Tag ending | Jazz, bossa, bebop, swing |
| Blues 12 | Intro ▸ 12-bar choruses (vocal, solo, vocal) ▸ Turnaround ending | Blues family |
| Folk | Intro ▸ Verse ▸ Chorus/refrain ▸ Verse ▸ Instrumental break ▸ Verse ▸ Chorus ▸ Outro. No builds or drops | Folk, bluegrass, country, celtic |
| Ambient | Slowly evolving layers, no hooks; crossfades between "scenes" | Ambient, drone, new age |
| Score | Intro ▸ Theme A ▸ Build ▸ Climax ▸ Resolution | Cinematic family |
| Reggae | Intro ▸ Verse ▸ Chorus ▸ Verse ▸ Chorus ▸ **Dub section** (drop-outs, echoes) ▸ Outro | Reggae, dub, dancehall, ska |
| Latin | Intro ▸ Verse ▸ Coro ▸ **Montuno** ▸ **Mambo** (horn break) ▸ Coro ▸ Ending | Salsa, latin jazz; reggaeton uses Pop |
| Downtempo | Intro ▸ A ▸ B ▸ A ▸ Breakdown ▸ A ▸ Outro (gentle) | Trip hop, downtempo, chillout |

Section moves become per-style data instead of being hardcoded per section type. Examples: snare-roll build, filter sweep, kick drop, "anti-climax", dub echo throw, beat switch, key change up (pop), drop-tune (riddim), trading fours (jazz), gated pad breakdown (trance).

### 7.6 Fusion and Go wild

`EDM_IDS` becomes "any style" with compatibility rules. Partners are tempo-compatible when they're the same tempo, half or double; for example, 140 dubstep fuses with 70 trip hop. Each fusion picks roles: drums from one style, harmony from the other, lead from either.

Go wild picks a partner from a "works well" list or an "unexpected" list. The label always names both, for example "Bossa Nova × Liquid Funk". The `EDM` table stays as the alias source for old saved songs.

## 8. Prompt parsing

- **One alias index** is generated from every style's `aliases`. Multi-word aliases are matched first and the longest match wins ("deep house" over "house", "electro swing" over "electro", "future bass" over "bass").
- **Scoped words.** Words like "dark", "hard" and "minimal" act as style words only when they appear next to a style name, as in "minimal techno" vs. "minimal piano".
- **Negation**: "not trap" and "no 808s" become avoid rules (the avoid system already exists).
- **Fuzzy matching**: "psytrace", "drum n bass", "drumnbass", "dnb", "d&b" and "amapiano" with typos all resolve. Below a confidence threshold, the "What I heard" panel shows "Did you mean…?" chips instead of falling back silently.
- **Era, scene and mood words** stay in `SCENE_LEX` and `MOOD_LEX`, but genre words move out of them. For example, "warehouse" stays a scene word that leans toward techno instead of forcing it.
- **The random fallback** stays only for prompts with no style words at all, and the UI says so (it already shows a notice).
- **Tempo clamp** moves to 50–220 BPM, and halftime styles report "140 (half-time feel)".
- **Tests**: a parser suite of about 400 prompts with expected styles (section 11.2).

## 9. Producer breakdown: covering every genre

### 9.1 Where it lives today

| Piece | File | What it does now |
|---|---|---|
| Card builder | `src/lib/music/describe.ts` → `breakdownCard()` | Items: Fusion (chips from `EDM_IDS`), BPM/key/mode, Meter & rhythmic logic, Harmonic logic, Form, Drum & bass design (chips from `KIT_LABELS`, `BASS_LABELS`, 6 bass styles), Lead & chord approach (`LEAD_LABELS`, `HARMONY_LABELS`), FX chain, Ending, Gear ("flavor only", no options), Vocal/lyric theme |
| Song identity | `describe.ts` → `identityCard()` | The Genre item is "Pure" plus `EDM_IDS` chips; palette, groove, opening, development, hook, mix, vocal, avoid |
| Rendering | `src/components/SoundCanvas.tsx` | The breakdown section only shows **when Go wild is on** (`wild && bdCard.length`); the Identity card always shows |
| Rows and sheet | `src/components/ui.tsx` → `CardRows`, `OptionSheet` | The sheet shows every option as wrapping chips, plus "Keep this, reroll the rest" and Unlock |
| Blend picker | `src/components/UnderstoodPanel.tsx` | Genre chips plus a `<select>` over `GENRE_IDS`; kit/bass/harmony/lead selects over the label tables |
| Groove/Harmony panels | `src/components/StylePanels.tsx` | Groove and harmony controls |
| Section strip | `src/components/SectionStrip.tsx` | Section labels from the composer |
| Copy as prompt | `describe.ts` → `stylePrompt()`, `timelinePrompt()` | Prints the gear as "flavor only" |

### 9.2 What changes, item by item

**Data contract (`describe.ts`)**

`CardItem` gains:

```ts
groups?: { id: string; title: string; options: ChipOption[] }[];  // grouped option lists
picker?: "style" | "gear";                                         // open a dedicated picker instead of chips
explain?: { title: string; lines: string[]; checklist?: { label: string; present: boolean }[] };
```

`ChipOption.plain` is filled for every style, gear model, pattern and archetype from the registries, so every chip has a one-line explanation.

**Items, one by one**

| Item | Change |
|---|---|
| Genre (Identity) and Fusion (Breakdown) | Open the new **StylePicker** (section 9.3). The value shows the style actually used plus "× partner" for fusions. The detail shows the family and tempo range |
| New: **Style recipe** | An explainer for the current style: tempo range, groove, drum signature (mini step grid), bass, signature sounds, production moves, structure. Includes an **"In this take" checklist** with a mark for each signature element the composer actually produced, read from the same signature checks the test harness uses. This makes the "is it really that genre?" question visible |
| BPM / key / mode | Shows the style's tempo range with "inside range" or "outside range". Adds half-time and double-time toggles. Clamp becomes 50–220. Modes the style uses are listed first |
| Meter & rhythmic logic | Style-legal meters first, others under "Unusual for this style". Tricks are grouped by the existing `TRICKS` groups |
| Harmonic logic | The style's own progressions first (named, e.g. "Amapiano jazzy ii–V"), then the generic list. Chord colors grouped |
| Form | Shows the family form template and the actual section list. Options: the form templates valid for the family, then the variants (slow burn, hook first). Section names follow the family (Head/Solos, Montuno/Mambo, Drop 2/Switch-up, Dub section) |
| Drum & bass design | Grouped: **Drum machine/kit** (gear), **Pattern** (the style's named patterns, then others), **Fills**, **Bass sound** (archetype), **Bass gear**, **Bass line** (all line styles with plain text) |
| Lead & chord approach | Grouped: Lead sound (archetype), Lead gear, Chord sound, Chord gear, **Chord rhythm** (stabs, skank, montuno, trance gate, strum and so on) |
| FX chain | Gear FX models (Space Echo, spring, plate, hall, gated, Juno chorus, Leslie speed, phaser, tape, SP-1200 crunch, bitcrush), grouped by Reverb, Delay, Modulation, Character |
| **Gear** | Becomes real and editable. One row per role (drums, bass, chords, lead, FX) with the current model and its "what makes it authentic" notes. Swapping opens the **GearPicker**: models valid for that role, grouped "Authentic for this style" vs "Other". The "flavor only" text and the matching line in `OptionSheet` are removed. Picking gear sets a lock and re-renders, and the sound changes |
| Ending, Vocal/lyric theme | Ending options filtered by family (fade for club, big ending for rock, tag for jazz, ritard for folk) |
| Copy as prompt | Uses the style label, form template and real gear; drops "flavor only" |

**Where the breakdown appears (approved)**

Today the breakdown only shows in Go wild. It will be shown for every song, collapsed under the Song identity card and open by default in Go wild, so gear and style editing is always reachable.

### 9.3 New components and design

**`StylePicker`** (bottom sheet on phones, dialog on desktop):

- **Header**: a sticky search box using the same alias index as the parser, so "dnb", "d&b" and "drum n bass" all find Drum & Bass. Below it, family chips in a horizontally scrolling row (House, Techno, Trance, Psy, DnB, Bass, …).
- **Body**:
  - Default view: "Recent", then "Related to the current style" (same family and fusion partners), then the families as collapsible sections.
  - Each row is 44 px or taller: name, tempo range, and a one-line signature ("2-step, shuffled hats, organ stabs").
- **Row actions**: Use, Blend in (the "+ blend style" replacement), and Fuse (Go wild partner).
- **Layout and performance**:
  - Phone: full height (`max-h-[92dvh]`), virtualization not required for about 200 rows. Desktop: families in a left column, list on the right.
  - Long lists use `content-visibility: auto`.
- **Accessibility**: a list with headings and keyboard navigation (arrow keys, Enter, Esc). Focus returns to the row that opened the picker.

**`GearPicker`**: the same shell, filtered by role. Each row shows the model name, role and its "authentic" notes. A preview button plays a 1-bar audition rendered offline, cached by song seed.

**`OptionSheet` upgrade**: renders `groups` with headings. A search filter appears when there are more than 24 options. The chip area scrolls inside a sticky header.

**`PatternGrid`** (small): a read-only 16/12/24-step grid for kick, snare, hats and perc, shown in the Style recipe explainer and the Drum design sheet.

**`UnderstoodPanel`**: the genre chips show style labels and the "+ blend style" select becomes a button that opens the StylePicker. The kit, bass, chord and lead selects become grouped selects fed from archetypes and gear.

**`SectionStrip`**: family-specific labels; colors by section role, not by name.

### 9.4 Labels for new sounds

Every new kit, gear model, archetype, drum voice, pattern, bass line, chord rhythm and form gets a `label` and a `plain` sentence in its registry. The describe layer never hardcodes labels again; `KIT_LABELS`, `BASS_LABELS` and the others become derived views over the registries for compatibility.

## 10. Saved songs and project files

What's stored today: `SongState { prompt, edits, locks, wild, variation, dimensions, tracks }` in IndexedDB, plus the draft session in localStorage and project files (format `music-studio-project` v1). `edits` and `locks` contain `genres: { id: GenreId }`, `style.edm: EdmId`, `style.substyle`, and `instruments.kit|bass|harmony|lead` enum strings.

The plan:

1. **No id ever disappears.** The 15 `GenreId`s remain valid style ids. Every `EdmId` maps to a style id through an alias table, for example `ukg` → `ukGarage` and `halftime` → `halftimeDnb`. Old kit, bass, harmony and lead enum values remain valid archetype ids.
2. **A `migrateEdits()` step** runs inside `normalizeSongState()` and session restore. It maps old ids to new ones and moves `style.edm` to `fusion`. Unknown ids are dropped with a visible notice rather than crashing.
3. **Engine version.** `SongState` gains `engine: number` (missing means 1). A song's sound depends on recipes and voices, so an old song would sound different after this work.
   - Approved: old songs open with the legacy recipe and voice path (the current tables, frozen as `legacy/` data plus the current generic voices), so they sound as they did.
   - An **"Upgrade"** button re-renders a song with the new recipes and gear and sets `engine: 2`. Undo restores engine 1.
   - New songs are engine 2 from the phase that first changes sound. Phase 0 is sound-identical, so it records `engine: 1`.
4. **Project files** stay format version 1 with new optional fields, so old files import and new files remain readable by the tolerant reader.
5. **Fixtures captured before any change (phase 0).** About 30 saved songs and 2 project files from the current build, plus their render hashes. Tests load them in every later phase.

## 11. Testing and verification

### 11.1 Style conformance harness (`scripts/style-check.ts`)

- Coverage: every style × 4 variations × 2 dimension presets.
- Assertions: tempo, meter, feel, signature checks (kick grid, snare position, pattern id, bass line id, archetypes, gear), form family, label honesty and forbidden elements.
- Output: a table plus a JSON snapshot. The run fails on regressions.
- It replaces and extends `_genre-survey.ts`, `form-survey.ts` and `arrangement-check.ts`.

### 11.2 Parser suite (`scripts/parse-check.ts`)

About 400 prompts with expected styles. Coverage:

- Every alias.
- Overlaps such as deep house vs house, electro vs electro swing, trap vs future bass, "dark techno warehouse at 3am".
- Typos and negations.

It also checks that the fallback rate on genre prompts is zero.

### 11.3 Gear and archetype checks (`scripts/gear-check.ts`, node-web-audio-api)

Each model renders single hits and notes offline, then the script measures:

- **Spectra** (FFT peaks):
  - 808 hats show the 6-oscillator cluster and the 808 cowbell its two partials.
  - The supersaw spread matches the detune table.
  - The Hammond drawbar harmonics are at the right ratios.
- **Envelopes and pitch**:
  - Attack and decay times within tolerance.
  - The 808/909 kick pitch drop curve.
  - 303 slide time ≈ 60 ms, only on tied notes; the accent raises filter cutoff and level.
  - Leslie and Juno chorus modulation rates.
- **Safety**: no NaN, no DC offset, peak under 0 dBFS, no denormal tails, deterministic hash for each model.
- **Cost**: render speed per model.

### 11.4 Listening A/B (`scripts/ab-renders.ts`)

This writes WAVs to `renders/ab/` comparing the current generic voice with the new gear model, plus a 30-second demo per style, and a dev-only HTML page to play them side by side. You do the sign-off listening at the end of each content phase.

Optionally, for development only, you can compare against your own reference recordings kept locally. Nothing is shipped or committed.

### 11.5 Existing suites

- `render-check.ts` gets a gear-heavy case per tier.
- `browser-test.mjs` (puppeteer) gets StylePicker search, apply, blend, fuse, gear swap (the render hash must change) and old-song load.
- Mobile screenshots at 375 px for the picker and grouped sheets.
- `tsc` and eslint stay clean.

## 12. Phased plan, with a check after each phase

Sizes are rough (S ≈ a day, M ≈ a few days, L ≈ a week or more of focused work).

| Phase | Work | Check before moving on |
|---|---|---|
| **0. Safety net and registries** (M), **done Oct 6** | Capture fixtures (saved songs, project files, audio fingerprints). Add `StyleRecipe`, family and alias types; port the 15 genres and 17 EDM profiles into the style registry with **identical output**; label honesty fix (no random substyle names); `engine` field and `migrateEdits()`; tempo limits as data. Keep `_genre-survey.ts` as the baseline. | **Passed:** `scripts/golden.ts` shows 290 cases with 0 sound changes and 187 label-only changes; 8 audio renders identical (≤0.0001 dB); tables identical; old and broken saved data loads; tsc, eslint, render-check, library e2e (29/29), session recovery (14/14) and the phone smoke test all pass |
| **0.5 Studio layout and live visuals** (M) | Full-width responsive layout, sticky transport, merged Song card, full section names, grouped option sheet, background fix, keyboard shortcuts (section 15); analyser-based visuals: scopes, spectrum, spectrogram, meters, goniometer (section 16). No audio changes | Golden check still 0 sound changes; e2e, recovery and smoke tests pass; screenshots at 390, 768, 1440 and 1920 px reviewed; visuals cost under 4 ms per frame on desktop and 8 ms on a phone |
| **1. Synthesis primitives** (L) | PWM, sub-oscillator parameter, pink/brown/blue noise, wavetable morph, FM operator graph with algorithms, granular scheduler, ladder filter (worklet + fallback), synced LFOs, envelope library, drive curves; FX: Juno-style chorus, phaser, Leslie, tape echo, IR generators (plate, spring, gated); CPU benchmark harness; worklet support check in Chrome, Safari/iOS and node | Primitive spectral tests pass; benchmark numbers recorded; worklet decision made; existing songs still hash-identical (legacy path untouched) |
| **2. Patch archetypes** (M) | Implement the archetype table in section 5.2 on the primitives (reese, wobble, growl, donk, acid, 808 glide, FM bass, psy roll voice, octave bass, log drum, hoover, supersaw-7, pluck, chord stabs, keys, screech, chip lead/arps, vocal chop, talkbox, gated pad, granular cloud, riser/downlifter, laser/siren, pitched and hand percussion). Refactor today's voices onto the primitives behind the engine-2 flag | Gallery renders and A/B page; gear-check safety checks pass for every archetype; engine-1 songs unchanged |
| **3. Gear models, tier 1** (L) | TR-909, TR-808, Juno-106 (+chorus), Prophet-5, JP-8000 supersaw, DX7 (EP, bell, bass, brass), Minimoog, TB-303, Rhodes, plate/hall/spring/gated reverbs, Space Echo, SP-1200/MPC character. Gear registry, `NoteEvent.gear`, per-stem insert FX in `render.ts`, style-to-gear defaults for existing styles. Sound inspector visuals that read gear parameters: ADSR, filter response, LFO shape, wavetable (section 16). Facts verified against `docs/gear-references.md` | gear-check spectral and envelope targets pass; CPU budget met on desktop and a real phone; **your A/B listening sign-off** |
| **4. Style engine** (L) | Named drum patterns, section pattern sets, fills, new drum voices, 12/24/32-step grids; new bass line styles; new chord rhythms (skank, montuno, trance gate, dub stab); form templates and per-style section moves (section 7.5); tempo 50–220 with half-time awareness; fusion rules | style-check passes for the existing 33 styles under the new engine; form tests per family; jazz/folk/blues no longer get EDM builds |
| **5. Your 50 electronic styles** (L) | Author all 50 (marked ★ in Appendix A) with aliases, patterns, gear defaults, forms and signature checks; deepen trance, psytrance and lo-fi families around them | style-check 100% for the 50; parser suite passes for their aliases; demo pack of 50 × 30 s for **your listening review** |
| **6. Producer breakdown and UI** (L) | StylePicker, GearPicker, grouped `OptionSheet`, Style recipe explainer with "In this take" checklist, PatternGrid, gear row editing, family form display, fusion recommendations, `UnderstoodPanel` and `SectionStrip` updates, copy-as-prompt update, breakdown visibility (per your decision) | Browser e2e passes (search, apply, blend, fuse, gear swap changes the render hash, old song loads); 375 px screenshots reviewed; keyboard and screen-reader pass |
| **7. Rest of electronic (to 130) + gear tier 2** (L) | The remaining electronic styles; hand percussion, Reese, wavetable growl, Hammond + Leslie, LinnDrum/DMX/707, formant chops and talkbox, hardstyle kick chain, Alpha Juno hoover, M1 | style-check for all electronic styles; gear-check tier 2; A/B sign-off |
| **8. Other families (70) + gear tier 3** (L) | Hip hop, pop, R&B/soul/funk, rock, punk/metal, blues, jazz, country/folk, latin, caribbean, african, world, cinematic; guitar amp models, clav/Wurli/Mellotron, brass and sax sections, strings and timpani, world instruments, chip models, log drum polish | style-check for all 200; parser suite full; A/B sign-off per family |
| **9. Polish** (M) | Go wild across all styles, performance tuning, optional live quality tier, legacy-song "Upgrade" flow, docs in the app (style explainer copy review) | All suites green; CPU targets met; fixtures still load; final listening pass |

## 13. Decisions (approved Oct 6, 2026)

1. **Old songs keep their original sound.** Songs saved before engine 2 open on the frozen legacy path and show an **"Upgrade"** button that re-renders them with the new recipes and gear (section 10).
2. **The Producer breakdown is always available**, collapsed under Song identity, and opens by default in Go wild (section 9.2).
3. **A lighter live-playback mode is allowed on weak phones.** Export always renders at full quality (section 6.5).
4. **Gear uses real product names** ("TR-808", "TB-303", "Juno-106"). The sound engines are independent synthesized re-creations, and the gear notes say so.
5. **Indian/Bollywood and Middle Eastern styles stay in the plan** (phase 8, rows 195–196), with sitar, tabla, harmonium, bansuri, oud, darbuka and ney models plus maqam scales.

## 14. Risks

- **The real 909 cymbals and Amen-style breaks are recordings.** They'll be synthesized approximations: very close in character, not identical. The plan says so in the gear notes rather than claiming otherwise.
- **AudioWorklet availability** in the test runtime and on iOS. Mitigation: pure-node fallbacks.
- **CPU on phones** for supersaw chords, 808 hats and Leslie. Mitigation: shared per-stem FX, polyphony caps, measured budgets.
- **Content volume.** 200 recipes with signature checks is a lot of data. Mitigation: inheritance (`extends`), so most styles override only 5–10 fields; the style-check harness catches drift.

---

## 15. UX/UI: a full-width studio

### 15.1 What the current UI does (screenshots in `docs/ux/`, Oct 6)

| Finding | Evidence |
|---|---|
| Desktop uses about a third of the screen | Everything sits in one ≈450 px column on a 1440 px screen (`desktop-1-empty.png`); a song page is ≈3,600 px tall |
| The background glow ends with a hard edge | The gradient stops about 640 px down (`desktop-1-empty.png`, right side) |
| The phone page is about 5.4 screens long | ≈4,600 px after Go wild (`phone-3-go-wild.png`); Play/Pause and the status line scroll away (`phone-3-screen2.png`) |
| Song identity and Producer breakdown repeat each other | Both list the genre or fusion, mix and FX, and each has its own "Copy as prompt" (`phone-3-screen2.png`, `phone-3-screen4.png`) |
| Section strip names are cut to cryptic stubs | "VA", "Bld", "O…", "B…" even on desktop, where there is room (`phone-3-screen1.png`, `desktop-3-go-wild.png`) |
| The option sheet is one flat wrap of chips | 17 fusion chips today with no groups or search; it won't scale to 200 styles (`*-4-option-sheet.png`) |
| Labels disagreed | The status line said "Techno × Darksynth" while the card said "Minimal Techno × Darksynth". **Fixed in Phase 0** (no random variant names) |
| Small grey text is hard to read | Hints in `text-white/40`–`/45` on the dark background are below a comfortable contrast for 11 px text |

### 15.2 Layout

Breakpoints, using Tailwind defaults:

- **Phone (< 768 px):** one column in task order: prompt and actions, visual, section strip, Song card, Tracks, Nudge, Export. A **sticky bottom transport** holds play/pause, position, section, BPM and key, plus the status line.
- **Tablet (768–1279 px):** two columns.
  - Left: prompt, visual, section strip, section detail.
  - Right: a tabbed panel (Song · Tracks · Groove · Harmony · What I heard · Nudge).
  - The transport is sticky at the top.
- **Desktop (≥ 1280 px), the "studio":** full width (no `max-w-lg`), `px-6`, CSS grid `grid-cols-[18rem_minmax(0,1fr)_26rem]`, widening the right column to `30rem` at ≥ 1680 px.
  - **Top bar:** Library, project and song title, prompt (single line, expands on focus), Generate, Surprise, Go wild, Save, Export.
  - **Left rail, the mixer:** one strip per track with name, M/S, vertical fader, pan, meter (section 16), new take, and the gear chip from phase 3. It is full height and scrolls independently.
  - **Centre, the arrangement:** master visual (scope, spectrum or spectrogram), a full-width section strip with full names, arrangement lanes showing each track's notes over time (from `song.events`), and section detail below.
  - **Right panel:** the Song card (section 15.3), then Groove, Harmony and What I heard as collapsible groups. The panel scrolls on its own, so the transport and arrangement stay in view.
- The background is pinned to the viewport (`bg-fixed` on a `min-h-dvh` root) so it never ends mid-page.

### 15.3 One Song card instead of two

- **Song identity** is the card. Per decision 2, **Producer breakdown** is a disclosure section inside it: collapsed by default, open by default in Go wild. One header and one "Copy as prompt".
- **No duplicate rows:**
  - Genre/Fusion becomes one row ("Techno × Darksynth", detail "Techno base fused with Darksynth").
  - Mix geometry keeps the stereo picture; the FX chain shows only effects not already listed there.
- Avoid chips become a compact toggle row under the card instead of a block inside it.
- **Desktop:** the option sheet opens as a popover anchored to the row, or in the right panel, instead of a full-screen overlay. Phones keep the bottom sheet.

### 15.4 Section strip

- **Full names by default.** A segment shows its full label when it has room; otherwise it shows a short form ("Verse A" → "Verse") and the full name on hover and focus, with an accessible name. It is never cut mid-word ("O…").
- **Container queries** decide per segment, so desktop always shows full names.
- **More detail:** each segment shows a bar count on desktop. Arrow keys move between sections, Enter plays from there, and the selected section links to its lane in the arrangement.

### 15.5 Option sheet

- **Grouped and searchable.** Groups with headings come from `CardItem.groups` (section 9.2). A search field appears when a sheet has more than 24 options, and recent picks are listed first.
- **Sticky header:** the item title, current value and Keep/Unlock actions stay pinned while options scroll.
- **Phase 0.5 ships the grouped sheet with search.** The full StylePicker and GearPicker (section 9.3) reuse it in phase 6.

### 15.6 Smaller improvements

- **Keyboard shortcuts:** Space play/pause, `G` generate, `R` surprise, `W` Go wild, `S` save, `L` library, `1`–`5` solo a track, `Esc` closes sheets. They're listed in a `?` overlay and disabled while typing.
- **Readable hints:** small hint text goes up to `text-white/60` (WCAG AA contrast for 11–12 px text). Touch targets stay ≥ 44 px, and focus rings are visible on every control.
- **"What I heard" moves under the prompt**, since it is feedback on what you typed. Its chips stay editable.
- **Library on desktop** opens as a left drawer next to the studio instead of a bottom sheet.
- **Reduced motion:** visuals drop to a static or 10 fps view when `prefers-reduced-motion` is set.
- **Next.js dev badge:** dev-only and absent in production, but it overlaps chips in dev screenshots. Set `devIndicators: false` in `next.config` for dev screenshots.

### 15.7 Checks

- Puppeteer screenshots at 390, 768, 1440 and 1920 px (`scripts/ux-shots.mjs`), with no horizontal overflow at any width.
- The e2e, recovery and smoke tests are updated for the new layout and pass.
- The golden check shows 0 sound changes, since this phase must not touch audio.

## 16. Visuals: live views of every sound

All views are drawn from Web Audio `AnalyserNode`s on the **live** context, or from the patch and gear parameters themselves. Offline export never builds them, so exports and golden fingerprints are unaffected.

| View | Source | Where |
|---|---|---|
| Oscilloscope (master and each track) | `getFloatTimeDomainData`, triggered on a rising zero crossing so the wave stands still | Master: centre visual. Tracks: mini scope in each mixer strip |
| Spectrum analyzer | `getFloatFrequencyData` (fftSize 8192 master, 2048 per track), log frequency axis, 1/3-octave smoothing, peak hold | Centre visual (toggle) and the Sound inspector |
| Spectrogram | The same FFT drawn as a scrolling waterfall; one column per frame into an offscreen canvas | Centre visual (toggle) |
| Level meters | Peak and RMS per track and master from time-domain data, with clip hold; master short-term loudness through a K-weighting filter pair | Mixer strips and the transport |
| Goniometer and correlation meter | `ChannelSplitter` → left and right analysers; plots (L−R, L+R) rotated 45°, with a −1…+1 correlation bar | Transport (desktop), Sound inspector (phone) |
| ADSR envelope | Drawn from the patch or gear envelope parameters, with a dot following the newest note's stage | Sound inspector (phase 3) |
| Filter response curve | `BiquadFilterNode.getFrequencyResponse()` for biquad filters; an analytic response from cutoff and resonance for the worklet ladder; animates with filter automation | Sound inspector (phase 3) |
| LFO shape | Drawn from LFO shape, rate and tempo sync, with a phase dot from `currentTime` | Sound inspector (phase 3) |
| Wavetable | Stacked frames of the table, with the current morph position highlighted | Sound inspector (phase 3) |
| Arrangement lanes | `song.events` per track over the timeline (not audio) | Centre, under the section strip |

How it's built:

- **Taps:**
  - Today `engine.getAnalyser()` exposes one master analyser.
  - `buildGraph` gains an analyser tap per track (post-fader, before the master bus) and a stereo split on the master. They are created only for the live context.
- **Drawing:**
  - One `requestAnimationFrame` loop draws every visible canvas (2D canvas, device-pixel-ratio aware).
  - Hidden or collapsed views don't draw, and drawing pauses when the tab is hidden.
  - The light playback mode (decision 3) caps visuals at 30 fps.
- **Sound inspector:** a panel that opens when you select a track or a gear row in the breakdown. Right column on desktop, bottom sheet on phones.
- **Phasing:**
  - Phase 0.5 ships the analyser views: scopes, spectrum, spectrogram, meters, goniometer and lanes.
  - Phase 3 adds the parameter views (ADSR, filter, LFO, wavetable), once gear models expose their parameters.
- **Check:** frame cost measured with the performance panel (under 4 ms desktop, under 8 ms on a mid-range phone), plus golden-check identical audio.

## Appendix A: the 200-genre map

★ = in your list of 50. Form ids are from section 7.5. "New parts" names the archetypes, gear and patterns from sections 5–7 that the style needs beyond what exists today. BPM ranges are the composer's target ranges.

### Electronic (130)

#### House (18)

| # | Style | BPM | Rhythm | Sound (bass · chords · lead) | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 1 | House ★ | 120–126 | Four on the floor, clap 2 & 4, offbeat open hat | Offbeat/syncopated saw or FM · piano/organ stabs · pluck, vocal chop | Club | 909, M1 piano, Juno |
| 2 | Deep House ★ | 118–124 | Soft 4/4, swung 16th hats (≈55%), rim shots | Warm sub/FM, rolling · Rhodes/organ 7th–9th chords · sparse vocal chop | Club (long intro) | 909 soft, Rhodes, Juno chorus · swing grid per style |
| 3 | Tech House ★ | 124–128 | Tight 4/4, shuffled hats, conga/bongo tops | Rubber 16th bass locked to kick · minimal stabs · vocal hook chop | DJ tool | 909, hand perc · rubber 16th line, perc loops |
| 4 | Progressive House ★ | 122–128 | 4/4, rolling 16th hats, long builds | Sub + pulsing 8ths · pads, piano · arpeggiated plucks | Club (long breakdown) | 909, Prophet pad, supersaw lite |
| 5 | Big Room House ★ | 126–130 | 4/4 with huge clap, snare-roll builds, pitch-riser | Sub only in drop · minimal · big detuned saw "drop lead" stabs | Club (drop = kick + lead) | 909 layered kick, supersaw · big room lead, roll builds |
| 6 | Acid House | 120–128 | 4/4, 808/909 hats | TB-303 lines with accent/slide · sparse chords · acid lead | DJ tool | 808/909, 303 |
| 7 | Nu-Disco ★ | 110–124 | Live-feel 4/4, open hats, claps, tambourine | Octave bass · disco strings, funky guitar chops, Rhodes · synth lead | Club | 909/LinnDrum, Juno, guitar chop · octave line |
| 8 | French House | 120–126 | 4/4, heavy sidechain pump, filter sweeps | Funky filtered bass · filtered disco loop chords · talkbox lead | Club (filter arcs) | 909, phaser, talkbox · filter-loop move |
| 9 | Afro House | 118–124 | 4/4 + shaker, polyrhythmic congas, bells, toms | Deep sub · minor pads · chant vocal, marimba/kalimba | DJ tool | 909 + hand perc · marimba, bell pattern 12/8 feel |
| 10 | Tropical House ★ | 100–115 | Soft 4/4, laid-back claps, shaker | Soft sub · light piano/guitar chords · marimba, steel pan, pan flute, sax | Pop | soft 909, marimba, steel pan |
| 11 | G-House ★ | 120–126 | Bouncy 4/4, snappy clap, swung hats | Bouncy subby 808-ish bass · minimal dark stabs · hip-hop vocal chops | Club | 909 + 808 bass · bouncy line |
| 12 | Electro House | 126–130 | 4/4, punchy clap, fills | Distorted saw "electro" bass stabs · stabs · square/saw lead | Club | 909, Minimoog drive |
| 13 | Future House | 124–128 | 4/4, swung offbeat hats | Metallic pitched "future house" bass (FM/wavetable bounce) · plucks · vocal chop | Club | 909, FM bass · metallic bass |
| 14 | Bass House | 124–130 | 4/4 with UK-style percs, 2-step fills | Growly/wobbly reese-ish bass · minimal · chops | Bass | 909, wavetable growl, reese |
| 15 | Soulful House | 120–124 | Live 4/4, shaker, congas | Warm bass · gospel piano/organ chords · vocal lead | Club | 909, Rhodes, Hammond |
| 16 | Lo-fi House | 118–125 | Dusty 4/4, tape-swung hats | Warm sub · detuned chords · muffled lead | DJ tool | SP-1200 char, tape, Juno |
| 17 | Melodic House | 118–124 | Steady 4/4, rolling percs | Sub/pulse · emotive pads · arps | Club | 909, Prophet, arps |
| 18 | Amapiano ★ | 108–115 | Sparse kick, shakers, 3+3+2 syncopation, wood-block/clap ticks | **Log drum** bass with slides · jazzy piano/Rhodes 7ths · airy pads, sax/flute | DJ tool | log drum, Rhodes, hand perc · log-drum line |

#### Techno (13)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 19 | Techno ★ | 125–135 | 4/4 909, offbeat hats, ride | Rolling sub/stab · futuristic pads/strings · stab riffs | DJ tool | 909, Juno, Prophet |
| 20 | Minimal Techno ★ | 124–130 | Sparse 4/4, clicks, micro perc | Short sub · almost none · tiny blips | DJ tool | 909 soft, blue-noise clicks |
| 21 | Acid Techno ★ | 130–145 | Driving 4/4, 16th hats | Distorted 303 lines · none/stab · acid lead | DJ tool | 909, 303 + drive |
| 22 | Dub Techno | 118–126 | Soft 4/4, hiss | Sub · **dub chord stab** into long feedback delay/reverb · none | DJ tool | 909 soft, Prophet stab, Space Echo · dub stab move |
| 23 | Melodic Techno | 120–126 | 4/4, rolling | Sub/FM · pads, arps · FM lead | Club | 909, Prophet, DX7 |
| 24 | Industrial Techno | 128–140 | Distorted 4/4, metal perc | Distorted rumble · noise · metallic hits | DJ tool | distorted 909, ring mod perc |
| 25 | Hard Techno | 140–155 | Distorted rumble kick, offbeat hats | Rumble (kick tail + brown noise reverb) · minimal · stabs | DJ tool | kick chain · rumble kick |
| 26 | Hardgroove ★ | 135–145 | Loopy, swung, tribal toms, cowbell, ride | Minimal bass · none · percussive loops | DJ tool | 909 + hand perc · loop-based pattern sets |
| 27 | Peak-time Techno | 128–135 | Driving 4/4, claps | Big rolling bass · stab riffs · lead riff | DJ tool | 909, Minimoog |
| 28 | Hypnotic Techno | 126–132 | Rolling 4/4, polymeter percs | Rumble · drone · repeating motif | DJ tool | 909, brown-noise rumble |
| 29 | Schranz | 145–155 | Distorted, loop-heavy 4/4, chopped percs | Distorted bass · none · loops | DJ tool | kick chain, drive |
| 30 | Ambient Techno | 110–125 | Soft 4/4 or broken | Sub · pads · bells | Ambient | 909 soft, granular |
| 31 | Microhouse | 120–126 | Glitchy clicks, swung | Short sub · chopped chords · micro vocal chops | DJ tool | granular, blue noise |

#### Trance (11)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 32 | Trance ★ | 132–140 | 4/4, offbeat open hats, claps | Rolling offbeat bass · supersaw/pad · saw lead | Club (long breakdown) | 909, JP-8000 |
| 33 | Uplifting Trance | 136–140 | 4/4, snare-roll builds | Offbeat/rolling · supersaw, **trance gate** · soaring lead | Club | JP-8000, gated pad |
| 34 | Progressive Trance | 128–134 | 4/4, rolling | Pulsing · evolving pads · plucks | Club (slow burn) | 909, Juno, Prophet |
| 35 | Vocal Trance | 132–138 | 4/4 | Offbeat · supersaw · vocal lead | Pop + club | JP-8000, formant vocal |
| 36 | Tech Trance | 134–140 | Punchier 4/4, techno percs | Driving 16th · stabs · acid/FM riffs | Club | 909, 303 |
| 37 | Acid Trance | 135–142 | 4/4 | 303 lines · pads · acid lead | Club | 303, Juno |
| 38 | Hard Trance | 140–150 | Hard 4/4 | Rolling · hoover/supersaw · hard lead | Club | kick chain lite, hoover |
| 39 | Dream Trance | 130–138 | 4/4 soft | Offbeat · pads · **piano lead** | Club | 909, piano, pad |
| 40 | Eurotrance | 135–142 | 4/4 | Offbeat · supersaw stabs · catchy lead | Pop + club | JP-8000 |
| 41 | Cyber-Trance | 136–142 | 4/4 | Rolling · supersaw/arps · bright leads | Club | JP-8000, Virus-style |
| 42 | Hands Up | 140–150 | 4/4, pumping | Offbeat · supersaw · pitched-up vocal lead | Pop + club | JP-8000, formant |

#### Psytrance (11)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 43 | Psytrance ★ | 140–148 | 4/4, tight kick | **Psy roll (kick-bass-bass-bass)** · sparse · FM/acid leads, FX sweeps | Psy | 909-style kick, FM bass, 303 · psy roll line |
| 44 | Goa Trance | 135–150 | 4/4 | Rolling · Eastern-scale arps (phrygian dominant) · acid leads | Psy | 303, Juno, DX7 |
| 45 | Full-On | 142–148 | 4/4 | Roll · melodic morning leads · big FX | Psy | Virus-style, FM |
| 46 | Progressive Psytrance | 134–140 | 4/4, groovy | Offbeat psy roll (rolling triplets) · pads · plucks | Psy (slow burn) | FM bass |
| 47 | Dark Psytrance | 148–160 | 4/4 | Fast roll · dissonant · twisted FX | Psy | FM, ring mod, granular |
| 48 | Forest Psytrance | 145–155 | 4/4 | Roll · organic textures, crickets · glitch | Psy | granular, pink noise |
| 49 | Hi-Tech | 160–200 | 4/4 at high speed, 1/32 glitches | Ultra-fast roll · minimal · micro FX | Psy | FM, 32-step grid |
| 50 | Psybient | 85–110 | Broken/slow | Sub · pads · bells, flute | Ambient | granular, Juno |
| 51 | Psydub | 70–100 | Dub one drop-ish | Deep sub · dub stabs · echoes | Reggae | Space Echo, spring |
| 52 | Suomisaundi | 140–150 | Loose 4/4 | Quirky bass · odd chords · playful leads | Psy (free) | FM, 303 |
| 53 | Zenonesque | 138–145 | Minimal 4/4 | Groovy minimal roll · none · clicks | Psy | FM, blue noise |

#### Drum & Bass (10)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 54 | Drum & Bass ★ | 170–176 | Two-step kick/snare, fast hats | Reese/sub · pads · sparse lead | Bass | 909 break kit, reese |
| 55 | Liquid Funk ★ | 170–176 | Smooth two-step, ghost snares | Warm sub · Rhodes/strings 7ths · vocal/sax | Bass | Rhodes, reese soft |
| 56 | Neurofunk ★ | 172–176 | Tight two-step | Growl/talking reese · dark · FX | Bass | wavetable growl, reese |
| 57 | Jungle ★ | 160–170 | **Amen-style chopped breaks**, ragga | Deep sub (808-ish) · pads/strings · ragga vocal chop | Bass | break kit synth, SP-1200 char · break edits |
| 58 | Jump-Up | 172–176 | Two-step | Bouncy wobbly "jump-up" bass · none · stabs | Bass | wavetable, wobble |
| 59 | Atmospheric DnB | 165–175 | Two-step, soft | Sub · big pads · bells | Bass (slow burn) | pads, granular |
| 60 | Rollers | 172–176 | Minimal rolling | Rolling sub · minimal · none | DJ tool | reese |
| 61 | Darkstep | 172–180 | Aggressive breaks | Distorted reese · dark · noise | Bass | reese + drive |
| 62 | Techstep | 170–175 | Cold, mechanical | Reese, hoover · minimal · metallic | Bass | hoover, ring mod |
| 63 | Halftime | 160–175 (85 feel) | Half-time snare on 3 | Heavy reese/sub · sparse · FX | Bass | reese |

#### Dubstep & UK Bass (15)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 64 | Dubstep ★ | 138–142 (70 feel) | Half-time, sparse kick, snare on 3 | **Wobble** sub (synced LFO) · dark pads · minimal | Bass | 808/909, wobble · synced LFO |
| 65 | Brostep | 140–150 | Half-time | Mid-range growl/talking bass · none · screech | Bass (switch-up) | wavetable growl |
| 66 | Riddim | 140–150 | Half-time | Repetitive minimalist wobble · none · none | Bass | wobble |
| 67 | Melodic Dubstep | 140–150 | Half-time | Wobble/growl · supersaw chords · emotive lead | Bass | JP-8000, wobble |
| 68 | Future Bass ★ | 130–160 (half feel) | Half-time, trap hats | Sub/808 · **supersaw chord swells with pump, pitch-bent chords** · vocal chops | Pop/bass | JP-8000, formant chop |
| 69 | Trap (Electronic) ★ | 140–150 | Half-time, 808 rolls, snare-roll builds | 808 glide · brass/supersaw stabs · lead synth | Bass | 808, brass stab |
| 70 | Moombahton ★ | 108–112 | **Dembow** pattern, house claps | Sub/808 · stabs · dancehall-style lead | Club | 808 + perc · dembow |
| 71 | UK Garage ★ | 130–136 | **2-step**, shuffled hats (≈55–65%) | Sub or "warp" bass · organ/Rhodes stabs · vocal chops | Club (switch-up) | MPC3000 swing, M1 organ · 2-step |
| 72 | Speed Garage | 130–135 | 4/4 + skippy hats | Warp/pitch-dive bass · organ stabs · chops | Club | M1, reese-warp |
| 73 | Future Garage | 130–140 | Broken 2-step, crackle | Reese/sub · pads · pitched vocal | Downtempo | granular, reese |
| 74 | Grime ★ | 140 | Sparse, half-time-ish, eski clicks | Square-wave bass · none · eski synth/strings stabs | Hip hop | square bass, pizz strings |
| 75 | UK Funky | 128–132 | Syncopated tribal 4/4, congas | Sub · minor stabs · chops | Club | hand perc |
| 76 | Bassline | 135–140 | 4/4 | Wobbly organ-ish **donk/bassline** · stabs · pitched vocal | Club | donk, M1 organ |
| 77 | Footwork ★ | 155–165 | **808 kick triplets**, sparse snare, fast hats | 808 · chopped soul chords · **repeated vocal chops** | Hip hop | 808, formant chops · 24-step grid |
| 78 | Jersey Club | 130–145 | **Kick-triplet "bounce"**, squeak FX | 808 · minimal · chopped vocal | Club | 808, FX samples synthesized (bed squeak = filtered pitch blip) |

#### Breaks & Electro (8)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 79 | Breakbeat ★ | 125–140 | Broken breaks, syncopated kick | Sub/acid · stabs · lead | Club | break kit, SP-1200 |
| 80 | Big Beat | 100–140 | Fat, distorted breaks | Distorted bass · guitar/stabs · samples-like hits | Rock/club | break kit + drive |
| 81 | Nu Skool Breaks | 130–140 | Breaks, tight | Wobbly saw bass · pads · acid | Club | break kit, 303 |
| 82 | Electro ★ | 120–135 | Syncopated robotic 808 | Square/808 bass · minimal · **vocoder** | DJ tool | 808, vocoder |
| 83 | Electro Swing ★ | 110–130 | Swing feel + house kick | Upright/walking · swing piano, horns · clarinet/brass | Club | horns, upright, 909 · swing over 4/4 |
| 84 | Complextro ★ | 126–130 | 4/4, rapid edits | Constantly switching synth bass timbres · stabs · glitch leads | Club | wavetable, hard sync · per-16th timbre switching |
| 85 | Glitch Hop ★ | 90–110 | Swung half-time, glitches | Wobble/FM · funky · glitch stutters | Hip hop | wobble, granular |
| 86 | Miami Bass | 125–135 | Booming 808, fast | Long 808 · minimal · vocoder | Club | 808 long |

#### Hard Dance (8)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 87 | Hardstyle ★ | 150–155 | **Distorted tonal kick**, offbeat reverse bass | Kick = bass · supersaw · screech/euphoric lead | Hard | kick chain, JP-8000, screech |
| 88 | Rawstyle | 150–160 | Harder distorted kick | Kick · dark · screech, anti-climax | Hard | kick chain |
| 89 | Jumpstyle | 140–150 | 4/4 + offbeat bass | Offbeat bass · stabs · lead | Hard | kick chain lite |
| 90 | Hardcore ★ | 160–180 | 4/4 hard kick | Hoover · rave piano · hoover lead | Hard | hoover, M1 piano |
| 91 | Gabber ★ | 160–200 | **Overdriven distorted kick** every beat | Kick · none · hoover/screams | Hard | kick chain (heavy drive) |
| 92 | Frenchcore | 190–220 | Distorted offbeat kick | Kick · violins · screech | Hard | kick chain, strings |
| 93 | Breakcore | 160–200 | Chopped fast breaks | Distorted sub · random · glitch | Hard | break kit, granular |
| 94 | Hard House | 140–150 | 4/4 + offbeat **donk** | Donk · stabs · hoover | Club | donk, hoover |

#### Synth, Retro & Dark (14)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 95 | Synthwave ★ | 80–118 | Gated 80s kit, backbeat | Pulsing 16th saw · pads, brass · saw lead | Pop | LinnDrum, gated reverb, Juno, Minimoog |
| 96 | Outrun | 100–118 | Driving gated kit | 16th pulse · arps · lead | Pop | LinnDrum, Prophet |
| 97 | Darksynth | 100–120 | Heavy gated kit | Distorted saw · dark pads · aggressive lead | Pop | drive |
| 98 | Vaporwave ★ | 60–90 | Slowed, pitched-down 80s grooves | Mellow · chopped smooth-jazz chords · slowed lead | Downtempo | DX7, tape slowdown FX |
| 99 | Chillwave ★ | 80–110 | Hazy, tape-swung | Soft bass · washed pads · reverbed vocal | Pop | tape, Juno chorus |
| 100 | Chiptune ★ | 120–160 | LFSR-noise drums | Stepped triangle bass · fast arpeggio chords · pulse leads | Pop | **NES/SID chip** |
| 101 | Italo Disco ★ | 110–125 | 4/4 drum machine | **Octave bass** · arps · vocoder/lead | Pop | LinnDrum/707, Juno, vocoder |
| 102 | Eurodance ★ | 130–145 | 4/4, open hats | Octave/offbeat bass · piano/M1 stabs · catchy lead + rap slot | Pop | 909, M1 |
| 103 | Hi-NRG | 120–140 | 4/4 | Octave 8ths · stabs · lead | Pop | LinnDrum, octave line |
| 104 | EBM ★ | 115–130 | Hard snare, militaristic | **Sequenced 16th bass** · none · shouted-style stabs | DJ tool | Prophet/MS-20, gated snare |
| 105 | New Beat ★ | 100–115 | Slow, heavy 4/4 | Heavy sequenced bass · dark pads · stabs | DJ tool | analog seq |
| 106 | Darkwave ★ | 100–130 | Drum machine | Chorused bass · minor pads · cold lead | Pop | Juno chorus, LinnDrum |
| 107 | Witch House | 60–80 | Slow trap-ish | 808 · dark drones · pitched-down chops | Downtempo | 808, granular |
| 108 | Industrial ★ | 100–140 | Metallic, distorted | Distorted bass · noise · metal hits | Rock | ring mod, drive |

#### Downtempo, Chill & Lo-fi (14)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 109 | Downtempo ★ | 80–110 | Laid-back broken | Warm bass · pads/Rhodes · gentle lead | Downtempo | Rhodes, spring |
| 110 | Trip Hop ★ | 70–95 | Slow heavy breaks | Deep bass · dark strings/Rhodes · vocal | Downtempo | break kit, spring, SP-1200 |
| 111 | Chillout / Balearic | 90–115 | Relaxed | Soft bass · guitar/pads · flute | Downtempo | nylon guitar |
| 112 | Lo-fi Hip Hop | 70–90 | Dusty swung boom bap | Sub/upright · jazzy Rhodes/piano · muffled lead | Hip hop | SP-1200, tape, vinyl |
| 113 | Chillhop | 80–95 | Swung | Upright · jazzy chords · guitar/sax | Hip hop | MPC swing |
| 114 | Jazzhop | 80–95 | Swung | Upright walking · jazz chords · horn | Hip hop | Rhodes, brass |
| 115 | Sleep / Study Lo-fi | 60–80 | Very soft | Sub · soft pads · bells | Downtempo | tape, granular |
| 116 | Lo-fi Jazz | 70–90 | Brushes, swing | Upright · piano · sax | Jazz | brushes, tape |
| 117 | Lo-fi Ambient | 60–75 | Little or no drums | Drone · pads · bells | Ambient | tape, granular |
| 118 | Lo-fi Soul / R&B | 75–90 | Swung | Warm bass · neo-soul chords · vocal | Hip hop | Rhodes, tape |
| 119 | Chill Trap | 130–150 (half) | Soft half-time, hat rolls | 808 · pads · bell lead | Hip hop | 808, tape |
| 120 | Lo-fi Bossa | 80–100 | Bossa pattern, soft | Upright · nylon guitar · flute | Jazz | nylon, tape |
| 121 | Nu Jazz | 90–125 | Broken beat | Upright/synth · jazz chords · brass | Downtempo | Rhodes, break kit |
| 122 | Organic House | 105–118 | Soft 4/4, hand perc | Sub · pads · oud/flute-like lead | Club | hand perc, nylon |

#### Ambient & Experimental (8)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 123 | Ambient ★ | 60–80 | None/very soft | Sub · evolving pads · bells | Ambient | granular, shimmer |
| 124 | Dark Ambient | 50–70 | None | Brown-noise rumble · dissonant drones · scrapes | Ambient | brown noise, granular |
| 125 | Drone | 50–70 | None | Sustained · drones · none | Ambient | drone stack |
| 126 | Space Ambient | 60–80 | None | Sub · shimmering pads · arps | Ambient | shimmer, Juno |
| 127 | New Age | 60–90 | Soft | Soft bass · pads · flute/piano | Ambient | DX7 bell, pan flute |
| 128 | IDM ★ | 80–160 | Complex, broken, glitchy | FM/sub · unusual chords · glitch melodies | Downtempo | FM, granular, glitch edits |
| 129 | Glitch | 80–140 | Stutters, micro-edits | Clicks · fragments · glitch | Ambient | granular, bitcrush |
| 130 | Deconstructed Club | 100–140 | Fragmented club | Harsh bass · sparse · metallic | DJ tool | ring mod, granular |

### Hip Hop (8)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 131 | Boom Bap | 84–96 | Swung boom-bap kick/snare | Sub/upright · chopped piano/Rhodes · horn stab | Hip hop | SP-1200/MPC, vinyl |
| 132 | Jazz Rap | 85–95 | Swung | Upright · jazz chords · horns | Hip hop | MPC, Rhodes |
| 133 | Trap | 130–150 (half) | Half-time, hat rolls | 808 glide · dark pads · bell/flute | Hip hop | 808 |
| 134 | Drill | 138–145 (half) | **Sliding off-beat snares**, triplet hats | Sliding 808 · dark strings/choir · piano | Hip hop | 808 glide · drill pattern |
| 135 | Phonk ★ | 130–145 | Memphis-style, cowbell | Distorted 808 · dark · **cowbell melody** | Hip hop | 808 + drive, cowbell (808 2-square) |
| 136 | G-Funk | 88–100 | Laid-back | Minimoog bass · Rhodes/strings · **high Moog whine lead**, talkbox | Hip hop | Minimoog, talkbox |
| 137 | Crunk | 75–85 | Heavy 808, chants | 808 · stabs · synth hook | Hip hop | 808 |
| 138 | Cloud Rap | 60–80 (or 130–160 half) | Hazy trap | 808 · reverbed pads · dreamy lead | Hip hop | 808, shimmer |

### Pop (7)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 139 | Pop | 95–125 | 4/4 backbeat | Synth/electric bass · piano/guitar/synth chords · vocal lead | Pop | modern kit, Juno, piano |
| 140 | Synthpop | 110–130 | Drum machine | Sequenced bass · synth pads · synth lead | Pop | LinnDrum, Juno, DX7 |
| 141 | Dance-Pop | 118–128 | 4/4 | Offbeat bass · stabs · vocal | Pop | 909, supersaw |
| 142 | K-pop | 95–130 | Section-switching grooves | Varies per section · stacked synths · vocal hooks | Pop (beat switches) | multi-style section patterns |
| 143 | City Pop | 100–120 | Funky backbeat | Slap/finger bass · DX7 EP, brass · lead | Pop | DX7, slap bass |
| 144 | Indie Pop | 100–125 | Live backbeat | Bass guitar · jangly guitar/synth · vocal | Pop | clean guitar |
| 145 | Hyperpop ★ | 130–170 | Hyper-compressed trap/club | Distorted 808 · bright supersaws · pitched-up vocal chops, chip leads | Pop | 808 + drive, chip, formant |

### R&B, Soul & Funk (7)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 146 | Funk | 95–115 | 16th syncopation, "on the one" | **Slap/16th bass** · clav, chicken-scratch guitar · horn hits | Pop | clavinet, slap bass, horns |
| 147 | Disco | 110–125 | 4/4, open hats on offbeats | Octave bass · strings, guitar chops · brass/strings | Club | live kit, strings, octave line |
| 148 | Soul | 70–110 | Backbeat, tambourine | Warm bass · Hammond/piano · vocal-like lead | Pop | Hammond + Leslie |
| 149 | Motown | 100–130 | Four-on-snare backbeat, tambourine | Melodic bass · piano/strings · vocal | Pop | live kit, tambourine |
| 150 | Neo-Soul | 70–95 | Laid-back, drunk swing | Warm bass · rich Rhodes 9ths · vocal | Pop | Rhodes, upright |
| 151 | Contemporary R&B | 60–100 | Trap-influenced | 808 · lush chords · vocal runs | Pop | 808, Rhodes |
| 152 | Gospel | 70–130 | Backbeat or shuffle | Organ bass · Hammond, piano · choir | Pop | Hammond + Leslie, choir |

### Rock (7)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 153 | Classic Rock | 100–140 | Backbeat | Root 8ths · crunch guitar · lead guitar | Rock | Marshall crunch |
| 154 | Indie Rock | 110–150 | Driving backbeat | Bass guitar · jangly/driven guitar · vocal | Rock | clean + crunch |
| 155 | Alternative / Grunge | 90–130 | Heavy backbeat | Dropped bass · loud-quiet guitar · lead | Rock | fuzz, clean |
| 156 | Post-Punk | 120–160 | Motorik/driving | Melodic bass up front · chorused guitar · cold vocal | Rock | chorus guitar |
| 157 | Shoegaze | 90–130 | Steady | Bass · walls of fuzz + reverb · buried vocal | Rock | fuzz, shimmer reverb |
| 158 | Psychedelic Rock | 90–130 | Loose | Bass · fuzz, organ, Mellotron · sitar-ish lead | Rock | fuzz, Mellotron, phaser |
| 159 | Surf Rock | 140–170 | Driving | Bass · **spring-reverb twang guitar** · lead | Rock | spring reverb |

### Punk & Metal (6)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 160 | Punk | 160–200 | Fast 8ths, D-beat | Punk 8ths bass · power chords · shouted lead | Rock (short) | hi-gain, D-beat pattern |
| 161 | Pop-Punk | 150–190 | Fast backbeat | Driving 8ths · power chords · melodic lead | Pop | hi-gain |
| 162 | Heavy Metal | 100–160 | Driving, galloping | Gallop · distorted riffs · guitar lead | Rock | hi-gain amp |
| 163 | Thrash Metal | 160–220 | Skank beat, double kick | **Chug** · tremolo riffs · solos | Rock | hi-gain, 32-step double kick |
| 164 | Doom / Stoner | 50–80 | Slow, heavy | Fuzz bass · down-tuned riffs · lead | Rock | fuzz |
| 165 | Metalcore | 120–180 | Breakdowns, double kick | Chug · riffs · lead | Rock (breakdown) | hi-gain |

### Blues (3)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 166 | Delta Blues | 60–90 | Shuffle, sparse or no drums | None/upright · slide guitar · harmonica | Blues 12 | resonator guitar, harmonica |
| 167 | Chicago Blues | 70–110 | Shuffle, full band | Walking · piano, organ · harmonica, guitar | Blues 12 | Hammond, harmonica |
| 168 | Texas / Blues Rock | 80–130 | Shuffle or straight | Boogie · crunch · guitar | Blues 12 | crunch amp |

### Jazz (6)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 169 | Swing / Big Band | 120–200 | Swing ride, 4-on-the-floor feathered kick | Walking · horn sections · brass/sax | Jazz | horn section |
| 170 | Bebop | 180–220 | Fast swing ride | Fast walking · comping piano · sax | Jazz | sax, upright |
| 171 | Cool Jazz | 100–150 | Brushes swing | Walking · soft piano · trumpet (muted) | Jazz | brushes |
| 172 | Modal Jazz | 100–160 | Swing | Pedal/walking · quartal chords · sax | Jazz | quartal voicings |
| 173 | Jazz Fusion | 100–140 | Straight 16ths | Fretless/slap · electric piano · synth/guitar lead | Jazz | Rhodes, Minimoog |
| 174 | Bossa Nova | 110–140 (felt as 2) | **Straight bossa pattern**, rim clave | Root-fifth upright · nylon guitar chords · flute/sax | Jazz | nylon guitar · bossa pattern |

### Country & Folk (6)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 175 | Folk | 78–112 | Light or no drums | Upright · strummed acoustic · whistle/harmonica | Folk | acoustic guitar |
| 176 | Indie Folk | 80–120 | Soft kick, claps | Bass · fingerpicked guitar · vocal | Folk | fingerpick pattern |
| 177 | Bluegrass | 100–160 | **No drums**, "boom-chick" from bass and guitar | Upright root-fifth · guitar · banjo, fiddle, mandolin | Folk | banjo, fiddle, mandolin |
| 178 | Country | 90–140 | Train beat / two-step | Root-fifth · twangy Telecaster, pedal steel · fiddle | Folk | Telecaster, pedal steel |
| 179 | Country Rock / Southern | 100–132 | Backbeat | Bass guitar · crunch + slide · guitar | Rock | slide, crunch |
| 180 | Celtic | 100–140 (jigs 6/8) | Bodhrán, jig/reel | Drone · guitar · fiddle, tin whistle, pipes | Folk | bodhrán, whistle |

### Latin (6)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 181 | Reggaeton | 88–100 | **Dembow** | 808 · minor synth chords · vocal | Pop | 808 · dembow |
| 182 | Salsa | 160–210 (2 feel) | Clave, congas, timbales, cowbell | **Tumbao** bass · piano **montuno** · brass | Latin | latin perc, brass |
| 183 | Cumbia | 85–100 | Güira/guiro, cumbia pattern | Bass · accordion · flute/accordion | Latin | accordion, guiro |
| 184 | Bachata | 120–140 | Bongo/güira | Syncopated bass · requinto guitar arpeggios · guitar | Latin | nylon guitar |
| 185 | Samba | 90–105 (2 feel) | Surdo, tamborim, pandeiro | Bass · cavaquinho · whistle | Latin | latin perc |
| 186 | Tango | 60–70 (2/4 or 4/4) | Marcato, arrastre | Bass · bandoneón, piano · violin | Latin | bandoneón (accordion variant) |

### Caribbean (4)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 187 | Reggae | 60–90 | **One drop** (kick and snare on 3) | Riddim bass · offbeat **skank** guitar, organ bubble · lead | Reggae | spring, organ · one drop, skank |
| 188 | Dub | 60–80 | One drop, dropouts | Deep bass · echo stabs · sirens | Reggae | Space Echo, spring, siren |
| 189 | Dancehall | 90–110 | Dancehall riddim | 808/sub · stabs · vocal | Pop | 808 |
| 190 | Ska | 140–180 | Upbeat skank, walking | Walking · offbeat guitar · horns | Rock | horns, skank |

### African (4)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 191 | Afrobeat | 100–130 | Tony Allen-style polyrhythm, shekere | Hypnotic riff bass · interlocking guitars, organ · horns | Jam (long vamp) | horns, hand perc |
| 192 | Afrobeats | 95–115 | Syncopated log-drum or perc groove | Sub · minor chords · vocal | Pop | hand perc, 808 |
| 193 | Highlife | 110–140 | Bell pattern | Melodic bass · clean guitar runs · horns | Pop | clean guitar, horns |
| 194 | Gqom | 120–127 | Broken, no four-on-the-floor, toms | Dark sub · minimal · chants | DJ tool | 909 toms |

### World (2)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 195 | Indian / Bollywood fusion | 90–130 | Tabla, dhol | Bass · strings, harmonium · sitar, bansuri | Pop | sitar, tabla, harmonium |
| 196 | Middle Eastern | 80–120 | Darbuka, maqsum rhythm | Bass · oud · ney/violin | Pop | oud, darbuka · maqam scales |

### Cinematic & Classical (4)

| # | Style | BPM | Rhythm | Sound | Form | Default gear · new parts |
|---|---|---|---|---|---|---|
| 197 | Epic Trailer | 80–140 | Taiko, booms | Sub, impacts · string ostinatos, brass · choir | Score | taiko, braams |
| 198 | Orchestral Score | 60–120 | Orchestral perc | Celli/basses · strings, woodwinds · solo instrument | Score | orchestral strings, timpani |
| 199 | Western Score | 70–110 | Galloping | Bass · strings, whistling · twang guitar | Score | spring, whistle |
| 200 | Neoclassical | 60–100 | None/soft | None · piano, strings · solo piano | Ambient/score | piano model |

### Coverage of your list

All 50 styles you listed appear above (★).

- 48 are in the Electronic families.
- Phonk is in Hip Hop and Hyperpop is in Pop, where producers usually file them. Both still use the electronic gear and patterns.
- The deeper families you asked for are covered:
  - Trance: 11 styles (rows 32–42).
  - Psytrance: 11 styles (rows 43–53).
  - Lo-fi and chill: 14 styles (rows 109–122), plus Lo-fi House (16).
