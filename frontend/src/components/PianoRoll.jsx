import React, { useEffect, useRef } from 'react';
import { TID } from '@/constants/testIds';

// Simple piano roll viewer/editor (display + click to add/remove note)
export default function PianoRoll({ track, onChange, onClose, onPlay, color = '#D946EF' }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);

  // grid params
  const minPitch = 36; // C2
  const maxPitch = 84; // C6
  const totalPitches = maxPitch - minPitch + 1; // 49
  const beats = 16;
  const rowHeight = 12;
  const colWidth = 36;

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const w = beats * colWidth;
    const h = totalPitches * rowHeight;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // background
    ctx.fillStyle = '#09090B';
    ctx.fillRect(0, 0, w, h);

    // horizontal stripes for black/white keys
    for (let i = 0; i < totalPitches; i++) {
      const pitch = maxPitch - i;
      const n = pitch % 12;
      const isBlack = [1, 3, 6, 8, 10].includes(n);
      ctx.fillStyle = isBlack ? '#0D0D11' : '#15151A';
      ctx.fillRect(0, i * rowHeight, w, rowHeight);
    }

    // vertical beat lines
    for (let b = 0; b <= beats; b++) {
      ctx.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
      ctx.fillRect(b * colWidth, 0, 1, h);
    }
    // horizontal pitch lines
    for (let i = 0; i <= totalPitches; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.fillRect(0, i * rowHeight, w, 1);
    }

    // notes
    const notes = track.midiNotes || [];
    for (const n of notes) {
      const row = maxPitch - n.pitch;
      if (row < 0 || row >= totalPitches) continue;
      const x = n.start * (colWidth / 1); // 1 beat = colWidth
      const wpx = Math.max(6, n.duration * colWidth - 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x + 1, row * rowHeight + 1, wpx, rowHeight - 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.4)';
      ctx.strokeRect(x + 1.5, row * rowHeight + 1.5, wpx - 1, rowHeight - 3);
    }
  };

  useEffect(() => { draw(); }, [track]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const row = Math.floor(y / rowHeight);
    const pitch = maxPitch - row;
    const beat = Math.floor(x / colWidth);

    // Check if click on existing note -> remove
    const notes = [...(track.midiNotes || [])];
    const idx = notes.findIndex(n =>
      n.pitch === pitch && beat >= n.start && beat < n.start + n.duration
    );
    if (idx >= 0) {
      notes.splice(idx, 1);
    } else {
      notes.push({ pitch, velocity: 100, start: beat, duration: 1 });
    }
    onChange(notes);
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
        zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)'
      }}
    >
      <div style={{
        background: '#18181B', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 12, padding: 18, width: 'min(900px, 92vw)', maxHeight: '88vh',
        display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div className="font-heading" style={{ fontSize: 20, fontWeight: 700 }}>
              Piano Roll
            </div>
            <div style={{ color: '#A1A1AA', fontSize: 12 }}>
              {track.displayName} · {(track.midiNotes || []).length} notes · click to add/remove
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="riba-btn"
              data-testid={TID.pianoRollPlay}
              onClick={onPlay}
            >▶ Play</button>
            <button
              className="riba-btn"
              data-testid={TID.pianoRollClose}
              onClick={onClose}
            >Close</button>
          </div>
        </div>
        <div
          ref={containerRef}
          style={{ overflow: 'auto', maxHeight: '70vh', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleClick}
            style={{ display: 'block', cursor: 'pointer' }}
          />
        </div>
        <div style={{ color: '#71717A', fontSize: 11 }} className="font-mono-r">
          C2 (36) bottom · C6 (84) top · 16 beats wide
        </div>
      </div>
    </div>
  );
}
