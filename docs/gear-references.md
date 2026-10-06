# Gear references: sources and key facts for the synthesized gear models

Companion to [`genre-expansion-plan.md`](genre-expansion-plan.md), section 6. Each gear model is a Web Audio re-creation of the instrument's sound engine, with no samples. This file records where each design fact comes from.

**Status (Oct 6, 2026): started, not yet verified online.** The agent that wrote this had no web access. Every source below is a well-known publication or manual, listed from memory with the facts the model needs from it. Before a model is built (phase 3 and later), whoever has web access should:

1. Open each source.
2. Confirm or correct each fact, and add the exact page or figure.
3. Change the row's status from **verify** to **verified**.

Numbers marked ≈ are design targets until verified.

## How to use this file

- One section per model, in the plan's priority order (section 6.3).
- **Facts** are what the synthesis code depends on: frequencies, slopes, times, topologies.
- **Sources** come in four kinds: service notes and owner's manuals, circuit analyses, published DSP models (DAFx, JAES, ICMC, CMJ papers), and reputable teardown and measurement articles.
- **No samples or ROM dumps.** Where the original instrument used samples (TR-909 cymbals), the model synthesizes an approximation and says so.

---

## Tier 1

### Roland TR-808

| Fact the model needs | Value | Status |
|---|---|---|
| Bass drum: bridged-T resonator excited by a trigger pulse; tone = pitch, decay = resonator damping, with a short pitch drop at the attack | topology | verify |
| Hi-hats and cymbal share a bank of 6 square-wave oscillators | ≈ 205.3, 304.4, 369.6, 522.7, 540, 800 Hz | verify |
| The metal bank feeds two bandpass filters (hats brighter than the cymbal), then a VCA per voice; open and closed hats share circuitry, so the closed hat chokes the open one | ≈ 7–8 kHz and ≈ 3.4 kHz centres | verify |
| Cowbell: two of the square oscillators through a bandpass and a two-stage envelope | ≈ 540 + 800 Hz | verify |
| Snare: two bridged-T "drum" resonators plus highpassed noise ("snappy") | ≈ 180 / 330 Hz | verify |
| Clap: noise burst retriggered 3–4 times by a sawtooth envelope, then a reverberant tail | timing | verify |

Sources to check:
- Roland TR-808 Service Notes (circuit diagrams for every voice).
- K. J. Werner, J. S. Abel, J. O. Smith, "A Physically-Informed, Circuit-Bendable, Digital Model of the Roland TR-808 Bass Drum Circuit," DAFx-14, 2014.
- K. J. Werner, J. S. Abel, J. O. Smith, "The TR-808 Cymbal: a Physically-Informed, Circuit-Bendable, Digital Model," ICMC/SMC 2014.
- K. J. Werner, PhD thesis, Stanford CCRMA (2016), wave digital filter models including the 808.

### Roland TR-909

| Fact | Value | Status |
|---|---|---|
| Kick, snare, toms and clap are analog: the kick is a VCO with a fast pitch envelope plus a noise/click attack shaped by "attack" and "decay" | topology | verify |
| **Hi-hats, crash and ride are 6-bit samples in ROM**, not analog. The model synthesizes a metallic oscillator bank plus noise and runs it through a 6-bit quantizer and lowpass to mimic the grit, with no ROM data | fact | verify |
| Snare: two tuned oscillators plus noise with "tone" and "snappy" | topology | verify |

Sources: Roland TR-909 Owner's Manual and Service Notes; teardown and measurement articles (e.g. Sound On Sound retrospectives).

### Roland TB-303

| Fact | Value | Status |
|---|---|---|
| One VCO: saw, or square derived from the saw | topology | verify |
| Filter: 4-pole diode ladder that measures closer to an 18 dB/oct slope near cutoff; resonance whistles but does not self-oscillate in the stock unit | ≈ 18–24 dB/oct | verify |
| Controls: cutoff, resonance, env mod, decay, accent | — | verify |
| **Accent** raises VCA level and filter envelope, shortens the filter decay, and accumulates over consecutive accented notes (the "wow" from the accent capacitor) | behavior | verify |
| **Slide**: portamento only between tied (slid) notes, at a fixed time constant | ≈ 60 ms | verify |

Sources:
- Roland TB-303 Service Notes.
- Robin Whittle, Devil Fish modification documentation (describes the stock slide, accent and filter behavior and the mods).
- T. E. Stinchcombe, "Analysis of the Moog Transistor Ladder and Derivative Filters" (2008), and his diode-ladder analyses.
- F. Fontana and others on diode-ladder modeling (DAFx).

