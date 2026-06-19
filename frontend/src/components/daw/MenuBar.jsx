import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PRO_TOOLS_MENUS } from './proToolsMenuConfig';
import { BantuTeaser } from './BantuTeaser';
import { LanguageSwitcher } from './LanguageSwitcher';

// Single menu row — supports leaf items and one level of right-flyout submenu.
function MenuRow({ item, actions, onAfterClick }) {
  const [subOpen, setSubOpen] = useState(false);
  const hasSub = Array.isArray(item.submenu);
  const fn = hasSub ? null : actions[item.key];
  const disabled = !hasSub && !fn;

  const baseStyle = {
    padding: '6px 10px', fontSize: 12,
    color: disabled ? '#52525B' : '#E4E4E7',
    borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', justifyContent: 'space-between', gap: 16,
    alignItems: 'center', position: 'relative',
    background: subOpen ? '#2F2F35' : 'transparent',
  };

  return (
    <div
      data-testid={`menuitem-${item.id}`}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.background = '#2F2F35';
        if (hasSub) setSubOpen(true);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
        if (hasSub) setSubOpen(false);
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (hasSub) { setSubOpen((v) => !v); return; }
        if (!disabled) { fn(); onAfterClick(); }
      }}
      style={baseStyle}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.key === 'openBantu' && (
          <BantuTeaser cycle={true} width={56} height={14} />
        )}
        <span>{item.label}</span>
      </span>
      {hasSub ? (
        <span style={{ fontSize: 10, color: '#71717A' }}>▸</span>
      ) : item.shortcut ? (
        <span className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>{item.shortcut}</span>
      ) : null}

      {hasSub && subOpen && (
        <div
          data-testid={`submenu-${item.id}`}
          style={{
            position: 'absolute', top: -4, left: '100%',
            background: '#1F1F23', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: 4, minWidth: 240, zIndex: 60,
            boxShadow: '0 8px 20px rgba(0,0,0,0.6)',
            marginLeft: 2,
          }}
        >
          {item.submenu.map((sub, i) => {
            if (sub.sep) return <div key={`sep-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />;
            const subFn = actions[sub.key];
            const subDisabled = !subFn;
            return (
              <div
                key={sub.id}
                data-testid={`menuitem-${sub.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!subDisabled) { subFn(); onAfterClick(); }
                }}
                onMouseEnter={(e) => { if (!subDisabled) e.currentTarget.style.background = '#3A3A40'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                style={{
                  padding: '6px 10px', fontSize: 12,
                  color: subDisabled ? '#52525B' : '#E4E4E7',
                  borderRadius: 4, cursor: subDisabled ? 'not-allowed' : 'pointer',
                  display: 'flex', justifyContent: 'space-between', gap: 16,
                }}
              >
                <span>{sub.label}</span>
                {sub.shortcut && (
                  <span className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>{sub.shortcut}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function MenuBar({ openMenu, setOpenMenu, actions }) {
  const close = () => setOpenMenu(null);
  const { t } = useTranslation();
  const menuKeys = Object.keys(PRO_TOOLS_MENUS);
  // Direct-access Manual button (Pro Tools-style "Help/Manual" mini button)
  const openManual = actions.openManual;
  return (
    <div
      style={{
        height: 32, background: '#0B0B0E', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'stretch', padding: '0 8px', position: 'relative', flexShrink: 0
      }}
      onMouseLeave={close}
    >
      {/* RIBA brand miniature — Pro Tools-style left-side logo */}
      <div
        data-testid="riba-brand-mark"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '0 10px 0 4px', marginRight: 4, cursor: 'default',
          borderRight: '1px solid rgba(255,255,255,0.05)',
        }}
        title={`RIBA · ${t('topbar.brand')}`}
      >
        <img
          src="/riba-logo.png"
          alt="RIBA"
          width={22}
          height={22}
          style={{
            display: 'block', borderRadius: '50%',
            boxShadow: '0 0 6px rgba(217,70,239,0.55), 0 0 14px rgba(34,211,238,0.25)',
          }}
        />
      </div>
      {menuKeys.map((key, idx) => (
        <div
          key={key}
          data-testid={`menu-${key.toLowerCase()}`}
          onMouseEnter={() => openMenu && setOpenMenu(key)}
          onClick={() => setOpenMenu(openMenu === key ? null : key)}
          style={{
            padding: '0 12px', display: 'flex', alignItems: 'center',
            fontSize: 12, color: openMenu === key ? '#FAFAFA' : '#A1A1AA',
            cursor: 'pointer', background: openMenu === key ? '#1F1F23' : 'transparent',
            borderRadius: 3, marginLeft: idx === menuKeys.length - 1 ? 'auto' : 0,
            position: 'relative', userSelect: 'none'
          }}
        >
          {t(`menu.${key}`, key)}          {openMenu === key && (
            <div style={{
              position: 'absolute', top: '100%', left: 0,
              background: '#1F1F23', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, padding: 4, minWidth: 280, zIndex: 50,
              boxShadow: '0 8px 20px rgba(0,0,0,0.5)'
            }}>
              {PRO_TOOLS_MENUS[key].map((item, i) => {
                if (item.sep) {
                  return <div key={`sep-${i}`} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '4px 0' }} />;
                }
                return (
                  <MenuRow key={item.id} item={item} actions={actions} onAfterClick={close} />
                );
              })}
            </div>
          )}
        </div>
      ))}
      {/* Quick-access Manual button (Phoenix-themed pill) */}
      {openManual && (
        <button
          data-testid="manual-quick-btn"
          onClick={openManual}
          title={t('manual.menubarBtn', 'Manual')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 10px', marginLeft: 4,
            background: 'transparent',
            border: '1px solid rgba(217,70,239,0.32)',
            borderRadius: 999, color: '#E4E4E7',
            fontSize: 11, fontWeight: 600, fontFamily: 'Manrope, sans-serif',
            cursor: 'pointer', letterSpacing: '0.04em',
            alignSelf: 'center', height: 22,
            transition: 'background 160ms ease, border-color 160ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(217,70,239,0.10)';
            e.currentTarget.style.borderColor = 'rgba(217,70,239,0.6)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent';
            e.currentTarget.style.borderColor = 'rgba(217,70,239,0.32)';
          }}
        >
          <img src="/riba-logo.png" alt="" width={14} height={14}
            style={{ borderRadius: '50%' }} />
          <span>📖 {t('manual.menubarBtn', 'Manual')}</span>
        </button>
      )}
      {/* Globe language switcher — right edge of the bar */}
      <LanguageSwitcher />
    </div>
  );
}
