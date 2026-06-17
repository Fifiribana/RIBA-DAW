import React, { useEffect, useRef } from 'react';
import { computeBantuGrid, BANTU_STYLES } from './bantuGrid';

/**
 * BantuTeaser — animated mini visualization of an asymmetric Bantu groove.
 * - Cycles through the 5 styles every ~1.2s if `cycle` prop is true,
 *   otherwise renders the style passed via `style`.
 * - 200ms pulse animation loop highlights successive grid points.
 *
 * Used in MenuBar (Event → Quantize to Bantu Oral Grid teaser).
 */
export function BantuTeaser({ style, cycle = true, width = 60, height = 16 }) {
  const canvasRef = useRef(null);
  const styleIdxRef = useRef(0);
  const startedAtRef = useRef(performance.now());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    let raf = 0;
    const PULSE_MS = 200;
    const CYCLE_MS = 1400;

    const draw = (now) => {
      const elapsed = now - startedAtRef.current;
      if (cycle) {
        styleIdxRef.current = Math.floor(elapsed / CYCLE_MS) % BANTU_STYLES.length;
      }
      const cur = BANTU_STYLES[styleIdxRef.current] || BANTU_STYLES[0];
      const activeStyle = cycle ? cur.id : (style || 'bikutsi_44');
      const activeColor = cycle ? cur.color : '#A820FF';
      const beats = computeBantuGrid(activeStyle, 16, 1); // 16 points in 1 bar (4 beats)
      const totalBeats = 4;
      if (!beats || beats.length === 0) {
        ctx.clearRect(0, 0, width, height);
        raf = requestAnimationFrame(draw);
        return;
      }

      // Phase of pulse animation [0..1]
      const phase = ((elapsed % PULSE_MS) / PULSE_MS);
      const pulseIndex = Math.floor((elapsed / PULSE_MS) % beats.length);

      ctx.clearRect(0, 0, width, height);

      // baseline groove track
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, height / 2 - 0.5, width, 1);

      // pulse bars
      beats.forEach((b, i) => {
        const x = (b / totalBeats) * (width - 2) + 1;
        const isActive = i === pulseIndex;
        const intensity = isActive ? 1 - phase : 0.35;
        const h = isActive ? height * (0.55 + 0.45 * (1 - phase)) : height * 0.35;
        ctx.fillStyle = isActive ? activeColor : 'rgba(255,255,255,0.25)';
        ctx.globalAlpha = isActive ? intensity : 0.6;
        ctx.fillRect(x, (height - h) / 2, 1.5, h);
      });
      ctx.globalAlpha = 1;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [style, cycle, width, height]);

  return (
    <canvas
      ref={canvasRef}
      data-testid="bantu-teaser"
      style={{ width, height, display: 'inline-block', verticalAlign: 'middle', borderRadius: 2 }}
    />
  );
}