### Roland Juno-106

| Fact | Value | Status |
|---|---|---|
| One DCO per voice: saw, pulse with PWM, sub-oscillator square one octave down, noise | topology | verify |
| 24 dB/oct OTA low-pass (the 80017A chip), plus a non-resonant high-pass with 4 steps | slope | verify |
| **Chorus I / II / both**: stereo BBD chorus, triangle LFO | ≈ 0.5 Hz (I), ≈ 0.8 Hz (II), with characteristic BBD hiss | verify |

Sources: Roland Juno-106 Owner's Manual and Service Notes (chorus circuit, BBD part numbers); Juno-60 Service Notes (same chorus family).

### Roland JP-8000 (supersaw)

| Fact | Value | Status |
|---|---|---|
| Seven saw oscillators per voice with a non-linear detune curve ("detune" knob) and a "mix" control balancing the centre saw against the side saws | 7 osc | verify |
| A high-pass tracking the pitch removes the low-end build-up of the detuned stack | behavior | verify |

Source: A. Szabo, "How to Emulate the Super Saw," KTH thesis, 2010 (measured detune and mix curves).

### Yamaha DX7

| Fact | Value | Status |
|---|---|---|
| 6 sine operators, 32 algorithms, one operator with self-feedback | topology | verify |
| Per-operator 4-rate / 4-level envelopes; velocity and keyboard scaling of output level, which sets the modulation index | behavior | verify |
| E.piano, bell and bass sounds come from ratios and index envelopes (e.g. 1:1 with a high-ratio "tine" modulator decaying fast). The patches are re-created from FM principles, not copied from ROM | approach | verify |

Sources: Yamaha DX7 Operating Manual (algorithm chart); J. Chowning, "The Synthesis of Complex Audio Spectra by Means of Frequency Modulation," JAES 21(7), 1973; J. Chowning & D. Bristow, *FM Theory and Applications* (1986).

### Moog Minimoog Model D

| Fact | Value | Status |
|---|---|---|
| 3 VCOs (triangle, saw-triangle, saw, three pulse widths), noise, mixer with external input (overdrive) | topology | verify |
| 24 dB/oct transistor ladder low-pass with resonance up to self-oscillation, and a filter contour | slope | verify |
| Glide on pitch | behavior | verify |

Sources: Minimoog Model D Owner's Manual and schematics; A. Huovilainen, "Non-linear Digital Implementation of the Moog Ladder Filter," DAFx-04, 2004; V. Välimäki & A. Huovilainen, "Oscillator and Filter Algorithms for Virtual Analog Synthesis," Computer Music Journal 30(2), 2006; V. Zavalishin, *The Art of VA Filter Design* (Native Instruments, 2012/2018) for the zero-delay-feedback form.

### Sequential Prophet-5

| Fact | Value | Status |
|---|---|---|
| 2 VCOs per voice (saw, triangle, pulse), OSC B can sync to A and act as a modulator through "poly-mod" | topology | verify |
| 24 dB/oct filter (SSM 2040 in Rev 1–2, CEM 3320 in Rev 3) | slope | verify |

Sources: Prophet-5 Owner's Manual and Service Manual (Rev 2 and Rev 3).

### Fender Rhodes

| Fact | Value | Status |
|---|---|---|
| A hammer strikes a tine coupled to a tonebar (an asymmetric tuning fork). An electromagnetic pickup senses tine motion; the pickup's position against the tine's swing creates the harmonic "bark" when played hard | physics | verify |
| Suitcase models add stereo tremolo (vibrato control) | behavior | verify |

Sources: Rhodes service manual; physical-modeling literature on the Rhodes and electromechanical pianos (e.g. DAFx papers on tine and pickup models).

### Hammond B-3 and Leslie 122

| Fact | Value | Status |
|---|---|---|
| Tonewheel generator; 9 drawbars at 16′, 5⅓′, 8′, 4′, 2⅔′, 2′, 1⅗′, 1⅓′, 1′ | footages | verify |
| Percussion: 2nd or 3rd harmonic, single-triggered, fast or slow decay; key click | behavior | verify |
| Leslie: rotating treble horn and bass drum through a crossover; chorale (slow) and tremolo (fast) speeds with different ramp-up times for horn and drum | ≈ horn 0.8 / 6.7 Hz | verify |

