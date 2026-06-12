import React, { useEffect, useRef } from 'react';
import { engine } from '@/audio/engine';

// Real-time master VU meter (RMS based)
export default function VUMeter({ width = 220, height = 14, source = 'master', trackId = null }) {
  const ref = useRef(null);
  const rafRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    let smoothed = 0;
    const tick = () => {
      const lvl = source === 'track' && trackId
        ? engine.getTrackLevel(trackId)
        : engine.getMasterLevel();
      smoothed = smoothed * 0.7 + lvl * 0.3;
      const w = width;
      const h = height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0B0B0E';
      ctx.fillRect(0, 0, w, h);

      const fillW = Math.min(1, smoothed * 4) * w;
      // gradient green->yellow->red
      const grad = ctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#22C55E');
      grad.addColorStop(0.7, '#EAB308');
      grad.addColorStop(1, '#EF4444');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, fillW, h);

      // segment dividers
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      for (let i = 1; i < 20; i++) {
        ctx.fillRect((w / 20) * i, 0, 1, h);
      }

      // border
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height, source, trackId]);

  return <canvas ref={ref} style={{ width, height, display: 'block' }} />;
}
