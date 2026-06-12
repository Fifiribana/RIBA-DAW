import React, { useEffect, useRef } from 'react';
import { engine } from '@/audio/engine';

// Realtime spectrum bars from master analyser
export default function Spectrum({ width = '100%', height = 70, bins = 56 }) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.max(100, r.width) * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(100, r.width);
      const h = height;
      ctx.clearRect(0, 0, w, h);

      // background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0E0E12');
      grad.addColorStop(1, '#09090B');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      const data = engine.getMasterSpectrum(bins);
      const barW = w / bins;
      for (let i = 0; i < bins; i++) {
        const v = data[i] || 0;
        const bh = Math.max(2, v * (h - 4));
        const t = i / bins;
        let color;
        if (t < 0.33) color = '#22C55E';
        else if (t < 0.66) color = '#EAB308';
        else color = '#EF4444';
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(i * barW + 1, h - bh, barW - 2, bh);
      }
      ctx.globalAlpha = 1;

      rafRef.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [bins, height]);

  return <canvas ref={ref} style={{ width, height, display: 'block', borderRadius: 6 }} />;
}
