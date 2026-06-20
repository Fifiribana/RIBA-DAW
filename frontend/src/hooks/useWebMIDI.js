// RIBA · useWebMIDI hook.
//
// Wraps navigator.requestMIDIAccess() and dispatches incoming MIDI events to a
// callback. Connection / disconnection of devices is tracked live, the active
// device list is exposed for the Setup MIDI tab. The hook stays passive when
// the browser doesn't support WebMIDI (Safari < 18 etc): the consumer sees
// `supported: false` and renders a graceful fallback.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_MIDI_MAPPING,
  decodeMidiMessage,
} from '@/lib/midiMapping';

const ACTIVITY_DECAY_MS = 220;

export function useWebMIDI({ enabled = true, onEvent, mapping } = {}) {
  const [supported, setSupported] = useState(
    typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
  );
  const [permission, setPermission] = useState('idle'); // idle | granted | denied
  const [devices, setDevices] = useState([]);          // [{id,name,manufacturer,state,kind}]
  const [activity, setActivity] = useState({});         // { deviceId: ts }
  const [lastEvent, setLastEvent] = useState(null);

  const accessRef = useRef(null);
  const mappingRef = useRef(mapping || DEFAULT_MIDI_MAPPING);
  const onEventRef = useRef(onEvent);

  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { mappingRef.current = mapping || DEFAULT_MIDI_MAPPING; }, [mapping]);

  // Refresh devices list whenever a MIDI input is connected/disconnected.
  const refreshDevices = useCallback((access) => {
    const list = [];
    for (const input of access.inputs.values()) {
      list.push({
        id: input.id,
        name: input.name || 'Unknown MIDI input',
        manufacturer: input.manufacturer || '',
        state: input.state,
        kind: 'input',
      });
    }
    for (const output of access.outputs.values()) {
      list.push({
        id: output.id,
        name: output.name || 'Unknown MIDI output',
        manufacturer: output.manufacturer || '',
        state: output.state,
        kind: 'output',
      });
    }
    setDevices(list);
  }, []);

  const handleMidiMessage = useCallback((event) => {
    const decoded = decodeMidiMessage(event.data);
    if (!decoded) return;
    decoded.timestamp = event.timeStamp;
    decoded.deviceId = event.currentTarget?.id || event.target?.id || '';
    decoded.deviceName = event.currentTarget?.name || '';
    // Resolve mapped action from the active mapping.
    const m = mappingRef.current || DEFAULT_MIDI_MAPPING;
    if (decoded.kind === 'noteon') {
      decoded.action = (m.notes || {})[decoded.pitch] || (m.notes || {})[String(decoded.pitch)] || null;
    } else if (decoded.kind === 'cc') {
      decoded.action = (m.cc || {})[decoded.controller] || (m.cc || {})[String(decoded.controller)] || null;
    }
    setActivity((prev) => ({ ...prev, [decoded.deviceId]: Date.now() }));
    setLastEvent(decoded);
    if (onEventRef.current) {
      try { onEventRef.current(decoded); } catch (e) { /* swallow */ }
    }
  }, []);

  const attachInputs = useCallback((access) => {
    for (const input of access.inputs.values()) {
      input.onmidimessage = handleMidiMessage;
    }
  }, [handleMidiMessage]);

  const requestAccess = useCallback(async () => {
    if (!supported) return null;
    try {
      const access = await navigator.requestMIDIAccess({ sysex: false });
      accessRef.current = access;
      setPermission('granted');
      refreshDevices(access);
      attachInputs(access);
      access.onstatechange = () => {
        refreshDevices(access);
        attachInputs(access);
      };
      return access;
    } catch (err) {
      setPermission('denied');
      return null;
    }
  }, [supported, refreshDevices, attachInputs]);

  // Boot: request access automatically when the hook is enabled.
  useEffect(() => {
    if (!enabled || !supported) return undefined;
    requestAccess();
    return () => {
      const access = accessRef.current;
      if (access) {
        try { access.onstatechange = null; } catch (_) { /* */ }
        for (const input of access.inputs.values()) {
          try { input.onmidimessage = null; } catch (_) { /* */ }
        }
      }
    };
  }, [enabled, supported, requestAccess]);

  // Activity light decay so the UI pulses neatly on each message.
  useEffect(() => {
    if (!Object.keys(activity).length) return undefined;
    const id = setInterval(() => {
      const now = Date.now();
      setActivity((prev) => {
        let dirty = false;
        const out = {};
        for (const [k, t] of Object.entries(prev)) {
          if (now - t < ACTIVITY_DECAY_MS) out[k] = t; else dirty = true;
        }
        return dirty ? out : prev;
      });
    }, ACTIVITY_DECAY_MS);
    return () => clearInterval(id);
  }, [activity]);

  return {
    supported,
    permission,
    devices,
    activity,
    lastEvent,
    requestAccess,
  };
}

export default useWebMIDI;
