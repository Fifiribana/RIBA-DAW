import React from 'react';
import { Modal } from '../Modal';

export function MasteringModal({ loading, suggestions, onClose }) {
  return (
    <Modal title="Magic12 · AI Mastering" onClose={onClose}>
      {loading ? (
        <div style={{ color: '#A1A1AA', textAlign: 'center', padding: 20 }}>
          <div className="font-heading" style={{ fontSize: 16 }}>Analyzing mix…</div>
          <div style={{ marginTop: 16, height: 6, background: '#27272A', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: 'linear-gradient(90deg, #D946EF, #6366F1)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      ) : (
        <pre style={{ whiteSpace: 'pre-wrap', color: '#E4E4E7', fontSize: 13, fontFamily: 'Manrope, sans-serif', lineHeight: 1.6 }}>
          {suggestions}
        </pre>
      )}
    </Modal>
  );
}
