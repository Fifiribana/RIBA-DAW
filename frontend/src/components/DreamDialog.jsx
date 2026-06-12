import React, { useState } from 'react';
import { TID } from '@/constants/testIds';
import { Sparkle } from '@phosphor-icons/react';

const PRESETS = [
  "A dreamy ambient piano melody in C minor with ethereal pads",
  "Upbeat synthwave bassline with arpeggiated leads",
  "Lo-fi hip-hop chord progression with mellow vibes",
  "Cinematic strings, slow and emotional in D minor",
  "Bouncy funk bassline groove in A minor",
  "Mysterious oriental scale with sparse plucks",
];

export default function DreamDialog({ open, onClose, onGenerate, generating, progress, tempo }) {
  const [prompt, setPrompt] = useState(PRESETS[0]);
  if (!open) return null;
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget && !generating) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)'
      }}
    >
      <div style={{
        width: 'min(560px, 92vw)', background: '#18181B',
        border: '1px solid rgba(217, 70, 239, 0.4)', borderRadius: 14,
        padding: 22, boxShadow: '0 0 60px rgba(217, 70, 239, 0.2)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'linear-gradient(135deg, #D946EF, #6366F1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Sparkle size={20} weight="fill" color="#fff" />
          </div>
          <div>
            <div className="font-heading" style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>
              Dream Track
            </div>
            <div style={{ color: '#A1A1AA', fontSize: 12 }}>
              Describe your dream, AI composes a MIDI melody
            </div>
          </div>
        </div>

        <textarea
          data-testid={TID.dreamPromptInput}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={generating}
          rows={3}
          style={{
            width: '100%', background: '#09090B', color: '#fff',
            border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
            padding: 10, fontSize: 13, fontFamily: 'Manrope, sans-serif', resize: 'none'
          }}
          placeholder="A calm piano in C minor with ethereal pads..."
        />

        <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {PRESETS.map((p, i) => (
            <button
              key={i}
              onClick={() => setPrompt(p)}
              disabled={generating}
              style={{
                background: 'transparent', color: '#A1A1AA',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 999,
                padding: '4px 10px', fontSize: 11, cursor: 'pointer',
                fontFamily: 'Manrope, sans-serif'
              }}
            >
              {p.slice(0, 28)}{p.length > 28 ? '…' : ''}
            </button>
          ))}
        </div>

        {generating ? (
          <div style={{ marginTop: 16 }}>
            <div style={{
              height: 8, background: '#27272A', borderRadius: 4, overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${progress}%`,
                background: 'linear-gradient(90deg, #D946EF, #6366F1)',
                transition: 'width 0.2s ease-out'
              }} />
            </div>
            <div style={{ marginTop: 8, color: '#A1A1AA', fontSize: 12 }} className="font-mono-r">
              Composing... {progress}%
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button
              data-testid={TID.dreamCloseBtn}
              className="riba-btn"
              onClick={onClose}
            >Cancel</button>
            <button
              data-testid={TID.dreamGenerateConfirm}
              className="riba-btn"
              style={{
                background: 'linear-gradient(135deg, #D946EF, #6366F1)',
                color: '#fff', border: 'none'
              }}
              onClick={() => onGenerate(prompt, tempo)}
              disabled={!prompt.trim()}
            >
              <Sparkle size={14} weight="fill" /> Generate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
