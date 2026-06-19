import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
  // Reel Snippet Picker
  const [snippets, setSnippets] = useState(null);        // { candidates:[...] } or null
  const [snippetBusy, setSnippetBusy] = useState(false);
  const [pickedOffset, setPickedOffset] = useState(0);   // start_sec of chosen snippet
  const [pickedName, setPickedName] = useState(null);    // 'peak_energy' | 'bantu_drop' | 'main_hook' | null

  // === Auto-share state ===
  const [shareStatus, setShareStatus] = useState(null);
  const [sharePack, setSharePack] = useState(null);     // { platforms:{ tiktok, instagram, youtube }, hashtags }
  const [shareDesc, setShareDesc] = useState('');
  const [shareExtraTags, setShareExtraTags] = useState('');
  const [shareSchedule, setShareSchedule] = useState('');
  const [sharePublishing, setSharePublishing] = useState(null); // platform id while in flight
  const [shareJobs, setShareJobs] = useState([]);

  useEffect(() => {
    fetch(`${API}/ai/remix-status`).then((r) => r.json()).then(setChainStatus).catch(() => {});
    fetch(`${API}/ai/reel-status`).then((r) => r.json()).then(setReelStatus).catch(() => {});
    fetch(`${API}/ai/share/status`).then((r) => r.json()).then(setShareStatus).catch(() => {});
  }, []);

  // Reset snippet selection when a new remix result lands
  useEffect(() => {
    setSnippets(null); setPickedOffset(0); setPickedName(null);
  }, [lastResult?.id]);

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
      // Mixdown for the full available material (we trim via start_sec + duration on server)
      const fullSec = Math.max(...Object.values(lastResult.stems || {}).map((s) => {
        const bytes = s.bytes || 0;
        return Math.max(1, bytes / (44100 * 2 * 2)); // rough estimate s16 stereo
      }));
      const wavBlob = await _stemsToMixWav(lastResult.stems, Math.min(180, Math.ceil(fullSec)));
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
      fd.append('start_sec', String(pickedOffset || 0));
      fd.append('with_mp3', 'true');
      const r = await fetch(`${API}/ai/bantu-reel`, { method: 'POST', body: fd });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${r.status}`);
      }
      const data = await r.json();
      setReelOutput(data);
      const mp3 = data.mp3_url ? ` + MP3 ${Math.round((data.mp3_bytes || 0) / 1024)} KB` : '';
      const tag = pickedName ? ` · @${pickedName.replace('_', ' ')}` : '';
      setReelMsg(`✓ Reel ready · MP4 ${Math.round(data.mp4_bytes / 1024)} KB${mp3}${tag}`);
    } catch (e) {
      setReelMsg(`Reel failed: ${e.message}`);
    } finally {
      setReelBusy(false);
    }
  };

  const analyzeSnippets = async () => {
    if (!lastResult?.stems) return;
    setSnippetBusy(true); setReelMsg('🔍 Analysing RMS bands for best snippets…');
    try {
      // Estimate mix duration from any stem buffer to decide if picking is worth it.
      const fullSec = Math.max(...Object.values(lastResult.stems || {}).map((s) =>
        Math.max(1, (s.bytes || 0) / (44100 * 2 * 2))
      ));
      const wavBlob = await _stemsToMixWav(lastResult.stems, Math.min(180, Math.ceil(fullSec)));
      const fd = new FormData();
      fd.append('file', wavBlob, 'mix.wav');
      fd.append('window_sec', String(reelDuration));
      const r = await fetch(`${API}/ai/reel-snippets`, { method: 'POST', body: fd });
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${r.status}`); }
      const d = await r.json();
      setSnippets(d);
      // Auto-pick the highest-scoring candidate as default
      if (d.candidates?.length) {
        const top = [...d.candidates].sort((a, b) => b.score - a.score)[0];
        setPickedOffset(top.start_sec);
        setPickedName(top.name);
      }
      setReelMsg(`✓ ${d.candidates?.length || 0} snippets found · duration=${d.duration}s`);
    } catch (e) {
      setReelMsg(`Snippet analysis failed: ${e.message}`);
    } finally {
      setSnippetBusy(false);
    }
  };

  const pickSnippet = (cand) => {
    setPickedOffset(cand.start_sec);
    setPickedName(cand.name);
    setReelMsg(`🎯 Picked ${cand.label} @${cand.start_sec}s — click Generate Bantu Reel`);
  };

  // === Auto-share handlers ===
  const prepareSharePack = useCallback(async () => {
    if (!reelOutput) return;
    try {
      const extras = shareExtraTags
        .split(/[,\s]+/).map((s) => s.trim().replace(/^#/, '')).filter(Boolean);
      const r = await fetch(`${API}/ai/share/prepare`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:           reelOutput.title || reelTitle,
          style:           reelOutput.style_label,
          description:     shareDesc,
          extra_hashtags:  extras,
          mention_riba:    true,
        }),
      });
      const d = await r.json();
      setSharePack(d);
    } catch (e) { /* swallow */ }
  }, [reelOutput, reelTitle, shareDesc, shareExtraTags]);

  // Auto-prepare whenever the reel is rendered or the share inputs change
  useEffect(() => { if (reelOutput) prepareSharePack(); }, [reelOutput, prepareSharePack]);

  const fetchShareJobs = useCallback(async () => {
    try {
      const r = await fetch(`${API}/ai/share/jobs`);
      const d = await r.json();
      setShareJobs(d.jobs || []);
    } catch { /* */ }
  }, []);

  const publishTo = async (platform) => {
    if (!reelOutput) return;
    setSharePublishing(platform);
    try {
      const pack = sharePack?.platforms?.[platform];
      const tags = sharePack?.hashtags || [];
      const body = {
        reel_id:     reelOutput.id,
        title:       platform === 'youtube' ? sharePack?.platforms?.youtube?.title : (reelOutput.title || reelTitle),
        description: pack?.caption || pack?.description || shareDesc,
        hashtags:    tags,
        schedule_at: shareSchedule ? new Date(shareSchedule).toISOString() : null,
        privacy:     'public',
      };
      const r = await fetch(`${API}/ai/share/${platform}/publish`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (r.ok) {
        setReelMsg(`✓ ${platform} ${d.scheduled ? 'scheduled' : 'published'}`);
      } else {
        const code = d?.detail?.code || `HTTP_${r.status}`;
        const missing = d?.detail?.missing?.join(' / ') || '';
        setReelMsg(`⚠️ ${platform} → ${code}${missing ? ' · need: ' + missing : ''}`);
      }
      fetchShareJobs();
    } catch (e) {
      setReelMsg(`${platform} publish failed: ${e.message}`);
    } finally {
      setSharePublishing(null);
    }
  };

  const copyToClipboard = async (text, label = 'caption') => {
    try { await navigator.clipboard.writeText(text); setReelMsg(`📋 ${label} copied`); }
    catch { setReelMsg(`Clipboard blocked.`); }
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
    <Modal title={t('magicRemix.title')} onClose={onClose} width={720}>
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

            {/* Snippet Picker — analyses the mix and proposes 3 best starting points */}
            <div data-testid="snippet-picker" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  data-testid="analyze-snippets-btn"
                  className="riba-btn"
                  disabled={snippetBusy || !lastResult}
                  onClick={analyzeSnippets}
                  style={{
                    fontSize: 10, padding: '4px 10px',
                    background: snippets ? 'rgba(34,211,238,0.08)' : 'rgba(217,70,239,0.08)',
                    border: '1px solid rgba(217,70,239,0.25)',
                    color: snippets ? '#22D3EE' : '#D946EF',
                    fontWeight: 700,
                  }}
                >
                  {snippetBusy ? '⚙ analysing…' : snippets ? '🔁 Re-analyse snippets' : '🔍 Find best snippets (RMS multi-band)'}
                </button>
                {snippets && (
                  <span className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
                    duration={snippets.duration}s · window={snippets.window_sec}s
                  </span>
                )}
              </div>
              {snippets && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {snippets.candidates.map((c) => {
                    const picked = pickedName === c.name;
                    return (
                      <button
                        key={c.name}
                        data-testid={`snippet-${c.name}`}
                        onClick={() => pickSnippet(c)}
                        className="riba-btn"
                        style={{
                          textAlign: 'left', padding: 8, borderRadius: 8,
                          background: picked
                            ? 'linear-gradient(135deg, rgba(217,70,239,0.25), rgba(99,102,241,0.20))'
                            : '#0B0B0E',
                          border: picked
                            ? '1px solid rgba(217,70,239,0.6)'
                            : '1px solid rgba(255,255,255,0.05)',
                          cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: picked ? '#FAFAFA' : '#E4E4E7' }}>
                            {c.label}
                          </span>
                          {picked && <span style={{ fontSize: 9, color: '#22D3EE', fontWeight: 700 }}>● PICKED</span>}
                        </div>
                        <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>
                          start @ {c.start_sec}s
                        </div>
                        <div style={{
                          height: 3, borderRadius: 3, marginTop: 2,
                          background: 'rgba(255,255,255,0.05)', overflow: 'hidden',
                        }}>
                          <div style={{
                            height: '100%', width: `${(c.score_norm * 100).toFixed(0)}%`,
                            background: 'linear-gradient(90deg, #6366F1, #D946EF, #F59E0B)',
                          }} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
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

            {/* ============ AUTO-SHARE PANEL ============ */}
            {reelOutput && shareStatus && (
              <div
                data-testid="auto-share-panel"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(34,211,238,0.06))',
                  border: '1px solid rgba(99,102,241,0.30)', borderRadius: 10, padding: 12,
                  display: 'flex', flexDirection: 'column', gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#FAFAFA' }}>📡 Auto-share</span>
                  <span className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.12em' }}>
                    TIKTOK · INSTAGRAM REELS · YOUTUBE SHORTS
                  </span>
                </div>

                {/* description + schedule */}
                <textarea
                  data-testid="share-desc"
                  value={shareDesc}
                  onChange={(e) => setShareDesc(e.target.value)}
                  rows={2}
                  placeholder="Description (auto-filled if empty)…"
                  style={input}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                  <input
                    data-testid="share-extra-tags"
                    value={shareExtraTags}
                    onChange={(e) => setShareExtraTags(e.target.value)}
                    placeholder="Extra hashtags (comma separated)"
                    style={input}
                  />
                  <input
                    data-testid="share-schedule"
                    type="datetime-local"
                    value={shareSchedule}
                    onChange={(e) => setShareSchedule(e.target.value)}
                    style={input}
                    title="Schedule (YouTube native; TikTok/IG queued for cron)"
                  />
                </div>

                {/* auto hashtag chips */}
                {sharePack?.hashtags && (
                  <div data-testid="share-hashtags" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {sharePack.hashtags.map((t) => (
                      <span key={t} style={{
                        fontSize: 9, padding: '2px 7px', borderRadius: 999,
                        background: 'rgba(99,102,241,0.10)',
                        border: '1px solid rgba(99,102,241,0.3)',
                        color: '#A5B4FC', fontFamily: 'JetBrains Mono, monospace',
                      }}>{t}</span>
                    ))}
                  </div>
                )}

                {/* per-platform publish buttons */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {['tiktok', 'instagram', 'youtube'].map((p) => {
                    const st = shareStatus.platforms?.[p];
                    const ready = !!st?.configured;
                    const inflight = sharePublishing === p;
                    const labels = { tiktok: 'TikTok', instagram: 'Instagram Reels', youtube: 'YouTube Shorts' };
                    const icons  = { tiktok: '🎵', instagram: '📷', youtube: '▶' };
                    return (
                      <div key={p} style={{
                        background: '#0B0B0E', borderRadius: 8, padding: 8,
                        border: `1px solid ${ready ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.30)'}`,
                        display: 'flex', flexDirection: 'column', gap: 6,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#FAFAFA' }}>
                            {icons[p]} {labels[p]}
                          </span>
                          <span style={{
                            fontSize: 8, padding: '1px 5px', borderRadius: 3,
                            color: ready ? '#22C55E' : '#F59E0B',
                            border: `1px solid ${ready ? 'rgba(34,197,94,0.4)' : 'rgba(245,158,11,0.4)'}`,
                            fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em',
                          }}>{ready ? 'READY' : 'CONFIG'}</span>
                        </div>
                        <button
                          data-testid={`publish-${p}`}
                          className="riba-btn"
                          onClick={() => publishTo(p)}
                          disabled={!ready || inflight}
                          style={{
                            fontSize: 10, padding: '6px 0', fontWeight: 700,
                            background: ready
                              ? 'linear-gradient(135deg, #6366F1, #22D3EE)'
                              : 'rgba(255,255,255,0.05)',
                            color: ready ? '#fff' : '#71717A',
                            border: 'none', borderRadius: 6,
                            cursor: (ready && !inflight) ? 'pointer' : 'not-allowed',
                            opacity: inflight ? 0.6 : 1,
                          }}
                          title={ready ? `Publish to ${labels[p]}` : `Missing: ${(st?.missing || []).join(', ')}`}
                        >
                          {inflight ? '⚙ publishing…' : (ready ? '📤 Publish' : '🔒 Setup needed')}
                        </button>
                        {/* per-platform caption preview + copy */}
                        {sharePack?.platforms?.[p] && (
                          <button
                            data-testid={`copy-${p}`}
                            onClick={() => copyToClipboard(
                              p === 'youtube'
                                ? `${sharePack.platforms.youtube.title}\n\n${sharePack.platforms.youtube.description}`
                                : sharePack.platforms[p].caption,
                              `${labels[p]} caption`,
                            )}
                            style={{
                              fontSize: 8, padding: '3px 0', borderRadius: 4,
                              color: '#A1A1AA', background: 'transparent',
                              border: '1px solid rgba(255,255,255,0.06)', fontWeight: 600,
                              cursor: 'pointer', letterSpacing: '0.1em',
                            }}
                          >📋 COPY CAPTION</button>
                        )}
                        {!ready && st?.missing?.length > 0 && (
                          <div style={{ fontSize: 8, color: '#F59E0B', fontFamily: 'JetBrains Mono, monospace' }}>
                            need: {st.missing.join(', ')}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {shareJobs.length > 0 && (
                  <div data-testid="share-jobs" style={{
                    fontSize: 9, color: '#71717A', fontFamily: 'JetBrains Mono, monospace',
                    borderTop: '1px dashed rgba(255,255,255,0.05)', paddingTop: 6,
                  }}>
                    last job: {shareJobs[0].platform} · {shareJobs[0].status} · {shareJobs[0].submitted_at?.slice(11, 19)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
