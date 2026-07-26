import React from 'react';

export const formatDb = (value) => `${Number.isFinite(value) ? value.toFixed(1) : '-60.0'} dB`;
export const formatLufs = (value) => `${Number.isFinite(value) ? value.toFixed(1) : '—'} LUFS`;

export function HorizontalMeter({ value = -60, peak = value, compact = false, label }) {
  const percent = Math.max(0, Math.min(100, ((value + 60) / 60) * 100));
  const peakPercent = Math.max(0, Math.min(100, ((peak + 60) / 60) * 100));
  return (
    <div className={`horizontal-meter ${compact ? 'compact' : ''}`} aria-label={`${label || 'Audio'} level ${formatDb(value)}`}>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${percent}%` }} />
        <span className="meter-peak" style={{ left: `${peakPercent}%` }} />
      </div>
    </div>
  );
}

export function VerticalMeter({ value = -60, label = 'L', peak = value }) {
  const percent = Math.max(0, Math.min(100, ((value + 60) / 60) * 100));
  const peakPercent = Math.max(0, Math.min(100, ((peak + 60) / 60) * 100));
  return (
    <div className="vertical-meter-wrap">
      <div className="vertical-meter" aria-label={`${label} ${formatDb(value)}`}>
        <div className="vertical-fill" style={{ height: `${percent}%` }} />
        <span className="vertical-peak" style={{ bottom: `${peakPercent}%` }} />
        <div className="meter-grid" />
      </div>
      <span className="vertical-label">{label}</span>
    </div>
  );
}
