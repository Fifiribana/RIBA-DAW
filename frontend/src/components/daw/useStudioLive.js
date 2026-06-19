import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const USER_COLORS = [
  '#D946EF', '#22D3EE', '#F59E0B', '#22C55E',
  '#6366F1', '#EF4444', '#A78BFA', '#10B981',
];

function _randomUserName() {
  const adj = ['Wild', 'Solar', 'Sonic', 'Cosmic', 'Bantu', 'Velvet', 'Iron', 'Phoenix'];
  const noun = ['Drum', 'Phoenix', 'Wave', 'Echo', 'Pulse', 'Tide', 'Storm', 'Spirit'];
  return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}`;
}

/**
 * useStudioLive — connect to the RIBA collaboration websocket relay and
 * expose a shared Y.Map for mixer/Bantu state + an awareness map for cursors.
 *
 * Usage :
 *   const { ydoc, ymap, awareness, peers, connected, sessionId, setCursor }
 *     = useStudioLive();
 *   ymap.set('tempo', 130);     // → broadcast to all collaborators
 *   setCursor({ bar: 4, beat: 0.5, target: 'timeline' }); // throttled 50ms
 *
 * Returns null fields until a `?session=<id>` URL query param is present, so
 * the hook stays inert for solo users (zero overhead).
 */
export function useStudioLive() {
  const sessionId = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('session') || null; }
    catch { return null; }
  }, []);

  const docRef = useRef(null);
  const providerRef = useRef(null);
  const cursorThrottleRef = useRef({ lastSentAt: 0, pending: null, timer: null });
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState(1);
  const [me] = useState(() => ({
    name:  _randomUserName(),
    color: USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)],
  }));
  const [collaborators, setCollaborators] = useState([]);

  useEffect(() => {
    if (!sessionId) return undefined;
    const ydoc = new Y.Doc();
    const wsBase = (BACKEND_URL || '').replace(/^http/, 'ws');
    const provider = new WebsocketProvider(`${wsBase}/api/ws/session`, sessionId, ydoc, {
      connect: true,
    });
    docRef.current = ydoc;
    providerRef.current = provider;

    provider.on('status', (e) => {
      setConnected(e.status === 'connected');
    });

    provider.awareness.setLocalStateField('user', me);

    const updateAwareness = () => {
      // Build collaborator list, attaching their last-known cursor so the
      // TopBar badge / Timeline overlay can read in one place.
      const states = Array.from(provider.awareness.getStates().entries());
      const others = states
        .filter(([cid]) => cid !== provider.awareness.clientID)
        .map(([cid, s]) => ({
          clientId: cid,
          ...(s?.user || {}),
          cursor: s?.cursor || null,
        }))
        .filter((c) => c.name);
      setCollaborators(others);
      setPeers(states.length || 1);
    };
    provider.awareness.on('change', updateAwareness);
    updateAwareness();

    return () => {
      try { provider.awareness.off('change', updateAwareness); } catch { /* */ }
      try { provider.destroy(); } catch { /* */ }
      try { ydoc.destroy(); } catch { /* */ }
      docRef.current = null; providerRef.current = null;
      const th = cursorThrottleRef.current;
      if (th.timer) { clearTimeout(th.timer); th.timer = null; }
    };
  }, [sessionId, me]);

  /**
   * setCursor — broadcast the local cursor position to other peers, throttled
   * to 50 ms per the v3.3 spec to keep WS traffic light during fast drags.
   */
  const setCursor = useCallback((cursor) => {
    const provider = providerRef.current;
    if (!provider) return;
    const th = cursorThrottleRef.current;
    const now = Date.now();
    const elapsed = now - th.lastSentAt;
    const apply = (c) => {
      try { provider.awareness.setLocalStateField('cursor', c); } catch { /* */ }
    };
    if (elapsed >= 50) {
      th.lastSentAt = now;
      th.pending = null;
      if (th.timer) { clearTimeout(th.timer); th.timer = null; }
      apply(cursor);
    } else {
      // Coalesce — keep only the most recent cursor; schedule a flush.
      th.pending = cursor;
      if (!th.timer) {
        th.timer = setTimeout(() => {
          th.timer = null;
          if (th.pending) {
            th.lastSentAt = Date.now();
            apply(th.pending);
            th.pending = null;
          }
        }, 50 - elapsed);
      }
    }
  }, []);

  if (!sessionId) {
    return {
      sessionId: null, ydoc: null, ymap: null, awareness: null,
      connected: false, peers: 0, collaborators: [], me, setCursor: () => {},
    };
  }
  return {
    sessionId,
    ydoc: docRef.current,
    ymap: docRef.current?.getMap('riba'),
    awareness: providerRef.current?.awareness || null,
    connected,
    peers,
    collaborators,
    me,
    setCursor,
  };
}

/**
 * StudioLiveBadge — small UI pill that shows the live status + collaborator
 * avatars (with tooltips + soft pulse when editing). Renders nothing in solo
 * mode (no ?session= URL param).
 */
export function StudioLiveBadge({ live }) {
  if (!live || !live.sessionId) return null;
  const { connected, peers, collaborators, sessionId } = live;
  return (
    <div
      data-testid="studio-live-badge"
      style={{
        position: 'fixed', top: 14, right: 14, zIndex: 70,
        background: 'rgba(11,11,14,0.92)', backdropFilter: 'blur(10px)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.5)' : 'rgba(245,158,11,0.5)'}`,
        borderRadius: 999, padding: '5px 10px',
        display: 'flex', alignItems: 'center', gap: 8,
        fontFamily: 'Manrope, sans-serif', fontSize: 11, color: '#FAFAFA',
        boxShadow: '0 4px 14px rgba(0,0,0,0.45)',
      }}
    >
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: connected ? '#22C55E' : '#F59E0B',
        boxShadow: `0 0 6px ${connected ? '#22C55E' : '#F59E0B'}`,
      }} />
      <span style={{ fontWeight: 700 }}>Studio Live</span>
      <span style={{ color: '#71717A', fontFamily: 'JetBrains Mono, monospace', fontSize: 9 }}>
        {sessionId}
      </span>
      <span style={{ color: '#A1A1AA', fontSize: 10 }}>· {peers}</span>
      <div data-testid="studio-live-avatars" style={{ display: 'flex', marginLeft: 4 }}>
        {(collaborators || []).slice(0, 4).map((u, i) => {
          const active = !!u.cursor;
          return (
            <div
              key={u.clientId || i}
              data-testid={`live-avatar-${i}`}
              title={`${u.name}${active ? ' · editing' : ''}`}
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: u.color || '#71717A',
                border: '2px solid #0B0B0E',
                marginLeft: i === 0 ? 0 : -7,
                fontSize: 9, color: '#0B0B0E', fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: active ? 'riba-avatar-pulse 1.6s ease-in-out infinite' : undefined,
                boxShadow: active ? `0 0 10px ${u.color || '#71717A'}` : 'none',
                cursor: 'help',
              }}
            >{(u.name || '?').slice(0, 2).toUpperCase()}</div>
          );
        })}
      </div>
      <style>{`
        @keyframes riba-avatar-pulse {
          0%,100% { transform: scale(1); }
          50%     { transform: scale(1.15); }
        }
      `}</style>
    </div>
  );
}

