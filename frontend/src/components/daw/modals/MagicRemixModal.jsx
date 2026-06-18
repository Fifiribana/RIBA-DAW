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

  // === Bantu Reel state ===
  const [reelStatus, setReelStatus] = useState({ available: false });
  const [reelBusy, setReelBusy] = useState(false);
  const [reelMsg, setReelMsg] = useState('');
  const [reelOutput, setReelOutput] = useState(null); // { mp4_url, mp3_url, ... }
  const [reelTitle, setReelTitle] = useState('Bantu Phoenix');
  const [reelFormat, setReelFormat] = useState('square_1080');
  const [reelDuration, setReelDuration] = useState(30);

  useEffect(() => {
    fetch(`${API}/ai/remix-status`).then((r) => r.json()).then(setChainStatus).catch(() => {});
    fetch(`${API}/ai/reel-status`).then((r) => r.json()).then(setReelStatus).catch(() => {});
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

  /** Mix all stems together via OfflineAudioContext and return a stereo WAV blob. */
  async function _stemsToMixWav(stemsObj, durationSec) {
    const sr = 44100;
    const ctx = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(2, Math.ceil(sr * durationSec), sr);
    const decoders = [];
    const live = new (window.AudioContext || window.webkitAudioContext)();
    try {
      for (const [name, s] of Object.entries(stemsObj)) {
        if (!s?.wav_base64) continue;
        const bin = Uint8Array.from(atob(s.wav_base64), (c) => c.charCodeAt(0));
        // decode in a live context (Offline cannot decode by itself in some browsers)
        const buf = await live.decodeAudioData(bin.buffer.slice(0));
        decoders.push({ name, buf });
      }
      // simple equal-amplitude mix; bantu_groove gets a slight -3 dB to sit under
      for (const { name, buf } of decoders) {
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = name === 'bantu_groove' ? 0.7 : 0.85;
        src.connect(gain).connect(ctx.destination);
        src.start(0);
      }
    } finally {
      try { await live.close(); } catch { /* ignore */ }
    }
    const rendered = await ctx.startRendering();
    return _audioBufferToWavBlob(rendered);
  }

  /** Minimal RIFF/WAV encoder (16-bit PCM stereo/mono). */
  function _audioBufferToWavBlob(buf) {
    const numCh = buf.numberOfChannels;
    const sr = buf.sampleRate;
    const len = buf.length;
    const bytesPerSample = 2;
    const dataSize = len * numCh * bytesPerSample;
    const out = new ArrayBuffer(44 + dataSize);
    const v = new DataView(out);
    const writeStr = (off, s) => { for (let i = 0; i < s.length; i++) v.setUint8(off + i, s.charCodeAt(i)); };
    writeStr(0, 'RIFF'); v.setUint32(4, 36 + dataSize, true); writeStr(8, 'WAVE');
    writeStr(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true);
    v.setUint16(22, numCh, true); v.setUint32(24, sr, true);
    v.setUint32(28, sr * numCh * bytesPerSample, true);
    v.setUint16(32, numCh * bytesPerSample, true); v.setUint16(34, 16, true);
    writeStr(36, 'data'); v.setUint32(40, dataSize, true);
    let off = 44;
    const channels = [];
    for (let c = 0; c < numCh; c++) channels.push(buf.getChannelData(c));
    for (let i = 0; i < len; i++) {
      for (let c = 0; c < numCh; c++) {
        let s = Math.max(-1, Math.min(1, channels[c][i]));
        s = s < 0 ? s * 0x8000 : s * 0x7FFF;
        v.setInt16(off, s, true); off += 2;
      }
    }
    return new Blob([out], { type: 'audio/wav' });
  }

  const makeReel = async () => {
    if (!lastResult?.stems) { setReelMsg('Run Magic Re-mix first.'); return; }
    if (!reelStatus.available) { setReelMsg('Server ffmpeg unavailable.'); return; }
    setReelBusy(true); setReelOutput(null);
    setReelMsg('🎬 Mixing 5 stems → mixdown WAV…');
    try {
      const wavBlob = await _stemsToMixWav(lastResult.stems, Math.min(60, reelDuration));
      setReelMsg('🎬 Encoding 1080×1080 MP4 with CQT spectrum + brand overlays…');
      const styleLabel = (() => {
        const map = {
          bikutsi_44: 'Bikutsi 4/4',
          bikutsi_68: 'Bikutsi 6/8',
          bikutsi_1224: 'Bikutsi 12/24',
          makossa_roots: 'Makossa Roots',
          asiko_wisdom: 'Asiko Wisdom',
        };
        return map[lastResult.bantu?.style] || 'Bantu Groove';
      })();
      const fd = new FormData();
      fd.append('file', wavBlob, `${reelTitle || 'bantu'}.wav`);
      fd.append('style_label', styleLabel);
      fd.append('title', reelTitle || 'RIBA');
      fd.append('format', reelFormat);
      fd.append('duration_max_sec', String(reelDuration));
      fd.append('with_mp3', 'true');
      const r = await fetch(`${API}/ai/bantu-reel`, { method: 'POST', body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setReelOutput(data);
      const mp3 = data.mp3_url ? ` + MP3 ${Math.round((data.mp3_bytes || 0) / 1024)} KB` : '';
      setReelMsg(`✓ Reel ready · MP4 ${Math.round(data.mp4_bytes / 1024)} KB${mp3}`);
    } catch (e) {
      setReelMsg(`Reel failed: ${e.message}`);
    } finally {
      setReelBusy(false);
    }
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

        {/* === Bantu Reel section — viral export === */}
        {lastResult && (
          <div
            data-testid="bantu-reel-panel"
            style={{
              background: 'linear-gradient(135deg, rgba(217,70,239,0.06), rgba(99,102,241,0.06))',
              border: '1px solid rgba(217,70,239,0.25)', borderRadius: 10, padding: 12,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#FAFAFA', letterSpacing: '-0.01em' }}>
                🎬 Bantu Reel
              </span>
              <span className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.14em' }}>
                MP4 + MP3 · TIKTOK / INSTAGRAM / YOUTUBE SHORTS
              </span>
              {!reelStatus.available && (
                <span style={{ marginLeft: 'auto', fontSize: 9, color: '#F59E0B' }}>ffmpeg unavailable</span>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8 }}>
              <input
                data-testid="reel-title"
                value={reelTitle}
                onChange={(e) => setReelTitle(e.target.value)}
                placeholder="Reel title"
                style={input}
              />
              <select
                data-testid="reel-format"
                value={reelFormat}
                onChange={(e) => setReelFormat(e.target.value)}
                style={input}
              >
                <option value="square_1080">Square 1080</option>
                <option value="reel_1080">Vertical 1080×1920</option>
                <option value="landscape_1080">Landscape 1920×1080</option>
              </select>
              <input
                data-testid="reel-duration"
                type="number" min={5} max={60}
                value={reelDuration}
                onChange={(e) => setReelDuration(parseInt(e.target.value || '30', 10))}
                style={input}
              />
            </div>

            <button
              data-testid="reel-generate-btn"
              className="riba-btn"
              disabled={reelBusy || !reelStatus.available}
              onClick={makeReel}
              style={{
                padding: '10px 0', fontSize: 12, fontWeight: 800,
                background: reelBusy
                  ? 'rgba(217,70,239,0.4)'
                  : 'linear-gradient(135deg, #D946EF, #F59E0B)',
                color: '#fff', border: 'none', borderRadius: 8,
                boxShadow: '0 0 14px rgba(217,70,239,0.35)',
                cursor: reelBusy ? 'wait' : 'pointer',
              }}
            >
              {reelBusy ? '🎬 Rendering reel…' : '📱 Generate Bantu Reel (MP4 + MP3)'}
            </button>

            {reelMsg && (
              <div data-testid="reel-status" style={{
                fontSize: 11, color: reelBusy ? '#D946EF' : '#A1A1AA',
                fontFamily: 'JetBrains Mono, monospace',
                background: '#0B0B0E', padding: '6px 9px', borderRadius: 6,
                border: '1px solid rgba(255,255,255,0.05)',
              }}>{reelMsg}</div>
            )}

            {reelOutput && (
              <div data-testid="reel-output" style={{
                display: 'flex', gap: 10, alignItems: 'center',
                background: '#09090B', borderRadius: 8, padding: 10,
                border: '1px solid rgba(34,211,238,0.25)',
              }}>
                <video
                  data-testid="reel-mp4-preview"
                  src={`${BACKEND_URL}${reelOutput.mp4_url}`}
                  controls muted loop playsInline
                  style={{
                    width: 120, height: reelOutput.format === 'reel_1080' ? 213 : reelOutput.format === 'landscape_1080' ? 67 : 120,
                    borderRadius: 6, background: '#050507', flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFAFA' }}>
                    {reelOutput.title} · {reelOutput.style_label}
                  </div>
                  <div style={{ fontSize: 9, color: '#71717A' }} className="font-mono-r">
                    {reelOutput.width}×{reelOutput.height} · {reelOutput.duration}s · MP4 {Math.round(reelOutput.mp4_bytes / 1024)}KB
                    {reelOutput.mp3_bytes ? ` · MP3 ${Math.round(reelOutput.mp3_bytes / 1024)}KB` : ''}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <a
                      data-testid="reel-download-mp4"
                      href={`${BACKEND_URL}${reelOutput.mp4_url}`}
                      download={`${reelOutput.title}-${reelOutput.id.slice(0, 6)}.mp4`}
                      className="riba-btn"
                      style={{
                        flex: 1, textAlign: 'center', textDecoration: 'none',
                        fontSize: 10, padding: '5px 0', fontWeight: 700,
                        background: 'linear-gradient(135deg, #D946EF, #F59E0B)',
                        color: '#fff', border: 'none', borderRadius: 6,
                      }}
                    >⬇ Download MP4</a>
                    {reelOutput.mp3_url && (
                      <a
                        data-testid="reel-download-mp3"
                        href={`${BACKEND_URL}${reelOutput.mp3_url}`}
                        download={`${reelOutput.title}-${reelOutput.id.slice(0, 6)}.mp3`}
                        className="riba-btn"
                        style={{
                          fontSize: 10, padding: '5px 10px', fontWeight: 700,
                          textDecoration: 'none', color: '#22D3EE',
                          background: 'rgba(34,211,238,0.1)',
                          border: '1px solid rgba(34,211,238,0.3)', borderRadius: 6,
                        }}
                      >⬇ MP3</a>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
