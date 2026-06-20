// RIBA · Live presence badge (Sprint v3.13)
//
// Polls /api/sessions/presence every ~12s (interval is suggested by the
// backend payload) and renders a tiny lightning + count pill in the topbar.
// Pure read-only / display only.

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

const API = process.env.REACT_APP_BACKEND_URL?.replace(/\/$/, '') || '';
const DEFAULT_POLL_MS = 12_000;
const ACTIVE_RING_MS = 600;

export function PresenceBadge() {
  const { t } = useTranslation();
  const [stats, setStats] = useState({ griots_online: 0, active_sessions: 0, collab_count: 0 });
  const [pulse, setPulse] = useState(false);
  const intervalRef = useRef(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch(`${API}/api/sessions/presence`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled) return;
        setStats(data);
        if (data.griots_online !== lastCountRef.current) {
          setPulse(true);
          setTimeout(() => setPulse(false), ACTIVE_RING_MS);
          lastCountRef.current = data.griots_online;
        }
      } catch { /* offline → silent */ }
    }
    tick();
    intervalRef.current = setInterval(tick, DEFAULT_POLL_MS);
    return () => {
      cancelled = true;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const online = stats.griots_online || 0;
  const live = online > 0;
  const tooltip = live
    ? t('presence.tooltipLive', {
        defaultValue: '{{count}} griot online · {{collab}} jamming together',
        count: online,
        collab: stats.collab_count || 0,
      })
    : t('presence.tooltipQuiet', { defaultValue: 'Studio quiet — be the first griot online!' });

  return (
    <div
      data-testid="presence-badge"
      data-online={online}
      data-pulse={pulse ? 'true' : undefined}
      title={tooltip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '4px 9px',
        background: live
          ? 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(217,70,239,0.18))'
          : 'rgba(63,63,70,0.55)',
        border: `1px solid ${live ? 'rgba(34,197,94,0.55)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 999,
        fontSize: 11,
        color: '#FAFAFA',
        cursor: 'default',
        boxShadow: pulse ? '0 0 10px rgba(34,197,94,0.8)' : 'none',
        transition: 'box-shadow 240ms ease-out, background 360ms ease-out',
        whiteSpace: 'nowrap',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 7, height: 7, borderRadius: '50%',
          background: live ? '#22C55E' : '#52525B',
          boxShadow: live ? '0 0 6px rgba(34,197,94,0.85)' : 'none',
        }}
      />
      <span style={{ fontWeight: 700 }}>⚡ {online}</span>
      <span style={{ color: '#A1A1AA' }} className="riba-presence-label">
        {live ? t('presence.label') : t('presence.labelEmpty')}
      </span>
    </div>
  );
}
