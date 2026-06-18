import React, { useEffect, useRef, useState } from 'react';

/**
 * RIBA SplashScreen — cinematic boot sequence.
 *
 * Layers (z-front-to-back):
 *   1. Pulsing RIBA logo (glow halo) + tagline
 *   2. Bantu Oral Grid bikutsi_44 animated asymmetric pulses
 *   3. Boot status lines (engine, demucs, fal.ai, bantu)
 *   4. Vertical grain + radial vignette + deep starfield
 *
 * Total duration ≈ 2.6 s. User can skip with click/keypress.
 * Calls onDone() exactly once, after fade-out.
 */
export function SplashScreen({ onDone, durationMs = 2600 }) {
  const [phase, setPhase] = useState('boot'); // 'boot' | 'fadeout' | 'hidden'
  const [statusIdx, setStatusIdx] = useState(0);
  const doneRef = useRef(false);
  const startRef = useRef(Date.now());

  const BOOT_LINES = [
    'init  · WebAudio engine ........... ok',
    'load  · Bantu Oral Grid (5 styles) . ok',
    'probe · fal.ai stable-audio ....... ok',
    'probe · Demucs htdemucs ........... ok',
    'ready · RIBA Studio ............... 100%',
  ];

  // sequential reveal of status lines
  useEffect(() => {
    const step = Math.max(120, durationMs / (BOOT_LINES.length + 4));
    const ids = BOOT_LINES.map((_, i) =>
      setTimeout(() => setStatusIdx(i + 1), step * (i + 1))
    );
    return () => ids.forEach(clearTimeout);
  }, [durationMs]);

  // global timeline: boot → fadeout → onDone
  useEffect(() => {
    const fadeAt = setTimeout(() => setPhase('fadeout'), durationMs);
    const doneAt = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      setPhase('hidden');
      onDone && onDone();
    }, durationMs + 700);
    return () => { clearTimeout(fadeAt); clearTimeout(doneAt); };
  }, [durationMs, onDone]);

  const skip = () => {
    if (Date.now() - startRef.current < 250) return; // ignore immediate clicks
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('hidden');
    onDone && onDone();
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' || e.key === ' ') skip(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (phase === 'hidden') return null;

  // Bikutsi 4/4 — 16 subdivisions with asymmetric swing offsets (mirror of bantuGrid.js).
  const swing = [0.0, 0.20, 0.40, 0.0, 0.20, 0.40, 0.0, 0.20];
  const positions = Array.from({ length: 16 }, (_, i) => {
    const base = i / 16;
    return Math.min(1, Math.max(0, base + (swing[i % 8] / 16)));
  });

  return (
    <div
      data-testid="riba-splash"
      onClick={skip}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#050507',
        color: '#FAFAFA',
        cursor: 'pointer',
        overflow: 'hidden',
        opacity: phase === 'fadeout' ? 0 : 1,
        transition: 'opacity 650ms cubic-bezier(.22,.61,.36,1)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Manrope, sans-serif',
      }}
    >
      {/* deep radial vignette */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        background: 'radial-gradient(ellipse at center, rgba(217,70,239,0.10) 0%, rgba(99,102,241,0.04) 35%, #050507 75%)',
      }} />
      {/* subtle grain (CSS noise via repeating-conic) */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
        backgroundImage:
          'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.7) 0deg 0.5deg, transparent 0.5deg 4deg)',
        mixBlendMode: 'overlay',
      }} />

      {/* core stack */}
      <div style={{
        position: 'relative', zIndex: 2,
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28,
      }}>
        {/* logo + halo */}
        <div style={{ position: 'relative', width: 132, height: 132 }}>
          <div className="riba-splash-halo" style={{
            position: 'absolute', inset: -22, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(217,70,239,0.55) 0%, rgba(99,102,241,0.30) 30%, transparent 65%)',
            filter: 'blur(18px)',
          }} />
          <img
            src="/riba-logo.png"
            alt="RIBA"
            width={132}
            height={132}
            style={{
              position: 'relative', borderRadius: '50%',
              boxShadow: '0 0 0 1.5px rgba(255,255,255,0.08), 0 0 48px rgba(217,70,239,0.45), inset 0 0 24px rgba(0,0,0,0.45)',
              animation: 'riba-pulse 2.2s ease-in-out infinite',
            }}
          />
        </div>

        {/* wordmark */}
        <div style={{ textAlign: 'center' }}>
          <div className="font-heading" style={{
            fontSize: 56, fontWeight: 900, letterSpacing: '0.42em',
            background: 'linear-gradient(180deg, #FAFAFA 0%, #A1A1AA 100%)',
            WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            paddingLeft: '0.42em',
            textShadow: '0 0 24px rgba(217,70,239,0.18)',
          }}>RIBA</div>
          <div className="font-mono-r" style={{
            fontSize: 10, letterSpacing: '0.46em', color: '#71717A',
            marginTop: 10, paddingLeft: '0.46em', fontWeight: 500,
          }}>
            BANTU&nbsp;·&nbsp;DIGITAL&nbsp;AUDIO&nbsp;WORKSTATION
          </div>
        </div>

        {/* Bantu Oral Grid asymmetric pulses (Bikutsi 4/4) */}
        <div
          data-testid="splash-bantu-grid"
          style={{
            position: 'relative', height: 38, width: 380,
            borderRadius: 4,
            background: 'linear-gradient(180deg, rgba(217,70,239,0.04), rgba(99,102,241,0.04))',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
          }}
        >
          {positions.map((p, i) => (
            <div key={i} style={{
              position: 'absolute', top: 4, bottom: 4,
              left: `${p * 100}%`, width: 2,
              background: i % 4 === 0
                ? 'linear-gradient(180deg, #D946EF, #6366F1)'
                : 'rgba(217,70,239,0.55)',
              transform: 'translateX(-1px)',
              borderRadius: 2,
              boxShadow: i % 4 === 0
                ? '0 0 8px rgba(217,70,239,0.7), 0 0 14px rgba(99,102,241,0.4)'
                : '0 0 4px rgba(217,70,239,0.4)',
              opacity: 0,
              animation: `riba-strike 2.2s linear infinite`,
              animationDelay: `${(p * 1.1).toFixed(3)}s`,
            }} />
          ))}
          {/* tempo guide */}
          {[0, 0.25, 0.5, 0.75].map((g, i) => (
            <div key={`g${i}`} style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${g * 100}%`, width: 1,
              background: 'rgba(255,255,255,0.05)',
            }} />
          ))}
        </div>

        {/* boot status lines */}
        <div
          data-testid="splash-boot-lines"
          style={{
            width: 380, minHeight: 110,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            color: '#A1A1AA', lineHeight: 1.7,
          }}
        >
          {BOOT_LINES.map((line, i) => (
            <div key={i} style={{
              opacity: i < statusIdx ? 1 : 0.0,
              transform: `translateX(${i < statusIdx ? 0 : -8}px)`,
              transition: 'opacity 360ms ease, transform 360ms ease',
              color: i < statusIdx ? (line.includes('100%') ? '#22D3EE' : '#71717A') : 'transparent',
            }}>
              <span style={{ color: '#52525B' }}>›&nbsp;</span>{line}
            </div>
          ))}
        </div>

        {/* progress bar */}
        <div style={{
          width: 380, height: 2, borderRadius: 2,
          background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
        }}>
          <div className="riba-splash-bar" style={{
            height: '100%',
            background: 'linear-gradient(90deg, #6366F1, #D946EF, #F59E0B)',
            animation: `riba-progress ${durationMs}ms cubic-bezier(.4,.0,.2,1) forwards`,
          }} />
        </div>

        <div className="font-mono-r" style={{
          fontSize: 9, color: '#3F3F46', letterSpacing: '0.32em', marginTop: 2,
        }}>CLICK · ESC · SPACE TO SKIP</div>
      </div>

      {/* keyframes injected once */}
      <style>{`
        @keyframes riba-pulse {
          0%,100% { transform: scale(1); filter: brightness(1); }
          50%     { transform: scale(1.04); filter: brightness(1.18); }
        }
        @keyframes riba-strike {
          0%, 100% { opacity: 0; transform: translateX(-1px) scaleY(0.85); }
          10%      { opacity: 1; transform: translateX(-1px) scaleY(1); }
          25%      { opacity: 0.45; transform: translateX(-1px) scaleY(0.92); }
          70%      { opacity: 0;   transform: translateX(-1px) scaleY(0.85); }
        }
        @keyframes riba-progress {
          0%   { width: 0%; }
          22%  { width: 35%; }
          55%  { width: 70%; }
          88%  { width: 92%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
}
