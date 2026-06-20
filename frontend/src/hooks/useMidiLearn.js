// RIBA · MIDI Learn — React context + provider.
//
// Exposes a global "armed target" mechanism: any UI element can offer a
// right-click "Learn next MIDI control" affordance which, while armed, will
// bind the next incoming MIDI event (note or CC) to that element and persist
// it server-side via PATCH /api/midi/mapping/{owner}/learn.
//
// The dispatcher logic in Daw.jsx routes inbound MIDI events through
// `useMidiLearnDispatch()` so the same `lastEvent` stream drives both default
// transport actions AND learn bindings.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const API = process.env.REACT_APP_BACKEND_URL?.replace(/\/$/, '') || '';

const MidiLearnContext = createContext(null);

const OWNER_KEY = 'riba-midi-owner';
const ARM_TTL_MS = 12000;  // auto-cancel learn after 12 s of inactivity

function ensureOwner() {
  try {
    let v = localStorage.getItem(OWNER_KEY);
    if (!v) {
      v = 'griot_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(OWNER_KEY, v);
    }
    return v;
  } catch {
    return 'anonymous';
  }
}

export function MidiLearnProvider({ children }) {
  const [armed, setArmed] = useState(null);  // { targetId, label, applyValue }
  const [assignments, setAssignments] = useState({});  // { targetId: {kind,key,action} }
  const [status, setStatus] = useState('idle');  // idle|armed|saving|saved|error
  const [statusMsg, setStatusMsg] = useState('');
  const ownerRef = useRef(ensureOwner());
  const armRef = useRef(null);
  const timeoutRef = useRef(null);

  useEffect(() => { armRef.current = armed; }, [armed]);

  // Hydrate from server on mount (best-effort, never blocking).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`${API}/api/midi/mapping/${ownerRef.current}`);
        if (!r.ok) return;
        const data = await r.json();
        if (cancelled || data.fallback) return;
        // Rebuild reverse map: action → {kind,key}
        const rev = {};
        for (const [k, action] of Object.entries(data.notes || {})) {
          rev[action] = { kind: 'noteon', key: Number(k), action };
        }
        for (const [k, action] of Object.entries(data.cc || {})) {
          rev[action] = { kind: 'cc', key: Number(k), action };
        }
        setAssignments(rev);
      } catch (_) { /* offline → no-op */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const cancel = useCallback(() => {
    setArmed(null);
    setStatus('idle');
    setStatusMsg('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const arm = useCallback((targetId, label, applyValue) => {
    setArmed({ targetId, label, applyValue });
    setStatus('armed');
    setStatusMsg(`🎹 Learning · ${label} · play a note or move a knob…`);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setArmed(null);
      setStatus('idle');
      setStatusMsg('');
    }, ARM_TTL_MS);
  }, []);

  // Called by the MIDI dispatcher when an event arrives & we're armed.
  const captureEvent = useCallback(async (evt) => {
    const target = armRef.current;
    if (!target) return false;
    if (evt.kind !== 'noteon' && evt.kind !== 'cc') return false;
    if (evt.kind === 'noteon' && evt.velocity <= 0) return false;

    const kind = evt.kind;
    const key = evt.kind === 'noteon' ? evt.pitch : evt.controller;
    const action = target.targetId;

    setStatus('saving');
    setStatusMsg(`🎹 Saving · ${kind === 'cc' ? `CC ${key}` : `Note ${key}`} → ${target.label}`);

    try {
      const body = {
        owner: ownerRef.current, kind, action,
        ...(kind === 'noteon' ? { pitch: key } : { controller: key }),
      };
      const r = await fetch(`${API}/api/midi/mapping/${ownerRef.current}/learn`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // Drop any previous assignment that pointed at the same physical key
      // so the UI shows it under the new target only.
      setAssignments((prev) => {
        const next = {};
        for (const [act, a] of Object.entries(prev)) {
          if (a.kind === kind && a.key === key) continue;
          next[act] = a;
        }
        next[action] = { kind, key, action };
        return next;
      });
      setStatus('saved');
      setStatusMsg(`✓ ${kind === 'cc' ? `CC ${key}` : `Note ${key}`} → ${target.label}`);
      setTimeout(() => { setStatusMsg(''); setStatus('idle'); }, 1800);
      return true;
    } catch (err) {
      setStatus('error');
      setStatusMsg(`⚠️ MIDI Learn failed: ${err.message}`);
      setTimeout(() => { setStatusMsg(''); setStatus('idle'); }, 2400);
      return true;
    } finally {
      setArmed(null);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    }
  }, []);

  const unbind = useCallback(async (targetId) => {
    const a = assignments[targetId];
    if (!a) return;
    setAssignments((prev) => {
      const { [targetId]: _, ...rest } = prev;
      return rest;
    });
    try {
      await fetch(`${API}/api/midi/mapping/${ownerRef.current}/learn`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: ownerRef.current, kind: a.kind,
          ...(a.kind === 'noteon' ? { pitch: a.key } : { controller: a.key }),
        }),
      });
      setStatus('saved');
      setStatusMsg(`✓ Unbound ${a.kind === 'cc' ? `CC ${a.key}` : `Note ${a.key}`}`);
      setTimeout(() => { setStatusMsg(''); setStatus('idle'); }, 1500);
    } catch (_) { /* best-effort */ }
  }, [assignments]);

  const value = useMemo(() => ({
    armed, assignments, status, statusMsg,
    arm, cancel, captureEvent, unbind,
    owner: ownerRef.current,
  }), [armed, assignments, status, statusMsg, arm, cancel, captureEvent, unbind]);

  return (
    <MidiLearnContext.Provider value={value}>
      {children}
    </MidiLearnContext.Provider>
  );
}

export function useMidiLearn() {
  const ctx = useContext(MidiLearnContext);
  if (!ctx) {
    // Safe no-op shim so optional consumers don't crash when the provider is
    // absent (tests, storybook…).
    return {
      armed: null, assignments: {}, status: 'idle', statusMsg: '',
      arm: () => {}, cancel: () => {}, captureEvent: async () => false,
      unbind: async () => {}, owner: 'anonymous',
    };
  }
  return ctx;
}
