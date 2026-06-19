import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { MANUAL_SECTIONS } from './manualSections';

/**
 * Rich, interactive, multilingual user manual.
 *
 *  - left column : section navigation (Phoenix-themed pills with icons)
 *  - right column : content for the active section (intro + bullets + tip)
 *  - footer : keyboard shortcuts + features list (kept from the v3.2 manual)
 *
 * All copy is sourced from `t('manual.sections.<id>.*')` so the manual stays
 * in lockstep with the 5 supported locales (fr/en/es/pt/sw).
 */
export function ManualModal({ onClose }) {
  const { t } = useTranslation();
  const [activeId, setActiveId] = useState(MANUAL_SECTIONS[0].id);
  const active = MANUAL_SECTIONS.find(s => s.id === activeId) || MANUAL_SECTIONS[0];
  const accent = '#D946EF';

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
    <Modal title={t('manual.title')} onClose={onClose} width={920}>
      {/* === Hero === */}
      <div style={{
        display: 'flex', gap: 18, alignItems: 'center',
        padding: '8px 0 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 14,
      }}>
        <img
          src="/riba-logo.png"
          alt="RIBA logo"
          width={88}
          height={88}
          data-testid="manual-logo"
          style={{
            borderRadius: '50%',
            boxShadow: '0 0 22px rgba(217,70,239,0.55), 0 0 44px rgba(34,211,238,0.28)',
          }}
        />
        <div>
          <div className="font-heading" style={{ fontSize: 26, fontWeight: 800, color: '#FAFAFA', letterSpacing: '0.02em' }}>
            RIBA <span style={{ color: accent }}>12</span>
          </div>
          <div className="font-mono-r" style={{ fontSize: 11, color: '#22D3EE', letterSpacing: '0.18em', fontWeight: 600, marginTop: 2 }}>
            {t('manual.subtitle')}
          </div>
          <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 6, maxWidth: 540 }}>
            {t('manual.desc')}
          </div>
        </div>
      </div>

      {/* === Section navigator + content === */}
      <div data-testid="manual-rich-layout" style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 16 }}>
        {/* Left rail */}
        <div data-testid="manual-section-nav" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {MANUAL_SECTIONS.map(s => {
            const on = s.id === activeId;
            return (
              <button
                key={s.id}
                data-testid={`manual-section-btn-${s.id}`}
                onClick={() => setActiveId(s.id)}
                style={{
                  textAlign: 'left',
                  background: on ? `${accent}1A` : 'transparent',
                  border: '1px solid',
                  borderColor: on ? `${accent}80` : 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  padding: '10px 12px',
                  cursor: 'pointer',
                  color: on ? '#FAFAFA' : '#A1A1AA',
                  fontFamily: 'Manrope, sans-serif',
                  fontSize: 12,
                  fontWeight: on ? 700 : 500,
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: 'background 160ms ease, border-color 160ms ease',
                }}
              >
                <span style={{ fontSize: 16, lineHeight: 1 }}>{s.icon}</span>
                <span style={{ flex: 1, lineHeight: 1.25 }}>
                  {t(`manual.sections.${s.id}.title`)}
                </span>
                {on && <span style={{ color: accent, fontSize: 10 }}>▸</span>}
              </button>
            );
          })}
        </div>

        {/* Right content */}
        <div data-testid="manual-section-content" key={activeId}
          style={{
            background: 'rgba(11,11,14,0.6)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 12,
            padding: 18,
            animation: 'manual-fadein 240ms ease',
          }}>
          <div className="font-heading" style={{
            fontSize: 20, fontWeight: 800, color: '#FAFAFA',
            display: 'flex', alignItems: 'center', gap: 10,
            marginBottom: 6,
          }}>
            <span style={{ fontSize: 22 }}>{active.icon}</span>
            {t(`manual.sections.${active.id}.title`)}
          </div>
          <div style={{ color: '#D4D4D8', fontSize: 13, lineHeight: 1.65, marginBottom: 12 }}>
            {t(`manual.sections.${active.id}.intro`)}
          </div>
          <ul style={{
            color: '#E4E4E7', fontSize: 12.5, lineHeight: 1.75,
            paddingLeft: 22, margin: '6px 0 14px',
          }}>
            {Array.from({ length: active.bullets }, (_, i) => i + 1).map((idx) => (
              <li key={idx} data-testid={`manual-bullet-${active.id}-${idx}`}>
                {t(`manual.sections.${active.id}.b${idx}`)}
              </li>
            ))}
          </ul>
          <div data-testid={`manual-tip-${active.id}`} style={{
            background: 'linear-gradient(135deg, rgba(34,211,238,0.10), rgba(217,70,239,0.08))',
            border: '1px solid rgba(34,211,238,0.25)',
            borderRadius: 8, padding: '10px 12px',
            color: '#A5F3FC', fontSize: 12,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ fontSize: 14, marginTop: -1 }}>💡</span>
            <div>
              <span style={{
                color: '#22D3EE', fontWeight: 700, marginRight: 6,
                textTransform: 'uppercase', letterSpacing: '0.10em', fontSize: 10,
              }}>{t('common.tips')}</span>
              {t(`manual.sections.${active.id}.tip`)}
            </div>
          </div>
        </div>
      </div>

      {/* === Footer : shortcuts + features (kept compact) === */}
      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <h3 className="font-heading" style={{ marginTop: 0, fontSize: 13, color: '#FAFAFA' }}>
            {t('manual.shortcuts')}
          </h3>
          <ul data-testid="manual-shortcut-list" style={{ fontSize: 11.5, color: '#A1A1AA', lineHeight: 1.65, paddingLeft: 18 }}>
            {shortcutList.map((s, i) => (
              <li key={i}><b style={{ color: '#FAFAFA' }}>{s.keys}</b> — {s.label}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-heading" style={{ marginTop: 0, fontSize: 13, color: '#FAFAFA' }}>
            {t('manual.features')}
          </h3>
          <ul data-testid="manual-feature-list" style={{ fontSize: 11.5, color: '#A1A1AA', lineHeight: 1.65, paddingLeft: 18 }}>
            {featureKeys.map(k => (
              <li key={k}>{t(`manual.featureList.${k}`)}</li>
            ))}
          </ul>
        </div>
      </div>

      <style>{`
        @keyframes manual-fadein {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </Modal>
  );
}