/**
 * LiveCursorOverlay — render a colored pinhead + name label at each
 * collaborator's cursor position. Designed to be absolutely positioned inside
 * the Timeline container (the parent must have position:relative).
 *
 * Coords scheme : `cursor.x` and `cursor.y` are EXPECTED in pixels relative
 * to the overlay container, OR `cursor.percent_x`/`percent_y` (0..1) so the
 * caller can choose the layout-stable option.
 */
export function LiveCursorOverlay({ collaborators }) {
  if (!collaborators || collaborators.length === 0) return null;
  const items = collaborators
    .map((c) => ({ ...c, cursor: c.cursor }))
    .filter((c) => c.cursor && (c.cursor.x != null || c.cursor.percent_x != null));
  if (items.length === 0) return null;
  return (
    <div
      data-testid="live-cursor-overlay"
      style={{
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 25,
      }}
    >
      {items.map((c) => {
        const cur = c.cursor;
        const left = cur.percent_x != null ? `${cur.percent_x * 100}%` : `${cur.x}px`;
        const top  = cur.percent_y != null ? `${cur.percent_y * 100}%` : `${cur.y ?? 0}px`;
        const color = c.color || '#D946EF';
        return (
          <div
            key={c.clientId}
            data-testid={`live-cursor-${c.clientId}`}
            style={{
              position: 'absolute', left, top,
              transform: 'translate(-50%, -50%)',
              transition: 'left 60ms linear, top 60ms linear',
              pointerEvents: 'none',
            }}
          >
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: color, border: '2px solid #0B0B0E',
              boxShadow: `0 0 10px ${color}`,
            }} />
            <div
              className="font-mono-r"
              style={{
                marginTop: 4, fontSize: 9, fontWeight: 700,
                padding: '2px 6px', borderRadius: 4,
                background: color, color: '#0B0B0E',
                whiteSpace: 'nowrap',
                boxShadow: `0 2px 6px rgba(0,0,0,0.4)`,
                transform: 'translateX(-50%)',
                position: 'absolute', left: '50%',
              }}
            >
              {c.name}
            </div>
          </div>
        );
      })}
    </div>
  );
}
