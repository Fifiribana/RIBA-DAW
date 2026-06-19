import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGS } from '@/i18n';

/**
 * Globe-style language switcher dropdown — designed to sit on the right
 * edge of the Pro Tools MenuBar. Shows the flag + ISO code, opens a small
 * native-styled list of supported locales.
 */
export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const current = SUPPORTED_LANGS.find(l => l.code === (i18n.language || 'en').slice(0, 2))
    || SUPPORTED_LANGS[1];

  const pick = (code) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div
      ref={wrapRef}
      data-testid="language-switcher"
      style={{
        position: 'relative', display: 'flex', alignItems: 'center',
        padding: '0 10px', cursor: 'pointer', userSelect: 'none',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
      }}
      title={t('topbar.languageSwitcher')}
      onClick={() => setOpen(v => !v)}
    >
      <span style={{ fontSize: 14, marginRight: 6, lineHeight: 1 }}>🌐</span>
      <span
        className="font-mono-r"
        style={{
          fontSize: 11, color: '#A1A1AA', letterSpacing: '0.10em',
          textTransform: 'uppercase',
        }}
      >
        {current.code}
      </span>

      {open && (
        <div
          data-testid="language-switcher-menu"
          style={{
            position: 'absolute', top: '100%', right: 0,
            background: '#1F1F23', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: 4, minWidth: 180, zIndex: 70,
            boxShadow: '0 8px 22px rgba(0,0,0,0.55)',
            marginTop: 2,
          }}
        >
          {SUPPORTED_LANGS.map(lang => {
            const active = lang.code === current.code;
            return (
              <div
                key={lang.code}
                data-testid={`lang-option-${lang.code}`}
                onClick={(e) => { e.stopPropagation(); pick(lang.code); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#2F2F35'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = active ? '#2A2A33' : 'transparent'; }}
                style={{
                  padding: '7px 10px', fontSize: 12, borderRadius: 4,
                  color: active ? '#FAFAFA' : '#E4E4E7',
                  background: active ? '#2A2A33' : 'transparent',
                  display: 'flex', alignItems: 'center', gap: 10,
                  cursor: 'pointer',
                  borderLeft: active ? '2px solid #D946EF' : '2px solid transparent',
                }}
              >
                <span style={{ fontSize: 14 }}>{lang.flag}</span>
                <span style={{ flex: 1 }}>{lang.label}</span>
                <span
                  className="font-mono-r"
                  style={{
                    fontSize: 9, color: active ? '#D946EF' : '#71717A',
                    letterSpacing: '0.10em', textTransform: 'uppercase',
                  }}
                >
                  {lang.code}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
