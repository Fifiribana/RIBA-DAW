// RIBA · Visual Quantize Overlay (Sprint v3.10)
//
// Renders a thin horizontal strip just under the timeline showing the latest
// 12 MIDI note onsets. Each event draws TWO halos:
//   • magenta (#D946EF) at the *raw* wall-beat position
//   • amber  (#F59E0B) at the *quantised* Bantu Oral Grid position
// The connecting tick line makes the swing offset visible at a glance.
//
// The overlay is fed via a callback registered by Daw.jsx — keeps the
// component pure UI (no MIDI logic of its own).

import React, { useEffect, useImperativeHandle, useState, forwardRef } from 'react';
import { useTranslation } from 'react-i18next';

const FADE_MS = 4000;
const MAX_EVENTS = 12;

export const VisualQuantizeOverlay = forwardRef(function VisualQuantizeOverlay(
  { visible = true, barLength = 1 },
  ref,
) {
  const { t } = useTranslation();
  const [events, setEvents] = useState([]);

  useImperativeHandle(ref, () => ({
    push(rawBeat, quantizedBeat, pitch) {
      const now = Date.now();
      setEvents((prev) => {
        const next = [
          { id: now + Math.random(), at: now, raw: rawBeat, quant: quantizedBeat, pitch },
          ...prev,
        ].slice(0, MAX_EVENTS);
        return next;
      });
    },
  }), []);

  // Decay loop: drops events older than FADE_MS to keep the strip airy.
  useEffect(() => {
    if (events.length === 0) return undefined;
    const id = setInterval(() => {
      const cutoff = Date.now() - FADE_MS;
      setEvents((prev) => prev.filter((e) => e.at > cutoff));
    }, 500);
    return () => clearInterval(id);
  }, [events.length]);

  if (!visible) return null;
  const safeBar = Math.max(0.5, barLength || 1);

  return (
    <div
      data-testid="visual-quantize-overlay"
      data-event-count={events.length}
      style={{
        position: 'relative',
        height: 26,
        margin: '0 12px 6px 12px',
        background: 'linear-gradient(180deg, rgba(217,70,239,0.04), rgba(245,158,11,0.04))',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 4,
        overflow: 'hidden',
      }}
    >
      {/* Mini caption */}
      <div
        className="font-mono-r"
        style={{
          position: 'absolute', top: 4, left: 8,
          fontSize: 8, color: '#A1A1AA', letterSpacing: '0.08em', pointerEvents: 'none',
        }}
      >
        {t('midi.quantize.label')} · {t('midi.quantize.legend')}
      </div>

      {events.length === 0 ? (
        <div
          data-testid="visual-quantize-empty"
          className="font-mono-r"
          style={{
            position: 'absolute', top: '50%', right: 10,
            transform: 'translateY(-50%)',
            fontSize: 9, color: '#52525B',
          }}
        >
          {t('midi.quantize.empty')}
        </div>
      ) : null}

      {events.map((e) => {
        const age = Date.now() - e.at;
        const alpha = Math.max(0, 1 - age / FADE_MS);
        // Wrap into the current bar
        const rawPos = ((e.raw % safeBar) / safeBar) * 100;
        const quantPos = ((e.quant % safeBar) / safeBar) * 100;
        return (
          <React.Fragment key={e.id}>
            {/* Raw onset halo (magenta) */}
            <span
              data-testid="visual-quantize-raw"
              style={{
                position: 'absolute', top: 14, left: `${rawPos}%`,
                width: 8, height: 8, borderRadius: '50%',
                background: '#D946EF',
                opacity: alpha * 0.85,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 6px rgba(217,70,239,0.55)',
                pointerEvents: 'none',
              }}
            />
            {/* Quantised onset halo (amber) */}
            <span
              data-testid="visual-quantize-quant"
              style={{
                position: 'absolute', top: 14, left: `${quantPos}%`,
                width: 10, height: 10, borderRadius: '50%',
                background: '#F59E0B',
                opacity: alpha,
                transform: 'translateX(-50%)',
                boxShadow: '0 0 10px rgba(245,158,11,0.85)',
                border: '1px solid rgba(255,255,255,0.25)',
                pointerEvents: 'none',
              }}
            />
            {/* Connecting tick — emphasises the swing offset */}
            <span
              style={{
                position: 'absolute', top: 18,
                left:  `${Math.min(rawPos, quantPos)}%`,
                width: `${Math.abs(quantPos - rawPos)}%`,
                height: 1,
                background: 'rgba(245,158,11,0.4)',
                opacity: alpha,
                pointerEvents: 'none',
              }}
            />
          </React.Fragment>
        );
      })}
    </div>
  );
});

VisualQuantizeOverlay.displayName = 'VisualQuantizeOverlay';
