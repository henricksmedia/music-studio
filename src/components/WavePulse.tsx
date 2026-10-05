"use client";

import { useEffect, useRef } from "react";

type Props = {
  analyser: AnalyserNode | null;
  active: boolean;
};

export function WavePulse({ analyser, active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const { width, height } = canvas;
      ctx.clearRect(0, 0, width, height);

      // backdrop glow
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, "rgba(99, 102, 241, 0.15)");
      grad.addColorStop(1, "rgba(236, 72, 153, 0.12)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      if (analyser && active) {
        const data = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteTimeDomainData(data);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(244, 244, 255, 0.9)";
        ctx.beginPath();
        const slice = width / data.length;
        for (let i = 0; i < data.length; i++) {
          const v = data[i] / 128.0;
          const y = (v * height) / 2;
          const x = i * slice;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        // frequency bars (soft)
        const freq = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(freq);
        const bars = 48;
        const step = Math.floor(freq.length / bars);
        for (let i = 0; i < bars; i++) {
          const val = freq[i * step] / 255;
          const bh = val * height * 0.45;
          const bw = width / bars - 2;
          const x = i * (width / bars);
          ctx.fillStyle = `rgba(129, 140, 248, ${0.15 + val * 0.5})`;
          ctx.fillRect(x, height - bh, bw, bh);
        }
      } else {
        // idle pulse
        const t = Date.now() / 1000;
        ctx.strokeStyle = "rgba(165, 180, 252, 0.45)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x < width; x++) {
          const y =
            height / 2 +
            Math.sin(x * 0.02 + t * 1.5) * 8 +
            Math.sin(x * 0.05 + t) * 4;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      canvas.width = parent.clientWidth * devicePixelRatio;
      canvas.height = parent.clientHeight * devicePixelRatio;
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      canvas.style.width = `${parent.clientWidth}px`;
      canvas.style.height = `${parent.clientHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    draw();
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [analyser, active]);

  return (
    <div className="relative h-40 w-full overflow-hidden rounded-2xl border border-white/10 bg-black/40 sm:h-52">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
