import React, { useEffect, useRef } from 'react';

// Static waveform thumbnail rendered from a peaks array (0..1).
// `mode` ∈ {'peak','power','rectified','outlines','crossfades'} (Pro Tools-style)
export default function Waveform({
  peaks, color = '#3B82F6', height = 56, progress = 0, mode = 'peak'
}) {
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

    // background
    ctx.fillStyle = '#0B0B0E';
    ctx.fillRect(0, 0, w, h);

    const data = peaks && peaks.length ? peaks : new Array(80).fill(0.08);
    const step = w / data.length;
    const mid = h / 2;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;

    if (mode === 'outlines') {
      // Only top and bottom outline (no fill)
      ctx.globalAlpha = 0.95;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const barH = amp * (h * 0.85);
        const x = i * step + step / 2;
        if (i === 0) ctx.moveTo(x, mid - barH / 2);
        else ctx.lineTo(x, mid - barH / 2);
      }
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const barH = amp * (h * 0.85);
        const x = i * step + step / 2;
        if (i === 0) ctx.moveTo(x, mid + barH / 2);
        else ctx.lineTo(x, mid + barH / 2);
      }
      ctx.stroke();
    } else if (mode === 'rectified') {
      // Half-wave rectified upwards from baseline
      ctx.globalAlpha = 0.9;
      const baseY = h - 2;
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const barH = amp * (h * 0.92);
        const x = i * step;
        ctx.fillRect(x, baseY - barH, Math.max(1, step - 1), barH);
      }
    } else if (mode === 'power') {
      // amp² envelope, mid-centered, gradient stronger at center
      ctx.globalAlpha = 0.9;
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const power = amp * amp;
        const barH = power * (h * 0.95);
        const x = i * step;
        const grad = ctx.createLinearGradient(0, mid - barH / 2, 0, mid + barH / 2);
        grad.addColorStop(0, color + '88');
        grad.addColorStop(0.5, color);
        grad.addColorStop(1, color + '88');
        ctx.fillStyle = grad;
        ctx.fillRect(x, mid - barH / 2, Math.max(1, step - 1), barH);
      }
      ctx.fillStyle = color;
    } else if (mode === 'crossfades') {
      // Overlapping translucent bars suggesting crossfade region transitions
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const barH = amp * (h * 0.85);
        const x = i * step;
        ctx.globalAlpha = 0.45;
        ctx.fillRect(x, mid - barH / 2, Math.max(2, step + 1), barH);
        // shifted overlay
        ctx.globalAlpha = 0.25;
        ctx.fillRect(x + step * 0.5, mid - barH * 0.7 / 2, Math.max(2, step + 1), barH * 0.7);
      }
    } else {
      // 'peak' (default) — symmetrical bars
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < data.length; i++) {
        const amp = Math.max(0.04, Math.min(1, data[i]));
        const barH = amp * (h * 0.85);
        const x = i * step;
        ctx.fillRect(x, mid - barH / 2, Math.max(1, step - 1), barH);
      }
    }
    ctx.globalAlpha = 1;

    // progress overlay
    if (progress > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, 0, w * progress, h);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(w * progress - 1, 0, 2, h);
    }
  }, [peaks, color, height, progress, mode]);

  return <canvas ref={ref} style={{ width: '100%', height }} />;
}
