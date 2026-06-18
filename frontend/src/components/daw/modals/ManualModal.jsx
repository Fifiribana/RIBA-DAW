import React from 'react';
import { Modal } from '../Modal';

export function ManualModal({ onClose }) {
  return (
    <Modal title="Riba 12 · User Manual" onClose={onClose}>
      <div style={{
        display: 'flex', gap: 18, alignItems: 'center', justifyContent: 'center',
        padding: '8px 0 18px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 14,
      }}>
        <img
          src="/riba-logo.png"
          alt="RIBA logo"
          width={96}
          height={96}
          data-testid="manual-logo"
          style={{
            borderRadius: '50%',
            boxShadow: '0 0 24px rgba(217,70,239,0.55), 0 0 48px rgba(34,211,238,0.3)',
          }}
        />
        <div>
          <div className="font-heading" style={{ fontSize: 28, fontWeight: 800, color: '#FAFAFA', letterSpacing: '0.02em' }}>
            RIBA <span style={{ color: '#D946EF' }}>12</span>
          </div>
          <div style={{ fontSize: 11, color: '#22D3EE', letterSpacing: '0.18em', fontWeight: 600, marginTop: 2 }} className="font-mono-r">
            BANTU DIGITAL AUDIO WORKSTATION
          </div>
          <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 6, maxWidth: 320 }}>
            The world's first DAW with native asymmetric Bantu Oral Grid quantization (Asiko · Makossa · Bikutsi).
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#E4E4E7', lineHeight: 1.7 }}>
        <h3 className="font-heading" style={{ marginTop: 0 }}>Keyboard Shortcuts</h3>
        <ul>
          <li><b>Space</b> — Play / Stop all tracks</li>
          <li><b>M</b> — Toggle Metronome</li>
          <li><b>1–9</b> — Play track by index</li>
          <li><b>Ctrl+S</b> — Save session</li>
          <li><b>Ctrl+O</b> — Load latest session</li>
          <li><b>Ctrl+E</b> — Export session JSON</li>
          <li><b>F1</b> — Open this manual</li>
        </ul>
        <h3 className="font-heading">Features</h3>
        <ul>
          <li>Audio + MIDI multi-track playback (WebAudio)</li>
          <li>Per-track 3-band EQ, volume, pan, mute, solo</li>
          <li>Real microphone recording (MediaRecorder)</li>
          <li>Metronome with visual indicator & time signature</li>
          <li>Dream Track AI generation via Emergent LLM</li>
          <li>Magic12 stem separation (simulated)</li>
          <li>Magic12 AI mastering suggestions (LLM)</li>
          <li>Piano roll editor (click to add/remove notes)</li>
          <li>Spectrum analyzer & VU meters</li>
          <li>Session save/load (MongoDB-backed)</li>
        </ul>
      </div>
    </Modal>
  );
}
