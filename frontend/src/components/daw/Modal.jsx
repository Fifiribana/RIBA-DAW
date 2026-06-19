import React, { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

export function Modal({ title, onClose, children, width = 600 }) {
  const { t } = useTranslation();
  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)'
      }}>
      <div style={{
        background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        width: `min(${width}px, 92vw)`, maxHeight: '85vh', padding: 22,
        display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="font-heading" style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <button className="riba-btn" onClick={onClose} data-testid="modal-close-btn">{t('common.close')}</button>
        </div>
        <div style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}

export function SetupRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '1px solid rgba(255,255,255,0.04)', paddingBottom: 6
    }}>
      <span style={{ color: '#A1A1AA' }}>{label}</span>
      <span className="font-mono-r" style={{ color: '#FAFAFA', fontSize: 12 }}>{value}</span>
    </div>
  );
}
