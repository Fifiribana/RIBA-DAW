import React from 'react';
import { Modal } from '../Modal';

export function ManualModal({ onClose }) {
  return (
    <Modal title="Riba 12 · User Manual" onClose={onClose}>
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
