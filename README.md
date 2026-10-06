# Music Studio — Sound Canvas

Local-first music product. Not a DAW. Not a cloud music API wrapper.

You describe a **vibe**, get a **full piece**, then **nudge** human dimensions (space, bass, drum feel, grit, pulse, vocal character, genre pull) while it stays one coherent song. Export a mix + stems you own.

Phone-first PWA. Works on desktop too.

## Vision (plain)

DAWs make you think in tracks, plugins, and timelines before you’ve decided what the song *feels* like. Music Studio flips that:

1. **Say it** — intent in your words (electronic, folk, cyborg-trance, country rock, whatever).
2. **Hear it** — a whole piece, not a blank project.
3. **Nudge it** — push feel dimensions; no EQ homework, no plugin racks.
4. **Own it** — download mix + stems.

Shaping is powerful. The UI just doesn’t make you become an engineer.

## How it works (all local)

Everything runs in the browser with the Web Audio API. There are no cloud music APIs, no samples and no network calls for sound.

1. **Understand**: `src/lib/music/parse.ts` maps a large set of words and synonyms onto genre weights, moods, tempo, key, instruments, textures and nudge positions. It covers genres, moods (dark, lonely, dreamy, aggressive…), tempo words, instruments (banjo, 808, harmonica, strings…) and places or eras (80s, desert, campfire, warehouse…).
   - Blends like "lonely country rock **with a trance pulse**" route the rhythm section to trance and keep the song form, chords and melody from country rock.
   - Prompts with no recognized words still get a distinct style, seeded from a hash of the text.
2. **Plan**: genres, moods, BPM, key/mode and instruments show up as editable chips ("say it OR shape it").
3. **Compose**: `src/lib/music/compose.ts` turns the plan into a 60–90 s arrangement:
   - sections (intro / verse / build / chorus or drop / breakdown / bridge / solo / outro), each with its own layer levels and drum fills, crashes, risers and impacts
   - chord progressions with voice leading
   - a motif-based melody that stays in key and lands on chord tones
   - genre-specific bass lines and drum patterns with swing
4. **Synthesize**: `src/lib/music/instruments.ts` builds every sound from oscillators, noise and filters:
   - Karplus–Strong strings (guitar, banjo, upright bass)
   - 808s, organ, piano, e-piano, pads, supersaws, strings and brass
   - a formant "voice" lead and harmonica
   - textures: vinyl, rain, wind, drones
5. **Mix**: `src/lib/music/render.ts` has per-stem buses, reverb and delay sends, grit saturation, a glue compressor, a limiter and a soft clipper. Live playback and WAV export share the exact same graph.

### Song identity + arrangement timeline (prompt-framework style)
Every song has a tappable **Song identity** card, laid out in the order of a "universal AI music prompt framework":
Genre (substyle) · Mood · Core sound palette · Groove (BPM + feel/accents) · Opening · Development · Hook · Mix geometry · Vocal status · Avoid rules.
- **Avoid chips** (supersaws, 808s, choir, piano, risers, booms, orchestral swells, trap hats, festival builds, drums, vocals) and typed "no X" really remove those sounds from the arrangement, and Go wild respects them.
- The **timeline** has 9 sections: Intro · Verse A · Build · Hook · Dropout · Verse B · Bridge · Final Hook · Outro. Each section has written instruments / rhythm / production changes / role, and concrete rules:
  - the intro holds back
  - the build opens the filter, adds 16th hats and a shaker, and cuts the drums for one bar
  - the dropout removes the kick and most layers
  - Verse B changes the kick pattern, bass rhythm, percussion, lead register/instrument and stereo width
  - the bridge drops the kick and reduces harmony to root + fifth over a drone
  - the final hook adds an octave double, percussion and width (not just volume)
  - the outro removes layers in order
- Filter, resonance, stereo width (Haas side signal, mono-safe sub), saturation and the delay send are automated in Web Audio.
- A **recurring hook motif** (riff, bassline, chord stab, texture or rhythm) is introduced and carried through every hook.
- Tap a section in the strip to see its 4-part description and play from there.
- **Copy as prompt** gives a two-part text: a *Style prompt* (identity lines) and a *Timeline prompt* that starts with `[Global | instrumental | 90 BPM | 4/4 | … | mono sub | …]` and then has one bracket per section, written in production language only.

### Rhythm + harmony engine
- **Groove panel**: meters 4/4, 3/4, 6/8, 5/4, 7/8 and mixed bars (e.g. 4+4+3), additive accents (2+2+3), swing/shuffle, triplets/quintuplets/septuplets, polyrhythm (3:2, 3:4, 5:4…), polymeter that realigns at phrase ends, displacement, syncopation, clave (3-2/2-3), backbeat/halftime, humanize, glitch stutters, ostinato, call & response, breaks, isorhythm, hemiola, dotted rhythms, deconstruction and layered cycles. Odd meters keep a clear kick on beat 1.
- **Harmony panel**: all 7 modes (Ionian…Locrian) with the signature note used in the melody; chord colors (sus, 7ths, rich, power, diminished, augmented); named progressions (axis, doo-wop, Andalusian, 12-bar, modal vamps…); pedal, drone, modal interchange (borrowed chord) and chromatic tension. Style progressions are re-spelled diatonically for the chosen mode.
- **Endings**: ritard (tempo really slows), final hit, fade or hard cut.
- All of these terms are understood when typed into the prompt too.

