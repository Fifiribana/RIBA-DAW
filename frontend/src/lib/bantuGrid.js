// Bantu Oral Grid — client-side mirror of /backend/server.py _build_bantu_grid.
// Used by Timeline markers + MenuBar teaser preview (avoids backend round-trip).
// Returns positions in BEATS (1 beat = quarter note). bars * 4 = total beats.

export const BANTU_STYLES = [
  { id: 'asiko_wisdom',  label: 'Asiko Wisdom',   color: '#A820FF' },
  { id: 'makossa_roots', label: 'Makossa Roots',  color: '#D946EF' },
  { id: 'bikutsi_44',    label: 'Bikutsi 4/4',    color: '#F472B6' },
  { id: 'bikutsi_68',    label: 'Bikutsi 6/8',    color: '#FB7185' },
  { id: 'bikutsi_1224',  label: 'Bikutsi 12/24',  color: '#F59E0B' },
];

export function computeBantuGrid(style, density = 16, bars = 4) {
  density = Math.max(2, Math.min(256, Math.floor(density)));
  const totalBeats = bars * 4;
  const base = [];
  for (let i = 0; i < density; i++) base.push(i * (totalBeats / density));
  const s = String(style || '').toLowerCase();
  const applySwing = (arr, off) => arr.map((v, i) => v + off[i % off.length]);
  let out;

  if (s === 'asiko_wisdom') {
    out = [...base];
    for (let i = 0; i < out.length; i++) {
      if (i % 3 === 0) out[i] += 0.10;
      else if (i % 7 === 0) out[i] -= 0.06;
    }
  } else if (s === 'makossa_roots') {
    out = applySwing(base, [0.0, 0.16, -0.08, 0.04]);
  } else if (s === 'bikutsi_44') {
    const swing = [0.0, 0.20, 0.40, 0.0, 0.20, 0.40, 0.0, 0.20];
    const len = density % 8 || 8;
    out = applySwing(base, swing.slice(0, len));
    for (let i = 0; i < out.length; i++) if (i % 4 === 2) out[i] += 0.08;
  } else if (s === 'bikutsi_68') {
    const swing = [0.0, 0.18, 0.32, 0.50, 0.66, 0.82];
    out = [];
    for (let i = 0; i < density; i++) {
      const cycle = i % 6;
      const barIdx = Math.floor(i / 6);
      out.push((swing[cycle] + barIdx * 1.0) * (totalBeats / Math.max(1, density / 6)));
    }
  } else if (s === 'bikutsi_1224') {
    out = [];
    for (let i = 0; i < density; i++) {
      let beat = (i / density) * totalBeats;
      if (i % 3 === 0) beat -= 0.04;
      if (i % 4 === 0) beat += 0.05;
      out.push(beat);
    }
  } else {
    return [];
  }
  return out.map((v) => Math.max(0, Math.min(totalBeats, Math.round(v * 10000) / 10000)));
}