Sources: Hammond B-3 service manual; J. Pekonen, T. Pihlajamäki, V. Välimäki, "Computationally Efficient Hammond Organ Synthesis," DAFx-11, 2011; J. O. Smith, S. Serafin, J. Abel, D. Berners, "Doppler Simulation and the Leslie," DAFx-02, 2002; Leslie 122 service manual.

### Roland RE-201 Space Echo

| Fact | Value | Status |
|---|---|---|
| A tape loop with 1 record head and 3 playback heads; a 12-position mode selector combines heads with or without spring reverb | topology | verify |
| Repeat rate (tape speed), intensity (feedback), bass and treble on the repeats; wow and flutter; saturation when feedback is high | behavior | verify |

Sources: Roland RE-201 Owner's Manual and Service Notes.

### Spring, plate and gated reverb

| Fact | Value | Status |
|---|---|---|
| Spring: dispersive delay lines, so high frequencies arrive at different times (the "chirp" and "drip") | physics | verify |
| Plate (EMT 140): a dense, bright, fast-building tail with adjustable damping | behavior | verify |
| Gated reverb: a large room or plate tail cut by a noise gate after ≈ 250–350 ms (the 1980s gated snare) | ≈ times | verify |

Sources: V. Välimäki, J. Parker, J. S. Abel, "Parametric Spring Reverberation Effect," JAES 58(7/8), 2010; J. Parker, "Efficient Dispersion Generation Structures for Spring Reverb Emulation," EURASIP JASP, 2011; J. Dattorro, "Effect Design Part 1: Reverberator and Other Filters," JAES 45(9), 1997 (plate-class reverb); EMT 140 manual.

### E-mu SP-1200 and Akai MPC character

| Fact | Value | Status |
|---|---|---|
| SP-1200: 12-bit at ≈ 26.04 kHz, with output filtering that differs by channel | ≈ numbers | verify |
| MPC60/3000: 16-bit, with the swing setting (50–75%) that defines the groove | swing | verify |

Sources: SP-1200 and MPC60 owner's manuals.

## Tier 2 and 3 (to research)

| Model | Facts needed | Sources to find |
|---|---|---|
| Roland Alpha Juno 2 "hoover" | PWM saw stack with chorus and a downward pitch bend; associated with Joey Beltram's "Mentasm" (1991) | Alpha Juno manual; synth-history articles |
| Casio CZ (reese) | Phase-distortion engine; the reese is detuned saws with slow phase drift (Kevin Saunderson, "Just Want Another Chance", 1988) | CZ manual; production-history articles |
| LinnDrum, Oberheim DMX, TR-707 | Sample-based machines; the models will be synthesized approximations; gated snare usage | manuals; teardown articles |
| Korg M1 | ROM samples; organ bass and house piano are approximated by synthesis | M1 manual |
| Korg MS-20 | Sallen-Key / OTA filters with aggressive resonance | Stinchcombe, "A study of the Korg MS10 & MS20 filters" |
| NES 2A03 APU | Two pulse channels (12.5/25/50/75% duty), a 4-bit stepped triangle (32 steps), 15-bit LFSR noise (long and short modes), frame-sequencer envelopes | NESdev wiki (APU pages) |
| MOS 6581/8580 SID | 3 voices (saw, triangle, pulse, noise, combined waveforms), ring mod and sync, a 12 dB multimode filter with chip-to-chip variance | MOS 6581 datasheet; reSID (Dag Lem) |
| Amapiano log drum | Pitched, percussive bass with fast pitch drop and a wooden body; origin and typical patch to confirm | producer interviews and tutorials |
| Hardstyle kick chain | Kick plus distorted tonal tail (pitch-tracked), reverse-bass offbeat | producer tutorials |
| Clavinet, Wurlitzer, Mellotron | Clavinet: struck string with pickup and damping (Gabrielli et al., EURASIP JASP 2013, waveguide Clavinet model); Wurlitzer reed model; Mellotron tape-replay approximated by synthesis | papers and manuals |
| Guitar amps (Fender Twin, Marshall JCM800, fuzz, hi-gain) | Tube stage and tone-stack models, cabinet responses as synthesized IRs | D. Yeh's PhD thesis (Stanford, 2009) on guitar distortion circuits; tone-stack papers (DAFx) |
| Brass and sax sections, orchestral strings, timpani | Subtractive and physical-model approaches with breath and bow noise | CCRMA waveguide literature |
| Sitar, tabla, oud, darbuka, bansuri, harmonium, ney | Sitar jawari bridge buzz, tabla pitch bends and strokes, maqam tuning (quarter tones) | ethnomusicology and DSP papers (e.g. sitar bridge models at DAFx) |
