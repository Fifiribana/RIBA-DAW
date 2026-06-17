import React from 'react';
import { Modal } from '../Modal';

export function DreamHistoryModal({ dreamHistory, onLoad, onClose }) {
  return (
    <Modal title="Dream History" onClose={onClose}>
      {dreamHistory.length === 0 ? (
        <div style={{ color: '#A1A1AA' }}>No dream tracks yet.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dreamHistory.map((d) => (
            <div key={d.id} style={{ background: '#09090B', borderRadius: 8, padding: 10, border: '1px solid rgba(217, 70, 239, 0.2)' }}>
              <div style={{ fontWeight: 600, color: '#D946EF' }}>{d.name}</div>
              <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>
                {new Date(d.created_at).toLocaleString()} · {d.notes.length} notes
              </div>
              <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 4, fontStyle: 'italic' }}>
                &ldquo;{d.prompt}&rdquo;
              </div>
              <button
                className="riba-btn"
                style={{ marginTop: 8, fontSize: 11 }}
                onClick={() => onLoad(d)}
              >Load to Project</button>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
