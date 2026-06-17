import React, { useEffect, useRef, useState } from 'react';
import { Modal, SetupRow } from '../Modal';

/**
 * SystemUsageModal — Pro Tools-style live monitor.
 * - Global CPU gauge (smoothed)
 * - 24 simulated cores horizontal bars
 * - Disk and Memory gauges
 */
const CORE_COUNT = 24;

function Gauge({ label, value, color, testId }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#A1A1AA' }}>
        <span className="font-mono-r" style={{ letterSpacing: '0.1em' }}>{label}</span>
        <span data-testid={`${testId}-value`} className="font-mono-r" style={{ color: '#FAFAFA' }}>{v.toFixed(0)}%</span>
      </div>
      <div style={{ height: 10, background: '#09090B', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div
          data-testid={testId}
          style={{
            height: '100%', width: `${v}%`,
            background: `linear-gradient(90deg, ${color}66, ${color})`,
            transition: 'width 200ms ease-out',
          }}
        />
      </div>
    </div>
  );
}

export function SystemUsageModal({ onClose }) {
  const [cpu, setCpu] = useState(18);
  const [disk, setDisk] = useState(22);
  const [mem, setMem] = useState(34);
  const [cores, setCores] = useState(() => new Array(CORE_COUNT).fill(0).map(() => 10 + Math.random() * 25));
  const tRef = useRef(0);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      tRef.current += 1;
      // Smooth random walk for primary gauges
      setCpu((p) => clamp(p + (Math.random() - 0.5) * 6, 8, 88));
      setDisk((p) => clamp(p + (Math.random() - 0.5) * 4, 4, 70));
      setMem((p) => clamp(p + (Math.random() - 0.5) * 2, 20, 75));
      setCores((prev) =>
        prev.map((v) => clamp(v + (Math.random() - 0.5) * 14, 2, 96))
      );
      raf = setTimeout(() => requestAnimationFrame(tick), 220);
    };
    tick();
    return () => clearTimeout(raf);
  }, []);

  return (
    <Modal title="System Usage" onClose={onClose} width={680}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Gauge label="CPU TOTAL"    value={cpu} color="#22D3EE" testId="cpu-total" />
        <div>
          <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A', letterSpacing: '0.1em', marginBottom: 6 }}>
            CORE ACTIVITY · {CORE_COUNT} THREADS
          </div>
          <div
            data-testid="cpu-cores"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, 1fr)',
              gap: '4px 16px',
            }}
          >
            {cores.map((v, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="font-mono-r" style={{ fontSize: 9, color: '#52525B', width: 18 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div style={{ flex: 1, height: 8, background: '#09090B', borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.05)' }}>
                  <div
                    data-testid={`core-${i}`}
                    style={{
                      height: '100%', width: `${v}%`,
                      background: v > 80 ? '#EF4444' : v > 55 ? '#F59E0B' : '#22D3EE',
                      transition: 'width 200ms linear',
                    }}
                  />
                </div>
                <span className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', width: 28, textAlign: 'right' }}>
                  {v.toFixed(0)}%
                </span>
              </div>
            ))}
          </div>
        </div>
        <Gauge label="DISK ACTIVITY"   value={disk}  color="#A855F7" testId="disk-usage" />
        <Gauge label="MEMORY (RAM)"    value={mem}   color="#22C55E" testId="mem-usage" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, fontSize: 11 }}>
          <SetupRow label="Buffer Underruns" value={<span data-testid="buffer-underruns">0</span>} />
          <SetupRow label="Voices Active"    value={<span data-testid="voices-active">{Math.floor(cpu / 4)}</span>} />
          <SetupRow label="Session uptime"   value={<span data-testid="uptime">{Math.floor(tRef.current * 0.22)} s</span>} />
        </div>
      </div>
    </Modal>
  );
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
