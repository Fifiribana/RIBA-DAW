import React from 'react';
import { Modal } from '../Modal';

/**
 * DiskUsageModal — Pro Tools-style table of simulated session volumes.
 * "48 kHz 24 Bit Track Min" column: stereo session @ 48 kHz / 24-bit
 *   = 48000 * 3 bytes/sample * 2 channels = 288_000 B/s per stereo track
 *   = 17.28 MB / minute / track
 * So minutes-per-track = freeGB * 1024 / 17.28
 */
const BYTES_PER_MINUTE_STEREO_24_48 = 17.28 * 1024 * 1024;

const VOLUMES = [
  { name: 'Macintosh HD',  total: 1024,  used: 612,  type: 'System',   mount: '/' },
  { name: 'Sessions SSD',  total: 2048,  used: 488,  type: 'Audio',    mount: '/Volumes/Sessions' },
  { name: 'Samples RAID',  total: 8192,  used: 4750, type: 'Library',  mount: '/Volumes/Samples' },
  { name: 'Backup HDD',    total: 4096,  used: 3320, type: 'Backup',   mount: '/Volumes/Backup' },
  { name: 'RIBA Cloud',    total: 500,   used: 87,   type: 'Network',  mount: '/Volumes/riba-cloud' },
];

function minutesPerTrack(freeGB) {
  const freeBytes = freeGB * 1024 * 1024 * 1024;
  return Math.floor(freeBytes / BYTES_PER_MINUTE_STEREO_24_48);
}

function fmtGB(v) { return `${v.toFixed(0)} GB`; }
function fmtMin(m) {
  if (m >= 60) return `${(m / 60).toFixed(1)} hr`;
  return `${m} min`;
}

export function DiskUsageModal({ onClose }) {
  return (
    <Modal title="Disk Usage" onClose={onClose} width={760}>
      <div style={{ color: '#A1A1AA', fontSize: 11, marginBottom: 10 }}>
        Simulated mounted volumes. The <b style={{ color: '#FAFAFA' }}>48 kHz 24 Bit Track Min</b> column estimates the recording time remaining for one mono track at 48 kHz / 24-bit using the free space on each disk.
      </div>
      <table
        data-testid="disk-usage-table"
        style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}
      >
        <thead>
          <tr style={{ color: '#71717A', fontSize: 10, letterSpacing: '0.08em' }}>
            <th style={th}>VOLUME</th>
            <th style={th}>TYPE</th>
            <th style={th}>MOUNT</th>
            <th style={thR}>SIZE</th>
            <th style={thR}>USED</th>
            <th style={thR}>FREE</th>
            <th style={thR}>%</th>
            <th style={thR}>48 kHz 24 Bit Track Min</th>
          </tr>
        </thead>
        <tbody>
          {VOLUMES.map((v, i) => {
            const free = v.total - v.used;
            const pct = (v.used / v.total) * 100;
            const mins = minutesPerTrack(free);
            const pctColor = pct > 85 ? '#EF4444' : pct > 65 ? '#F59E0B' : '#22C55E';
            return (
              <tr key={v.name} data-testid={`disk-row-${i}`} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={td}><span style={{ color: '#FAFAFA', fontWeight: 600 }}>{v.name}</span></td>
                <td style={td}><span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3,
                  background: '#27272A', color: '#A1A1AA',
                }} className="font-mono-r">{v.type}</span></td>
                <td style={{ ...td, color: '#71717A' }} className="font-mono-r">{v.mount}</td>
                <td style={tdR} className="font-mono-r">{fmtGB(v.total)}</td>
                <td style={tdR} className="font-mono-r">{fmtGB(v.used)}</td>
                <td style={tdR} className="font-mono-r" data-testid={`free-${i}`}>{fmtGB(free)}</td>
                <td style={tdR}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 50, height: 5, background: '#09090B', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: pctColor }} />
                    </div>
                    <span className="font-mono-r" style={{ color: pctColor, width: 32, textAlign: 'right' }}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </td>
                <td style={tdR} className="font-mono-r" data-testid={`track-min-${i}`}>
                  <span style={{ color: '#D946EF', fontWeight: 600 }}>{fmtMin(mins)}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ marginTop: 12, fontSize: 10, color: '#52525B' }}>
        Formula: free bytes / (48 000 × 3 × 1) = mono minutes @ 24-bit 48 kHz. Stereo tracks halve the figure.
      </div>
    </Modal>
  );
}

const th =  { padding: '6px 8px', textAlign: 'left',  fontWeight: 500 };
const thR = { padding: '6px 8px', textAlign: 'right', fontWeight: 500 };
const td =  { padding: '8px 8px', color: '#E4E4E7' };
const tdR = { padding: '8px 8px', textAlign: 'right', color: '#E4E4E7' };
