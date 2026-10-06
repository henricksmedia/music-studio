"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Taps } from "@/lib/music/render";
import type { StemId } from "@/lib/music/compose";
import {
  COLORS,
  DB_CEIL,
  DB_FLOOR,
  MeterState,
  binColumns,
  columnDb,
  drawScope,
  freqData,
  getMode,
  getServerMode,
  heat,
  levels,
  meterPos,
  registerView,
  setMode,
  subscribeMode,
  timeData,
  xOfFreq,
  type DrawFn,
  type VisualMode,
} from "@/lib/visuals";

export const useVisualMode = () => useSyncExternalStore(subscribeMode, getMode, getServerMode);

/** Registers a canvas with the shared animation loop. `draw` may change every render. */
function useView(draw: DrawFn, deps: unknown[] = []) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const inv = useRef<() => void>(() => {});
  useEffect(() => {
    if (!ref.current) return;
    const v = registerView(ref.current, (c, w, h, f) => drawRef.current(c, w, h, f));
    inv.current = v.invalidate;
    return v.dispose;
  }, []);
  useEffect(() => {
    inv.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller-provided redraw triggers
  }, deps);
  return ref;
}

export const TRACK_COLORS: Record<StemId, string> = {
  drums: "rgba(251,191,36,0.9)",
  bass: "rgba(244,114,182,0.9)",
  harmony: "rgba(129,140,248,0.95)",
  lead: "rgba(103,232,249,0.9)",
  texture: "rgba(110,231,183,0.9)",
};

