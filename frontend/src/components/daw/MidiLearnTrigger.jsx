// RIBA · MIDI Learn context menu + status pill.
//
// `MidiLearnTrigger` wraps any controllable UI element. Right-click opens a
// floating menu with "Learn", "Unbind" and "Cancel" options. When learn is
// active, the wrapped element pulses magenta to give clear visual feedback.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMidiLearn } from '@/hooks/useMidiLearn';

export function MidiLearnTrigger({
  targetId,         // unique action key, e.g. 'master.volume', 'track.42.pan'
  label,            // human-readable label shown in the menu / status pill
  onApply,          // optional callback (kind, key, value) — used by Daw.jsx
  testid,           // base test-id (suffixed with -context-menu / -armed)
  children,
}) {
  const { t } = useTranslation();
  const { armed, assignments, arm, cancel, unbind } = useMidiLearn();
  const [menu, setMenu] = useState(null);  // {x, y} or null
  const wrapRef = useRef(null);
  const isArmed = armed?.targetId === targetId;
  const assignment = assignments[targetId];

  // Close menu on outside click.
  useEffect(() => {
    if (!menu) return undefined;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenu(null);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menu]);

  const handleContext = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const handleLearn = (e) => {
    e.stopPropagation();
    arm(targetId, label, onApply);
    setMenu(null);
  };
  const handleCancel = (e) => {
    e.stopPropagation();
    cancel();
    setMenu(null);
  };
  const handleUnbind = (e) => {
    e.stopPropagation();
    unbind(targetId);
    setMenu(null);
  };

  // Wrap children in a span that handles right-click + visual pulsing.
  return (
    <span
      ref={wrapRef}
      data-testid={testid ? `${testid}-midi-wrap` : undefined}
      data-midi-armed={isArmed ? 'true' : undefined}
      data-midi-target={targetId}
      onContextMenu={handleContext}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        outline: isArmed ? '2px solid #D946EF' : 'none',
        outlineOffset: isArmed ? 2 : 0,
        borderRadius: isArmed ? 4 : 0,
        boxShadow: isArmed
          ? '0 0 14px rgba(217,70,239,0.85), 0 0 4px rgba(217,70,239,0.55) inset'
          : 'none',
        transition: 'box-shadow 160ms ease-out, outline-color 160ms ease-out',
      }}
    >
      {children}
      {assignment && (
        <span
          data-testid={testid ? `${testid}-midi-badge` : undefined}
          className="font-mono-r"
          title={`${assignment.kind === 'cc' ? `CC ${assignment.key}` : `Note ${assignment.key}`} → ${label}`}
          style={{
            position: 'absolute',
            top: -8, right: -10,
            background: '#D946EF',
            color: '#fff',
            fontSize: 8,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: 3,
            letterSpacing: '0.06em',
            pointerEvents: 'none',
            border: '1px solid #1F1F23',
          }}
        >
          {assignment.kind === 'cc' ? `CC${assignment.key}` : `N${assignment.key}`}
        </span>
      )}

      {menu && (
        <div
          data-testid={testid ? `${testid}-midi-menu` : 'midi-learn-menu'}
          style={{
            position: 'fixed',
            left: menu.x, top: menu.y,
            background: '#1F1F23',
            border: '1px solid rgba(217,70,239,0.45)',
            borderRadius: 6,
            padding: 4,
            minWidth: 220,
            zIndex: 1000,
            boxShadow: '0 10px 26px rgba(0,0,0,0.65)',
          }}
        >
          <button
            data-testid={testid ? `${testid}-midi-learn-btn` : 'midi-learn-btn'}
            onClick={handleLearn}
            className="riba-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11, padding: '6px 10px', background: 'linear-gradient(135deg, #D946EF, #F59E0B)', color: '#fff' }}
          >
            🎹 {t('midi.learnNext')}
          </button>
          {assignment && (
            <button
              data-testid={testid ? `${testid}-midi-unbind-btn` : 'midi-unbind-btn'}
              onClick={handleUnbind}
              className="riba-btn"
              style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11, padding: '6px 10px', marginTop: 4 }}
            >
              ⌫ {t('midi.unbind')} · {assignment.kind === 'cc' ? `CC ${assignment.key}` : `Note ${assignment.key}`}
            </button>
          )}
          <button
            onClick={handleCancel}
            className="riba-btn"
            style={{ width: '100%', justifyContent: 'flex-start', fontSize: 11, padding: '6px 10px', marginTop: 4 }}
          >
            ✕ {t('midi.cancel')}
          </button>
          <div className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', padding: '4px 8px 2px', borderTop: '1px solid rgba(255,255,255,0.06)', marginTop: 4 }}>
            {label}
          </div>
        </div>
      )}
    </span>
  );
}

/** Floating learn-status pill (renders only while armed/saving/just-saved). */
export function MidiLearnPill() {
  const { t } = useTranslation();
  const { statusMsg, status, cancel } = useMidiLearn();
  if (!statusMsg) return null;
  const palette = {
    armed: 'linear-gradient(135deg, #D946EF, #F59E0B)',
    saving: '#3B82F6',
    saved: '#22C55E',
    error: '#EF4444',
    idle: '#27272A',
  };
  return (
    <div
      data-testid="midi-learn-pill"
      style={{
        position: 'fixed',
        bottom: 18, left: '50%', transform: 'translateX(-50%)',
        background: palette[status] || '#27272A',
        color: '#fff',
        padding: '8px 16px',
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
        zIndex: 999,
        display: 'flex', alignItems: 'center', gap: 10,
        pointerEvents: 'auto',
      }}
    >
      <span>{statusMsg}</span>
      {status === 'armed' && (
        <button
          data-testid="midi-learn-pill-cancel"
          onClick={cancel}
          className="riba-btn"
          style={{ fontSize: 10, padding: '3px 8px', background: 'rgba(0,0,0,0.35)', color: '#fff' }}
        >
          {t('midi.cancel')}
        </button>
      )}
    </div>
  );
}
