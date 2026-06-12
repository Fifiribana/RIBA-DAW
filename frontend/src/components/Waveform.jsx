import React, { useEffect, useRef } from 'react';

// Static SVG waveform thumbnail rendered from a peaks array (0..1)
export default function Waveform({ peaks, color = '#3B82F6', height = 56, progress = 0 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(60, Math.floor(rect.width));
    const h = height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    // background grid
    ctx.fillStyle = '#0B0B0E';
    ctx.fillRect(0, 0, w, h);

    const data = peaks && peaks.length ? peaks : new Array(80).fill(0.08);
    const step = w / data.length;
    const mid = h / 2;
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    for (let i = 0; i < data.length; i++) {
      const amp = Math.max(0.04, Math.min(1, data[i]));
      const barH = amp * (h * 0.85);
      const x = i * step;
      ctx.fillRect(x, mid - barH / 2, Math.max(1, step - 1), barH);
    }
    ctx.globalAlpha = 1;

    // progress overlay
    if (progress > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, w * progress, h);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(w * progress - 1, 0, 2, h);
    }
  }, [peaks, color, height, progress]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
}