function idleLine(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.strokeStyle = "rgba(165,180,252,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = 0; x <= w; x += 3) {
    const y = h / 2 + Math.sin(x * 0.02) * 6 + Math.sin(x * 0.051) * 3;
    if (x === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

type ViewId = "scope" | "spectrum" | "spectrogram";
const VIEWS: { id: ViewId; label: string }[] = [
  { id: "scope", label: "Scope" },
  { id: "spectrum", label: "Spectrum" },
  { id: "spectrogram", label: "Spectrogram" },
];
const VIEW_KEY = "music-studio:visual-view";
const MODES: { id: VisualMode; label: string; hint: string }[] = [
  { id: "full", label: "Full", hint: "60 fps, sharp" },
  { id: "lite", label: "Lite", hint: "30 fps, lighter on battery" },
  { id: "off", label: "Off", hint: "No live visuals" },
];

const segCls = (on: boolean) =>
  `min-h-11 rounded-lg px-2.5 text-xs font-medium transition md:min-h-8 ${on ? "bg-white/15 text-white" : "text-white/60 hover:text-white"}`;

/** The centre visual: scope, spectrum or spectrogram of the master, plus a goniometer on wider screens. */
export function MasterVisual({ taps, playing }: { taps: Taps | null; playing: boolean }) {
  const mode = useVisualMode();
  const [view, setView] = useState<ViewId>("scope");
  useEffect(() => {
    const v = localStorage.getItem(VIEW_KEY);
    if (v === "scope" || v === "spectrum" || v === "spectrogram") setView(v);
  }, []);
  const pick = (v: ViewId) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };
  useEffect(() => {
    if (!taps) return;
    taps.master.fftSize = mode === "full" ? 8192 : 4096;
  }, [taps, mode]);

  const peaks = useRef<Float32Array | null>(null);
  const cols = useRef<{ key: string; c: [number, number][] } | null>(null);
  const rowBins = useRef<{ key: string; c: [number, number][] } | null>(null);
  const spec = useRef<{ off: HTMLCanvasElement; ctx: CanvasRenderingContext2D; w: number; h: number } | null>(null);
  const active = !!taps && playing && mode !== "off";

  const ref = useView(
    (ctx, w, h, f) => {
      ctx.clearRect(0, 0, w, h);
      if (!taps || mode === "off" || (!f.live && !active && view !== "spectrogram")) {
        if (view !== "spectrogram" || !spec.current) idleLine(ctx, w, h);
        else ctx.drawImage(spec.current.off, 0, 0, w, h);
        return;
      }
      if (view === "scope") {
        ctx.strokeStyle = COLORS.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();
        drawScope(ctx, w, h, timeData(taps.master), { lineWidth: f.lite ? 1.5 : 2 });
        return;
      }
      const freq = freqData(taps.master);
      const n = Math.max(32, Math.floor(w / (f.lite ? 4 : 2)));
      const key = `${n}:${freq.length}`;
      if (cols.current?.key !== key) cols.current = { key, c: binColumns(n, freq.length, taps.master.context.sampleRate) };
      const c = cols.current.c;
      const norm = (db: number) => Math.max(0, Math.min(1, (db - DB_FLOOR) / (DB_CEIL - DB_FLOOR)));
      if (view === "spectrum") {
        if (!peaks.current || peaks.current.length !== n) peaks.current = new Float32Array(n);
        const pk = peaks.current;
        // grid
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = "10px var(--font-geist-sans), system-ui";
        for (const [fq, lab] of [
          [50, "50"],
          [100, "100"],
          [200, ""],
          [500, "500"],
          [1000, "1k"],
          [2000, ""],
          [5000, "5k"],
          [10000, "10k"],
        ] as const) {
          const x = xOfFreq(fq, w);
          ctx.fillStyle = COLORS.grid;
          ctx.fillRect(x, 0, 1, h);
          if (lab) {
            ctx.fillStyle = "rgba(255,255,255,0.4)";
            ctx.fillText(lab, x + 3, h - 4);
          }
        }
        const grad = ctx.createLinearGradient(0, h, 0, 0);
        grad.addColorStop(0, "rgba(99,102,241,0.15)");
        grad.addColorStop(1, "rgba(236,72,153,0.55)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(0, h);
        const decay = (f.dt / 1000) * 0.35;
        for (let i = 0; i < n; i++) {
          const v = norm(columnDb(freq, c[i][0], c[i][1]));
          pk[i] = Math.max(v, pk[i] - decay);
          ctx.lineTo(((i + 0.5) / n) * w, h - v * h * 0.92);
        }
        ctx.lineTo(w, h);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = ((i + 0.5) / n) * w;
          const y = h - pk[i] * h * 0.92;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        return;
      }
      // spectrogram: scroll an offscreen image one column per frame
      const rows = Math.max(32, Math.floor(h / (f.lite ? 2 : 1)));
      const cw = Math.max(32, Math.floor(w / (f.lite ? 2 : 1)));
      let s = spec.current;
      if (!s || s.w !== cw || s.h !== rows) {
        const off = document.createElement("canvas");
        off.width = cw;
        off.height = rows;
        const octx = off.getContext("2d")!;
        octx.fillStyle = "rgb(10,10,30)";
        octx.fillRect(0, 0, cw, rows);
        s = spec.current = { off, ctx: octx, w: cw, h: rows };
      }
      if (f.live) {
        s.ctx.globalCompositeOperation = "copy";
        s.ctx.drawImage(s.off, -1, 0);
        s.ctx.globalCompositeOperation = "source-over";
        const col = s.ctx.createImageData(1, rows);
        const rkey = `${rows}:${freq.length}`;
        if (rowBins.current?.key !== rkey) rowBins.current = { key: rkey, c: binColumns(rows, freq.length, taps.master.context.sampleRate) };
        const rc = rowBins.current.c;
        for (let y = 0; y < rows; y++) {
          const [lo, hi] = rc[rows - 1 - y];
          const [r, g, b] = heat(norm(columnDb(freq, lo, hi)));
          col.data.set([r, g, b, 255], y * 4);
        }
        s.ctx.putImageData(col, cw - 1, 0);
      }
      ctx.imageSmoothingEnabled = !f.lite;
      ctx.drawImage(s.off, 0, 0, w, h);
    },
    [view, mode, taps, active]
  );

  return (
    <section className="overflow-hidden rounded-2xl border border-white/10 bg-black/40" data-testid="master-visual" aria-label="Live visuals">
      <div className="flex items-center justify-between gap-2 border-b border-white/5 px-1.5 py-1">
        <div className="flex min-w-0 gap-0.5" role="tablist" aria-label="Visual">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => pick(v.id)} className={segCls(view === v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="hidden items-center gap-0.5 md:flex" role="group" aria-label="Visual quality">
          {MODES.map((m) => (
            <button key={m.id} type="button" aria-pressed={mode === m.id} title={m.hint} onClick={() => setMode(m.id)} className={segCls(mode === m.id)}>
              {m.label}
            </button>
          ))}
        </div>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as VisualMode)}
          aria-label="Visual quality"
          className="min-h-11 shrink-0 rounded-lg border border-white/10 bg-transparent px-2 text-xs text-white/80 md:hidden"
        >
          {MODES.map((m) => (
            <option key={m.id} value={m.id} className="bg-[#11111a]">
              {m.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex">
        <div className="relative h-40 min-w-0 flex-1 sm:h-48 xl:h-52">
          <canvas ref={ref} className="absolute inset-0 h-full w-full" />
          {!active && (
            <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-[11px] text-white/60">
              {mode === "off" ? "Live visuals are off" : taps ? "Paused" : "Press Play to see the sound"}
            </p>
          )}
        </div>
        <Goniometer taps={taps} playing={playing} />
      </div>
    </section>
  );
}

/** Stereo picture (L−R vs L+R) with a correlation bar. Hidden on phones. */
function Goniometer({ taps, playing }: { taps: Taps | null; playing: boolean }) {
  const mode = useVisualMode();
  const corr = useRef(0);
  const ref = useView(
    (ctx, w, h, f) => {
      const barH = 14;
      const gh = h - barH - 6;
      if (!taps || mode === "off" || !f.live) {
        ctx.clearRect(0, 0, w, h);
      } else {
        ctx.fillStyle = "rgba(5,5,12,0.35)";
        ctx.fillRect(0, 0, w, gh);
        ctx.clearRect(0, gh, w, h - gh);
      }
      const cx = w / 2;
      const cy = gh / 2;
      const r = Math.min(cx, cy) - 4;
      ctx.strokeStyle = COLORS.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx - r, cy);
      ctx.lineTo(cx + r, cy);
      ctx.moveTo(cx, cy - r);
      ctx.lineTo(cx, cy + r);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "9px var(--font-geist-sans), system-ui";
      ctx.fillText("L", cx - r * 0.75, cy - r * 0.7);
      ctx.fillText("R", cx + r * 0.68, cy - r * 0.7);
      if (taps && mode !== "off" && f.live) {
        const L = timeData(taps.left);
        const R = timeData(taps.right);
        const stride = f.lite ? 4 : 2;
        let lr = 0;
        let ll = 0;
        let rr = 0;
        ctx.fillStyle = "rgba(196,181,253,0.55)";
        const k = r * 0.7071;
        for (let i = 0; i < L.length; i += stride) {
          const l = L[i];
          const rv = R[i];
          lr += l * rv;
          ll += l * l;
          rr += rv * rv;
          const x = cx + (rv - l) * k;
          const y = cy - (l + rv) * k;
          ctx.fillRect(x, y, 1.2, 1.2);
        }
        const c = ll > 1e-9 && rr > 1e-9 ? lr / Math.sqrt(ll * rr) : 0;
        corr.current += (c - corr.current) * 0.2;
      }
      // correlation bar −1 … +1
      const y = h - barH;
      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(4, y + 4, w - 8, 4);
      const cxp = 4 + ((corr.current + 1) / 2) * (w - 8);
      ctx.fillStyle = !f.live ? "rgba(255,255,255,0.25)" : corr.current < 0 ? "rgba(251,113,133,0.95)" : "rgba(110,231,183,0.95)";
      ctx.fillRect(cxp - 2, y + 1, 4, 10);
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      ctx.fillText("−1", 4, h);
      ctx.fillText("+1", w - 14, h);
    },
    [taps, mode, playing]
  );
  return (
    <div className="hidden w-40 shrink-0 border-l border-white/5 p-1.5 lg:block xl:w-44" title="Stereo field and phase correlation">
      <canvas ref={ref} className="h-full w-full" aria-label="Goniometer and correlation meter" role="img" />
    </div>
  );
}

/** Master peak/RMS meter (L and R) for the player bar. */
export function MasterMeter({ taps, className = "" }: { taps: Taps | null; className?: string }) {
  const mode = useVisualMode();
  const st = useRef([new MeterState(), new MeterState()]);
  const ref = useView(
    (ctx, w, h, f) => {
      ctx.clearRect(0, 0, w, h);
      const bars = [taps?.left, taps?.right];
      const bh = (h - 3) / 2;
      bars.forEach((a, i) => {
        const m = st.current[i];
        if (a && mode !== "off" && f.live) {
          const lv = levels(timeData(a), f.lite ? 4 : 2);
          m.update(lv.peak, lv.rms, f.now, f.dt);
        } else m.decay(f.now, f.dt);
        drawMeterBar(ctx, 0, i * (bh + 3), w, bh, m, f.now);
      });
    },
    [taps, mode]
  );
  return <canvas ref={ref} className={className} role="img" aria-label="Master level meter" />;
}

function drawMeterBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, m: MeterState, now: number) {
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(x, y, w, h);
  const clipW = 4;
  const usable = w - clipW - 2;
  const g = ctx.createLinearGradient(x, 0, x + usable, 0);
  g.addColorStop(0, "rgba(110,231,183,0.9)");
  g.addColorStop(0.75, "rgba(110,231,183,0.9)");
  g.addColorStop(0.88, "rgba(251,191,36,0.95)");
  g.addColorStop(1, "rgba(251,113,133,1)");
  ctx.fillStyle = g;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(x, y, usable * meterPos(m.peakDb), h);
  ctx.globalAlpha = 1;
  ctx.fillRect(x, y, usable * meterPos(m.rmsDb), h);
  if (m.holdDb > -48) {
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillRect(x + usable * meterPos(m.holdDb) - 1, y, 1.5, h);
  }
  ctx.fillStyle = now < m.clipUntil ? "rgba(251,113,133,1)" : "rgba(255,255,255,0.12)";
  ctx.fillRect(x + w - clipW, y, clipW, h);
}

/** A track's mini scope with its level along the bottom. */
export function TrackScope({ taps, id, muted }: { taps: Taps | null; id: StemId; muted: boolean }) {
  const mode = useVisualMode();
  const st = useRef(new MeterState());
  const ref = useView(
    (ctx, w, h, f) => {
      ctx.clearRect(0, 0, w, h);
      const a = taps?.tracks[id];
      const on = !!a && mode !== "off" && f.live;
      if (on) {
        const d = timeData(a!);
        drawScope(ctx, w, h - 4, d, { color: TRACK_COLORS[id], lineWidth: 1.25, gain: 1.6 });
        const lv = levels(d, f.lite ? 4 : 2);
        st.current.update(lv.peak, lv.rms, f.now, f.dt);
      } else {
        st.current.decay(f.now, f.dt);
        ctx.strokeStyle = "rgba(255,255,255,0.12)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, (h - 4) / 2);
        ctx.lineTo(w, (h - 4) / 2);
        ctx.stroke();
      }
      drawMeterBar(ctx, 0, h - 3, w, 3, st.current, f.now);
    },
    [taps, mode, muted]
  );
  return <canvas ref={ref} className="h-7 w-full" role="img" aria-label="Track scope and level" />;
}
