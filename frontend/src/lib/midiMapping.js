// RIBA · WebMIDI default control mapping.
//
// Kept in sync with backend/ai/midi.py::DEFAULT_MAPPING. Pure data + a couple
// of mathematical helpers — no side effects, no React deps, easy to unit test.

export const BANTU_STYLES = [
  'asiko_wisdom',
  'makossa_roots',
  'bikutsi_44',
  'bikutsi_68',
  'bikutsi_1224',
];

export const TEMPO_RANGE = [40, 240];

export const DEFAULT_MIDI_MAPPING = {
  version: 1,
  notes: {
    60: 'transport.play',
    61: 'transport.stop',
    62: 'transport.record',
    63: 'transport.loop',
    64: 'transport.metronome',
  },
  cc: {
    16: 'tempo.set',
    17: 'swing.intensity',
    18: 'swing.enable',
    19: 'swing.style',
    7: 'master.volume',
    1: 'master.pan',
  },
};

export function ccToTempo(value) {
  const v = Math.max(0, Math.min(127, value | 0));
  const [lo, hi] = TEMPO_RANGE;
  return Math.round(lo + (hi - lo) * (v / 127));
}

export function ccToPan(value) {
  const v = Math.max(0, Math.min(127, value | 0));
  return Math.round(((v / 127) * 2 - 1) * 10000) / 10000;
}

export function ccToSwing(value) {
  const v = Math.max(0, Math.min(127, value | 0));
  return Math.round((v / 127) * 100) / 100;
}

export function ccToStyle(value) {
  const v = Math.max(0, Math.min(127, value | 0));
  const bucket = Math.min(BANTU_STYLES.length - 1,
    Math.floor((v * BANTU_STYLES.length) / 128));
  return BANTU_STYLES[bucket];
}

// Convert MIDI pitch (0..127) -> beats-aligned note duration in the Bantu grid.
// Uses the closest swing offset for the supplied style/intensity so live
// recordings inherit the active groove without destructive quantisation later.
export function quantizeBeatToBantu(beat, style, intensity) {
  const i = Math.max(0, Math.min(1, intensity || 0));
  // Pre-baked swing offsets (kept short, doesn't require backend round-trip).
  const SWING = {
    asiko_wisdom: [0.00, 0.10, 0.00, -0.06],
    makossa_roots: [0.00, 0.16, -0.08, 0.04],
    bikutsi_44: [0.00, 0.20, 0.40, 0.00, 0.20, 0.40, 0.00, 0.20],
    bikutsi_68: [0.00, 0.18, 0.32, 0.50, 0.66, 0.82],
    bikutsi_1224: [-0.04, 0.05, -0.02, 0.03],
  };
  const table = SWING[style] || SWING.bikutsi_44;
  const idx = Math.floor(beat * table.length) % table.length;
  return Math.round((beat + table[idx] * i) * 1000) / 1000;
}

// Standard MIDI message decoders — returns null on non-data status bytes so
// callers can ignore clock/sysex/etc cleanly.
export function decodeMidiMessage(data) {
  if (!data || data.length < 1) return null;
  const status = data[0] & 0xf0;
  const channel = data[0] & 0x0f;
  if (status === 0x90 && data.length >= 3) {
    return data[2] === 0
      ? { kind: 'noteoff', channel, pitch: data[1], velocity: 0 }
      : { kind: 'noteon', channel, pitch: data[1], velocity: data[2] };
  }
  if (status === 0x80 && data.length >= 3) {
    return { kind: 'noteoff', channel, pitch: data[1], velocity: data[2] };
  }
  if (status === 0xb0 && data.length >= 3) {
    return { kind: 'cc', channel, controller: data[1], value: data[2] };
  }
  if (status === 0xe0 && data.length >= 3) {
    const value = ((data[2] << 7) | data[1]) - 8192;
    return { kind: 'pitchbend', channel, value };
  }
  return null;
}
