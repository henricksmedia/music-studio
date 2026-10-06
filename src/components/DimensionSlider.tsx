"use client";

type Props = {
  label: string;
  hint: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
};

export function DimensionSlider({
  label,
  hint,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <label className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-white">{label}</span>
        <span className="text-xs tabular-nums text-indigo-200/80">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-white/15 accent-indigo-400 disabled:opacity-40"
      />
      <span className="text-[11px] leading-snug text-white/60">{hint}</span>
    </label>
  );
}