### Go wild
**🔥 Go wild** fuses the base genre (delta blues by default) with a random EDM substyle and shows a **Producer breakdown**: fusion, BPM/key/mode, meter/rhythm logic, harmony, form, drums/bass, lead/chords, FX, ending, gear inspiration (real gear names as *flavor only*, not samples) and a vocal/lyric theme. Tap any row to change it. Changing a row locks it and rerolls the rest. 🔒 keeps a row as it is.

### Genres
House · Techno · Synthwave · Ambient · Trance / cyber-trance · Drum & bass · Folk / acoustic · Country rock · Rock · Blues · Lo-fi hip hop · Hip hop (boom bap) · Trap · Cinematic / orchestral · Jazz.

Each genre has its own tempo range, swing, drum patterns, progressions, modes, bass style, chord instrument and rhythm, lead instrument and textures.

### Nudges
- **Instant mix moves**: Space, Bass, Grit, Vocal character tone.
- **Recompose while playing, keeping your place in the song**: Drum feel (density, ghost notes, fills), Pulse (bass and arp drive), Genre pull (swaps organic and electronic instruments at the extremes), Vocal character (airy flute ↔ synth voice lead).

**Surprise** rerolls the melody, groove and arrangement but keeps the vibe.

### Export
**Mix (.wav)** or **Mix + stems (.zip)**: drums, bass, chords, lead and texture, rendered offline on the device at full length, 44.1 kHz/16-bit. The files are sample-aligned.

## Stack

- Next.js (App Router, static export) + TypeScript + Tailwind
- Web Audio API only
- PWA: `manifest.webmanifest` + service worker for Add to Home Screen

## Run locally

```bash
cd music-studio
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Tests (offline renders, no browser needed)

```bash
npx tsx scripts/plan-check.ts                    # what each prompt is understood as
npx tsx scripts/audio-test.ts [--wav] ["prompt"] # render + measure tempo/key/loudness/spectrum/clipping per section
npx tsx scripts/stem-balance.ts "prompt" ...     # per-stem levels in the chorus
npx tsx scripts/arrangement-check.ts             # meters/downbeats, mode pitch classes, avoid rules, Verse B vs A, sparse dropout/bridge, hook recurrence, endings, prompt format
npx tsx scripts/render-check.ts                  # 12 offline renders (Go wild ×5, 7/8, polyrhythm, Lydian drone…): clipping/NaN + section RMS
node scripts/browser-test.mjs http://localhost:3020/   # headless Chrome UI + export smoke test (serve out/ first)  (390×844 mobile viewport)
```

## Phone testing

Open the live URL below, then go to Share → **Add to Home Screen**. Browsers only start audio after a tap (Generate / Play). On iPhone, turn the ringer switch off silent, because iOS mutes Web Audio in silent mode.

## Limits (for now)

- Synthesized approximations, not recorded instruments. There are no real vocals; the "voice" lead is a formant synth.
- Prompt understanding is rule-based with a big synonym table, not a language model.
- Exporting a 60–90 s mix takes about 10–20 s on a laptop, and the stems zip takes several times longer. Phones are slower.
- Projects aren't saved yet. A song lives in the open tab.
- Gear names in Go wild are inspiration text only; nothing is sampled or modelled from them.
- The Timeline prompt is meant for pasting into other tools. Music Studio's own audio follows the same plan, but with its synth palette.
- Slow (non-wild) blues keeps a traditional 12-bar form instead of the 9-section timeline.

## Live site (GitHub Pages)

The site is a static export (`output: 'export'`) served by GitHub Pages from the `gh-pages` branch.

Deploy: `npm run deploy:pages` (builds with the `/music-studio` base path and force-pushes `out/` to `gh-pages`).

Auto-deploy on every push: `deploy/github-pages-workflow.yml` is ready. Move it to `.github/workflows/pages.yml` once the pushing token has the `workflow` scope (`gh auth refresh -h github.com -s workflow`), then switch Pages to "GitHub Actions" as the source.

- Live: https://henricksmedia.github.io/music-studio/
- The workflow sets `PAGES_BASE_PATH=/music-studio`; local dev runs at `/` with no base path.
- To preview the Pages build locally: `PAGES_BASE_PATH=/music-studio npm run build` and serve `out/`.

## Repo

GitHub home: `henricksmedia/music-studio`. On the shared machine, `unset GH_TOKEN` before pushing (use the `gh` login).
