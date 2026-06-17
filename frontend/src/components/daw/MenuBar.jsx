import React from 'react';
import { PRO_TOOLS_MENUS } from './proToolsMenuConfig';

export function MenuBar({ openMenu, setOpenMenu, actions }) {
  const close = () => setOpenMenu(null);
  return (
    <div
      style={{
        height: 32, background: '#0B0B0E', borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'stretch', padding: '0 8px', position: 'relative', flexShrink: 0
      }}
      onMouseLeave={close}
    >
      {Object.keys(PRO_TOOLS_MENUS).map((key, idx) => (
        <div
          key={key}
          data-testid={`menu-${key.toLowerCase()}`}
          onMouseEnter={() => openMenu && setOpenMenu(key)}
          onClick={() => setOpenMenu(openMenu === key ? null : key)}
          style={{
            padding: '0 12px', display: 'flex', alignItems: 'center',
            fontSize: 12, color: openMenu === key ? '#FAFAFA' : '#A1A1AA',
            cursor: 'pointer', background: openMenu === key ? '#1F1F23' : 'transparent',
            borderRadius: 3, marginLeft: idx === Object.keys(PRO_TOOLS_MENUS).length - 1 ? 'auto' : 0,
            position: 'relative', userSelect: 'none'
          }}
        >
          {key}
          {openMenu === key && (
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
                const fn = actions[item.key];
                const disabled = !fn;
                return (
                  <div
                    key={item.id}
                    data-testid={`menuitem-${item.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!disabled) { fn(); close(); }
                    }}
                    style={{
                      padding: '6px 10px', fontSize: 12,
                      color: disabled ? '#52525B' : '#E4E4E7',
                      borderRadius: 4, cursor: disabled ? 'not-allowed' : 'pointer',
                      display: 'flex', justifyContent: 'space-between', gap: 16
                    }}
                    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#2F2F35'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>{item.shortcut}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
