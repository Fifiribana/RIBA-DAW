import React from 'react';
import { Modal } from '../Modal';
import { FAKE_VST_PLUGINS } from '@/audio/instruments';

export function PluginsModal({ onClose }) {
  return (
    <Modal title="Plugins (Simulated VST list)" onClose={onClose}>
      <div style={{ color: '#A1A1AA', fontSize: 12, marginBottom: 10 }}>
        ⚠️ Simulated — web browsers cannot load native VST/AU plugins. This is a curated representative list.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 400, overflow: 'auto' }}>
        {FAKE_VST_PLUGINS.map((p, i) => (
          <div key={i} style={{
            background: '#09090B', borderRadius: 6, padding: '8px 10px',
            border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10
          }}>
            <div style={{
              background: '#27272A', color: '#A1A1AA', padding: '2px 6px',
              borderRadius: 3, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', minWidth: 36, textAlign: 'center'
            }}>{p.format}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
              <div style={{ fontSize: 10, color: '#71717A' }} className="font-mono-r">
                {p.vendor} · {p.category}
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#52525B' }} className="font-mono-r">{p.path}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
