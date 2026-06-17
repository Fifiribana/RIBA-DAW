import React from 'react';
import { Modal } from '../Modal';
import { GM_INSTRUMENTS } from '@/audio/instruments';
import { TID } from '@/constants/testIds';

export function GmInstrumentsModal({ selectedIdx, setSelectedIdx, onApply, onClose }) {
  return (
    <Modal title="General MIDI · 128 Instruments" onClose={onClose}>
      <div style={{ marginBottom: 10, color: '#A1A1AA', fontSize: 12 }}>
        Pick an instrument and apply to all MIDI tracks, or use per-track selector to set it individually.
      </div>
      <select
        data-testid={TID.gmSelect}
        value={selectedIdx}
        onChange={(e) => setSelectedIdx(parseInt(e.target.value))}
        size={14}
        style={{
          width: '100%', background: '#09090B', color: '#FAFAFA',
          border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
          padding: 6, fontSize: 13, fontFamily: 'JetBrains Mono, monospace'
        }}
      >
        {GM_INSTRUMENTS.map((ins, i) => (
          <option key={i} value={i}>{String(i + 1).padStart(3, '0')}. {ins.name}</option>
        ))}
      </select>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
        <button className="riba-btn" onClick={onClose}>Cancel</button>
        <button
          data-testid={TID.gmApply}
          className="riba-btn"
          style={{ background: 'linear-gradient(135deg, #D946EF, #6366F1)', color: '#fff', border: 'none' }}
          onClick={() => { onApply(selectedIdx); onClose(); }}
        >Apply to all MIDI</button>
      </div>
    </Modal>
  );
}
