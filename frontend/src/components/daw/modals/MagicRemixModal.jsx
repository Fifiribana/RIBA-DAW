import React, { useEffect, useRef, useState } from 'react';
import { Modal } from '../Modal';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BANTU_STYLES = [
  { id: 'bikutsi_44',    label: 'Bikutsi 4/4 (8 ternaire)' },
  { id: 'bikutsi_68',    label: 'Bikutsi 6/8' },
  { id: 'bikutsi_1224',  label: 'Bikutsi 12/24 polyrythmie' },
  { id: 'makossa_roots', label: 'Makossa Roots' },
  { id: 'asiko_wisdom',  label: 'Asiko Wisdom' },
];

const lbl = { fontSize: 9, color: '#71717A', letterSpacing: '0.12em', display: 'block', marginBottom: 4 };
const input = {
  width: '100%', background: '#0B0B0E', color: '#FAFAFA', resize: 'vertical',
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 10px',
  fontSize: 12, fontFamily: 'Manrope, sans-serif', outline: 'none', boxSizing: 'border-box',
};

/**
 * Magic Re-mix Modal — RIBA-exclusive chain:
 *   user audio  →  Demucs (4 stems)  →  Bantu Oral Grid  →  optional fal.ai
 *   bantu groove layer  →  multi-tracks imported into the timeline.
 */
