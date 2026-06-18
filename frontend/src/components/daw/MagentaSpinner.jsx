import React from 'react';

/**
 * RIBA magenta loading spinner — used during AI inference (Demucs, fal.ai, LLM).
 * Three sizes via `size` prop. Optional `label` underneath.
 */
export function MagentaSpinner({ size = 32, label, testId = 'magenta-spinner' }) {
  const s = size;
  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-flex', flexDirection: 'column',
        alignItems: 'center', gap: 8,
      }}
      role="status"
      aria-label={label || 'Loading'}
    >
      <svg width={s} height={s} viewBox="0 0 50 50" aria-hidden="true">
        <defs>
          <linearGradient id="riba-spinner-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%"  stopColor="#D946EF" />
            <stop offset="50%" stopColor="#A855F7" />
            <stop offset="100%" stopColor="#F59E0B" />
          </linearGradient>
        </defs>
        <circle cx="25" cy="25" r="20" fill="none"
                stroke="rgba(217,70,239,0.15)" strokeWidth="4" />
        <circle cx="25" cy="25" r="20" fill="none"
                stroke="url(#riba-spinner-grad)" strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray="80 50"
                style={{
                  transformOrigin: 'center',
                  animation: 'riba-spin 1.1s linear infinite',
                  filter: 'drop-shadow(0 0 6px rgba(217,70,239,0.6))',
                }} />
      </svg>
      {label && (
        <div style={{
          fontSize: 11, color: '#D946EF', fontWeight: 600,
          letterSpacing: '0.05em', textShadow: '0 0 8px rgba(217,70,239,0.4)',
        }}>
          {label}
        </div>
      )}
      <style>{`
        @keyframes riba-spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

/** Full-page overlay version of the spinner, with backdrop blur. */
export function MagentaOverlay({ label = 'Working…', subtitle, testId = 'magenta-overlay' }) {
  return (
    <div
      data-testid={testId}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(10,10,12,0.72)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 16,
      }}
    >
      <MagentaSpinner size={56} label={label} />
      {subtitle && (
        <div style={{
          color: '#A1A1AA', fontSize: 12, fontStyle: 'italic',
          maxWidth: 360, textAlign: 'center',
        }}>{subtitle}</div>
      )}
    </div>
  );
}
