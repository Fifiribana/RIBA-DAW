import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';

export function ManualModal({ onClose }) {
  const { t } = useTranslation();
  const shortcutList = [
    { keys: 'Space', label: t('manual.shortcutList.space') },
    { keys: 'M',     label: t('manual.shortcutList.m') },
    { keys: '1–9',   label: t('manual.shortcutList.1to9') },
    { keys: 'Ctrl+S', label: t('manual.shortcutList.save') },
    { keys: 'Ctrl+O', label: t('manual.shortcutList.load') },
    { keys: 'Ctrl+E', label: t('manual.shortcutList.export') },
    { keys: 'F1',    label: t('manual.shortcutList.f1') },
  ];
  const featureKeys = [
    'multitrack', 'eq', 'mic', 'metro', 'dream',
    'stems', 'master', 'piano', 'spectrum', 'session',
  ];

  return (
    <Modal title={t('manual.title')} onClose={onClose}>
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
            {t('manual.subtitle')}
          </div>
          <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 6, maxWidth: 320 }}>
            {t('manual.desc')}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: '#E4E4E7', lineHeight: 1.7 }}>
        <h3 className="font-heading" style={{ marginTop: 0 }}>{t('manual.shortcuts')}</h3>
        <ul data-testid="manual-shortcut-list">
          {shortcutList.map((s, i) => (
            <li key={i}><b>{s.keys}</b> — {s.label}</li>
          ))}
        </ul>
        <h3 className="font-heading">{t('manual.features')}</h3>
        <ul data-testid="manual-feature-list">
          {featureKeys.map(k => (
            <li key={k}>{t(`manual.featureList.${k}`)}</li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