export function MagicRemixModal({ onClose, onImportStems }) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [bantuStyle, setBantuStyle] = useState('bikutsi_44');
  const [density, setDensity] = useState(16);
  const [bars, setBars] = useState(4);
  const [regenerate, setRegenerate] = useState(true);
  const [regenPrompt, setRegenPrompt] = useState('drums, percussion, mbira polyrhythm');
  const [regenDuration, setRegenDuration] = useState(15);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [progress, setProgress] = useState(null); // 'demucs'|'fal'|'compose'|null
  const [chainStatus, setChainStatus] = useState({ ready: false, fal_ready: false, demucs_ready: false, mode: 'unavailable' });
  const [lastResult, setLastResult] = useState(null);

  useEffect(() => {
    fetch(`${API}/ai/remix-status`).then((r) => r.json()).then(setChainStatus).catch(() => {});
  }, []);

  const onPick = (e) => { setFile(e.target.files?.[0] || null); setLastResult(null); setStatus(''); };

  const runRemix = async () => {
    if (!file) { setStatus('Choose an audio file first.'); return; }
    setBusy(true); setLastResult(null);
    setProgress('demucs');
    setStatus('🎛 Magic Re-mix · step 1/3: Demucs splitting 4 stems…');
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('bantu_style', bantuStyle);
      fd.append('density', String(density));
      fd.append('bars', String(bars));
      const useRegen = regenerate && chainStatus.fal_ready;
      fd.append('regenerate', useRegen ? 'true' : 'false');
      fd.append('regen_prompt', regenPrompt);
      fd.append('regen_duration', String(regenDuration));
      if (useRegen) {
        // bump the status message at ~30s
        setTimeout(() => { setProgress('fal'); setStatus('🎛 Magic Re-mix · step 2/3: fal.ai weaving the Bantu groove layer…'); }, 32000);
      }
      const r = await fetch(`${API}/ai/magic-remix`, { method: 'POST', body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail?.message || body.detail || `HTTP ${r.status}`);
      }
      setProgress('compose'); setStatus('🎛 Magic Re-mix · step 3/3: composing tracks…');
      const data = await r.json();
      setLastResult(data);
      const stemNames = Object.keys(data.stems || {});
      const groove = stemNames.includes('bantu_groove') ? ' + Bantu Groove ✨' : '';
      setStatus(`✓ Re-mix ready · ${stemNames.length} stem${stemNames.length > 1 ? 's' : ''}${groove} · mode=${data.mode}`);
    } catch (e) {
      setStatus(`Magic Re-mix failed: ${e.message}`);
    } finally {
      setBusy(false); setProgress(null);
    }
  };

  const importToDaw = () => {
    if (!lastResult) return;
    if (typeof onImportStems === 'function') onImportStems(lastResult);
    onClose();
  };

  const chainBadge = (txt, ok) => (
    <span style={{
      fontSize: 9, padding: '2px 7px', borderRadius: 999,
      background: ok ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.10)',
      border: `1px solid ${ok ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.3)'}`,
      color: ok ? '#22C55E' : '#F59E0B', fontWeight: 700, letterSpacing: '0.08em',
    }}>{txt}</span>
  );

  return (
    <Modal title="Magic Re-mix · Demucs ▸ Bantu Grid ▸ fal.ai" onClose={onClose} width={720}>
      <div data-testid="magic-remix-modal" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Chain status */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 11, color: '#A1A1AA' }}>
          <span className="font-mono-r" style={{ letterSpacing: '0.1em', color: '#71717A' }}>CHAIN:</span>
          {chainBadge(`Demucs ${chainStatus.demucs_ready ? '●' : '○'}`, chainStatus.demucs_ready)}
          {chainBadge(`Bantu Grid ●`, true)}
          {chainBadge(`fal.ai ${chainStatus.fal_ready ? '●' : '○'}`, chainStatus.fal_ready)}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#71717A' }}>mode={chainStatus.mode}</span>
        </div>

        {/* File picker */}
        <div>
          <label style={lbl}>AUDIO INPUT (WAV / MP3)</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={fileRef}
              data-testid="remix-file-input"
              type="file" accept="audio/*"
              onChange={onPick}
              style={{ ...input, padding: '6px 8px' }}
            />
            {file && <span style={{ fontSize: 10, color: '#22D3EE' }} className="font-mono-r">{Math.round(file.size / 1024)} KB</span>}
          </div>
        </div>

        {/* Bantu params */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <div>
            <label style={lbl}>BANTU STYLE</label>
            <select
              data-testid="remix-bantu-style"
              value={bantuStyle}
              onChange={(e) => setBantuStyle(e.target.value)}
              style={input}
            >
              {BANTU_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>DENSITY</label>
            <input data-testid="remix-density" type="number" min={2} max={64} value={density}
              onChange={(e) => setDensity(parseInt(e.target.value || '16', 10))} style={input} />
          </div>
          <div>
            <label style={lbl}>BARS</label>
            <input data-testid="remix-bars" type="number" min={1} max={32} step={0.5} value={bars}
              onChange={(e) => setBars(parseFloat(e.target.value || '4'))} style={input} />
          </div>
        </div>

        {/* Regen toggle */}
        <div style={{
          background: '#09090B', borderRadius: 8, padding: 10,
          border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#FAFAFA', cursor: 'pointer' }}>
            <input
              data-testid="remix-regenerate-toggle"
              type="checkbox"
              checked={regenerate}
              disabled={!chainStatus.fal_ready}
              onChange={(e) => setRegenerate(e.target.checked)}
            />
            <span style={{ fontWeight: 700 }}>Generate Bantu Groove layer via fal.ai</span>
            {!chainStatus.fal_ready && <span style={{ fontSize: 9, color: '#F59E0B' }}>(FAL_KEY missing)</span>}
          </label>
          {regenerate && chainStatus.fal_ready && (
            <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 8 }}>
              <input
                data-testid="remix-regen-prompt"
                value={regenPrompt}
                onChange={(e) => setRegenPrompt(e.target.value)}
                placeholder="bantu groove prompt"
                style={input}
              />
              <input
                data-testid="remix-regen-duration"
                type="number" min={5} max={60}
                value={regenDuration}
                onChange={(e) => setRegenDuration(parseInt(e.target.value || '15', 10))}
                style={input}
              />
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            data-testid="remix-run-btn"
            className="riba-btn"
            disabled={busy || !file}
            onClick={runRemix}
            style={{
              flex: 1, padding: '12px 0', fontSize: 13, fontWeight: 800,
              background: 'linear-gradient(135deg, #6366F1, #D946EF)',
              color: '#fff', border: 'none', borderRadius: 10,
              boxShadow: '0 0 18px rgba(217,70,239,0.4)',
              cursor: busy ? 'wait' : 'pointer', opacity: (busy || !file) ? 0.55 : 1,
            }}
          >
            {busy ? '⚙ Re-mixing…' : '⚡ Run Magic Re-mix'}
          </button>
          {lastResult && (
            <button
              data-testid="remix-import-btn"
              className="riba-btn"
              onClick={importToDaw}
              style={{
                padding: '12px 14px', fontSize: 12, fontWeight: 800,
                background: 'linear-gradient(135deg, #22D3EE, #6366F1)',
                color: '#fff', border: 'none', borderRadius: 10,
              }}
            >⤵ Import to Timeline</button>
          )}
        </div>

        {/* Status / progress */}
        {status && (
          <div data-testid="remix-status" style={{
            fontSize: 11, color: progress ? '#D946EF' : '#A1A1AA',
            fontFamily: 'JetBrains Mono, monospace',
            background: '#0B0B0E', padding: '8px 10px', borderRadius: 6,
            border: '1px solid rgba(255,255,255,0.05)',
          }}>{status}</div>
        )}

        {/* Result summary */}
        {lastResult && (
          <div data-testid="remix-result" style={{
            background: '#0B0B0E', borderRadius: 8, padding: 10,
            border: '1px solid rgba(34,197,94,0.25)', display: 'flex', flexDirection: 'column', gap: 6,
          }}>
            <div style={{ fontSize: 11, color: '#22C55E', fontWeight: 700 }}>
              ✓ Stems generated · mode = {lastResult.mode}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.keys(lastResult.stems || {}).map((k) => (
                <span key={k} style={{
                  fontSize: 9, padding: '2px 7px', borderRadius: 4,
                  background: k === 'bantu_groove' ? 'rgba(217,70,239,0.15)' : 'rgba(34,211,238,0.1)',
                  color: k === 'bantu_groove' ? '#D946EF' : '#22D3EE',
                  border: '1px solid currentColor',
                  fontWeight: 700, letterSpacing: '0.08em',
                }}>{k} · {Math.round((lastResult.stems[k].bytes || 0) / 1024)}KB</span>
              ))}
            </div>
            <div style={{ fontSize: 10, color: '#71717A', fontStyle: 'italic' }}>
              Bantu: {lastResult.bantu?.description}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
