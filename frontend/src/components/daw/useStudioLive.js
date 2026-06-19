import { useEffect, useMemo, useRef, useState } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

const USER_COLORS = [
  '#D946EF', '#22D3EE', '#F59E0B', '#22C55E',
  '#6366F1', '#EF4444', '#A78BFA', '#10B981',
];

function _randomUserName() {
  const adj = ['Wild', 'Solar', 'Sonic', 'Cosmic', 'Bantu', 'Velvet', 'Iron', 'Phoenix'];
  const noun = ['Drum', 'Phoenix', 'Wave', 'Echo', 'Pulse', 'Tide', 'Storm', 'Echo'];
  return `${adj[Math.floor(Math.random() * adj.length)]}${noun[Math.floor(Math.random() * noun.length)]}`;
}

/**
 * useStudioLive — connect to the RIBA collaboration websocket relay and
 * expose a shared Y.Map for mixer/Bantu state + an awareness map for cursors.
 *
 * Usage :
 *   const { ydoc, ymap, awareness, peers, connected, sessionId } = useStudioLive();
 *   const tempo = ymap.get('tempo');
 *   ymap.set('tempo', 130);   // → broadcast to all collaborators
 *
 * Returns null until a `?session=<id>` URL query param is present, so the hook
 * stays inert for solo users (zero overhead).
 */
export function useStudioLive() {
  const sessionId = useMemo(() => {
    try { return new URLSearchParams(window.location.search).get('session') || null; }
    catch { return null; }
  }, []);

  const docRef = useRef(null);
  const providerRef = useRef(null);
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
    // y-websocket appends /room → our backend route is /api/ws/session/{id}
    // We use the room param manually : the provider opens `${url}/${room}`.
    const provider = new WebsocketProvider(`${wsBase}/api/ws/session`, sessionId, ydoc, {
      connect: true,
    });
    docRef.current = ydoc;
    providerRef.current = provider;

    provider.on('status', (e) => {
      setConnected(e.status === 'connected');
    });

    // local awareness — name + color
    provider.awareness.setLocalStateField('user', me);

    const updateAwareness = () => {
      const states = Array.from(provider.awareness.getStates().values());
      setCollaborators(states.map((s) => s?.user).filter(Boolean));
      setPeers(states.length || 1);
    };
    provider.awareness.on('change', updateAwareness);
    updateAwareness();

    return () => {
      try { provider.awareness.off('change', updateAwareness); } catch { /* */ }
      try { provider.destroy(); } catch { /* */ }
      try { ydoc.destroy(); } catch { /* */ }
      docRef.current = null; providerRef.current = null;
    };
  }, [sessionId, me]);

  if (!sessionId) {
    return { sessionId: null, ydoc: null, ymap: null, awareness: null, connected: false, peers: 0, collaborators: [], me };
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
  };
}

/**
 * StudioLiveBadge — small UI pill that shows the live status + collaborator
 * avatars. Renders nothing in solo mode (no ?session= URL param).
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
        {(collaborators || []).slice(0, 4).map((u, i) => (
          <div
            key={i}
            title={u.name}
            style={{
              width: 18, height: 18, borderRadius: '50%',
              background: u.color || '#71717A',
              border: '2px solid #0B0B0E',
              marginLeft: i === 0 ? 0 : -6,
              fontSize: 9, color: '#0B0B0E', fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >{(u.name || '?').slice(0, 2).toUpperCase()}</div>
        ))}
      </div>
    </div>
  );
}
