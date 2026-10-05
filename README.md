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

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- **Web Audio API only** for generation (on-device). No ElevenLabs / Suno / MusicAPI.
- PWA: `manifest.webmanifest` + service worker for Add to Home Screen

## Run locally

```bash
cd music-studio
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm start
```

## Phone testing

1. Run `npm run dev` (or deploy a preview).
2. On the same network, open the machine’s LAN URL from your phone (Next prints it), **or** use a tunnel / Vercel preview once the repo is on GitHub.
3. Safari/Chrome → Share → **Add to Home Screen** for the PWA shell.

Audio needs a user tap (Generate / Play) — browsers require a gesture to unlock sound.

## What’s real vs stubbed

| Piece | Status |
|--------|--------|
| Intent → coherent local loop | **Real** (keyword lean + dimensions drive Web Audio) |
| Play / pause + waveform | **Real** |
| Live nudge rebuild | **Real** |
| Mix + stem WAV export | **Real** (short local Offline render) |
| Full ML / sample-accurate composition | **Not yet** — next step is on-device or self-hosted models, still no cloud music APIs |
| Cloud sync of projects | **Not yet** — local browser session for now |

## Repo

Intended GitHub home: `henricksmedia/music-studio` (or rename). Push only after `unset GH_TOKEN` and `gh` auth as needed on the shared machine.
