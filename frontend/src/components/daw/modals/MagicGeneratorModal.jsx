import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { MagentaSpinner } from '../MagentaSpinner';
import { AlbumBuilderPanel } from './AlbumBuilderPanel';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STYLE_TAGS = [
  { id: 'asiko',    label: 'Asiko' },
  { id: 'makossa',  label: 'Makossa' },
  { id: 'bikutsi',  label: 'Bikutsi' },
  { id: 'rumba',    label: 'Rumba' },
  { id: 'afrobeat', label: 'Afrobeat' },
  { id: 'soukous',  label: 'Soukous' },
  { id: 'highlife', label: 'Highlife' },
  { id: 'ekang',    label: 'Ekang' },
  { id: 'zouk',     label: 'Zouk' },
];

const LYRICS_TABS = [
  { id: 'write',        label: 'Write' },
  { id: 'prompt',       label: 'Prompt' },
  { id: 'instrumental', label: 'Instrumental' },
];

/** Deterministic procedural cover art from a track id (no network needed). */
function ProceduralCover({ seed, tags, size = 96 }) {
  const hash = (s) => [...String(s)].reduce((a, c) => ((a << 5) - a + c.charCodeAt(0)) | 0, 0);
  const h = Math.abs(hash(seed || 'riba'));
  const h1 = (h % 360);
  const h2 = ((h >> 4) % 360);
  const tag = (tags && tags[0]) || 'RIBA';
  return (
    <div style={{
      width: size, height: size, borderRadius: 8, overflow: 'hidden',
      position: 'relative', flexShrink: 0,
      background: `linear-gradient(135deg, hsl(${h1},80%,40%), hsl(${h2},90%,22%))`,
      boxShadow: '0 6px 16px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.06)',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at ${30 + (h % 40)}% ${20 + ((h >> 3) % 60)}%, rgba(217,70,239,0.45), transparent 55%)`,
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at ${70 - (h % 30)}% ${80 - ((h >> 5) % 50)}%, rgba(34,211,238,0.35), transparent 55%)`,
      }} />
      <div style={{
        position: 'absolute', bottom: 4, left: 6,
        fontSize: 9, color: 'rgba(255,255,255,0.85)',
        letterSpacing: '0.16em', fontWeight: 700,
        fontFamily: 'JetBrains Mono, monospace',
      }}>{tag}</div>
    </div>
  );
}

export function MagicGeneratorModal({ onClose, onImportToTimeline, onReusePrompt }) {
  const { t } = useTranslation();
  // === Left panel state ===
  const [mode, setMode] = useState('simple'); // simple | advanced
  const [songTitle, setSongTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [styleText, setStyleText] = useState('Bikutsi, traditional drums, magnetic groove');
  const [lyricsTab, setLyricsTab] = useState('write');
  const [lyricsText, setLyricsText] = useState('');
  const [duration, setDuration] = useState(30);
  const [isCreating, setIsCreating] = useState(false);
  const [isLyricsLoading, setIsLyricsLoading] = useState(false);
  const [statusLine, setStatusLine] = useState('');

  // === Right panel state ===
  const [items, setItems] = useState([]);
  const [currentPlay, setCurrentPlay] = useState(null); // {id, title, audio_url, tags}
  const audioRef = useRef(null);

  // === Library / Upload / Record state ===
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState([]);
  const fileInputRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [recordSecs, setRecordSecs] = useState(0);
  const mediaRecorderRef = useRef(null);
  const recordChunksRef = useRef([]);
  const recordTimerRef = useRef(null);

  // === Workspace card "..." menu ===
  const [openMenuId, setOpenMenuId] = useState(null);
  const [openRemixMenuId, setOpenRemixMenuId] = useState(null);

  // === Top-level tab : Generator | Album Builder ===
  const [activeTab, setActiveTab] = useState('generator');

  const fetchWorkspace = useCallback(async () => {
    try {
      const r = await fetch(`${API}/ai/workspace`);
      const d = await r.json();
      setItems(d.items || []);
    } catch { /* ignore */ }
  }, []);

  const fetchLibrary = useCallback(async () => {
    try {
      const r = await fetch(`${API}/ai/library`);
      const d = await r.json();
      setLibrary(d.items || []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchWorkspace(); }, [fetchWorkspace]);
  useEffect(() => { if (libraryOpen) fetchLibrary(); }, [libraryOpen, fetchLibrary]);

  // close menus when clicking outside
  useEffect(() => {
    if (!openMenuId && !openRemixMenuId) return undefined;
    const onClick = () => { setOpenMenuId(null); setOpenRemixMenuId(null); };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, [openMenuId, openRemixMenuId]);

  const generateLyrics = async () => {
    if (!prompt.trim()) { setStatusLine('Type a prompt first.'); return; }
    setIsLyricsLoading(true);
    setStatusLine('Generating lyrics with Claude…');
    try {
      const r = await fetch(`${API}/ai/generate-lyrics`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style: styleText, language: 'auto' }),
      });
      const d = await r.json();
      const text = (d.sections || [])
        .map((s) => `[${s.type}]\n${s.text}`).join('\n\n');
      setLyricsText(text);
      setLyricsTab('write');
      setStatusLine(d.fallback ? '✓ Lyrics (offline fallback)' : '✓ Lyrics ready');
      fetchWorkspace();
    } catch (e) {
      setStatusLine(`Lyrics error: ${e.message}`);
    } finally {
      setIsLyricsLoading(false);
    }
  };

  const createTrack = async () => {
    if (!prompt.trim() && !styleText.trim()) { setStatusLine('Add a prompt or styles.'); return; }
    setIsCreating(true);
    setStatusLine('Creating track via fal.ai MusicGen…');
    try {
      const r = await fetch(`${API}/ai/generate-track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt || styleText,
          style: styleText,
          duration_seconds: duration,
          instrumental: lyricsTab === 'instrumental' || !lyricsText.trim(),
          title: songTitle.trim() || null,
        }),
      });
      const d = await r.json();
      setStatusLine(d.fallback
        ? `⚠️ ${d.fallback_reason === 'FAL_KEY_MISSING'
            ? 'FAL_KEY not configured — placeholder card added to workspace'
            : `Generation fallback (${d.fallback_reason})`}`
        : `✓ Track ready — "${d.title}"`);
      fetchWorkspace();
    } catch (e) {
      setStatusLine(`Track error: ${e.message}`);
    } finally {
      setIsCreating(false);
    }
  };

  // ===== Upload + Record + Library =====
  const onUploadFile = async (file) => {
    if (!file) return;
    setStatusLine(`Uploading ${file.name} (${Math.round(file.size / 1024)} KB)…`);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      fd.append('title', songTitle.trim());
      fd.append('kind', 'upload');
      fd.append('tags_csv', (styleText.split(/[,;]/)[0] || 'UPLOAD').trim().toUpperCase());
      const r = await fetch(`${API}/ai/upload-reference`, { method: 'POST', body: fd });
      if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
      const d = await r.json();
      setStatusLine(`✓ Uploaded "${d.title}" → workspace`);
      fetchWorkspace();
    } catch (e) {
      setStatusLine(`Upload failed: ${e.message}`);
    }
  };

  const startRecording = async () => {
    if (recording) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
      const mr = new MediaRecorder(stream, { mimeType: mime });
      mediaRecorderRef.current = mr;
      recordChunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data?.size) recordChunksRef.current.push(e.data); };
      mr.onstop = async () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch { /* */ }
        clearInterval(recordTimerRef.current);
        const blob = new Blob(recordChunksRef.current, { type: 'audio/webm' });
        if (!blob.size) { setStatusLine('Recording was empty.'); return; }
        setStatusLine(`Uploading voice memo (${Math.round(blob.size / 1024)} KB)…`);
        const fd = new FormData();
        fd.append('file', blob, `voice-${Date.now()}.webm`);
        fd.append('title', songTitle.trim() || 'Voice Memo');
        fd.append('kind', 'voice');
        fd.append('tags_csv', 'VOICE,REC');
        try {
          const r = await fetch(`${API}/ai/upload-reference`, { method: 'POST', body: fd });
          if (!r.ok) throw new Error((await r.json()).detail || `HTTP ${r.status}`);
          const d = await r.json();
          setStatusLine(`🎙 Recorded "${d.title}" → workspace`);
          fetchWorkspace();
        } catch (e) { setStatusLine(`Mic upload failed: ${e.message}`); }
      };
      mr.start();
      setRecording(true); setRecordSecs(0);
      recordTimerRef.current = setInterval(() => setRecordSecs((s) => s + 1), 1000);
      setStatusLine('🔴 Recording… click again to stop');
    } catch (e) {
      setStatusLine(`Mic denied: ${e.message}`);
    }
  };

  const stopRecording = () => {
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') return;
    mr.stop();
    setRecording(false);
  };

  const importLibraryItem = (it) => {
    if (typeof onImportToTimeline === 'function') onImportToTimeline(it);
    setStatusLine(`⤵ Imported library loop "${it.title}" to timeline`);
    setLibraryOpen(false);
  };

  // ===== Card actions =====
  const reusePrompt = (it) => {
    setSongTitle(it.title || '');
    if (it.prompt) setPrompt(it.prompt);
    if (it.style) setStyleText(it.style);
    setStatusLine(`↩ Loaded prompt + style from "${it.title}"`);
    setOpenMenuId(null);
    if (typeof onReusePrompt === 'function') onReusePrompt(it);
  };

  const remixAs = (it, kind) => {
    // Compose a remix-prompt suffix that drives the next generation
    const suffix = {
      cover: 'cover version, same arrangement, different vocal interpretation',
      mashup: 'mashup with new percussion layer, Bantu polyrhythm overlay',
      sample: 'sample-based reinterpretation, chopped & re-pitched groove',
    }[kind] || 'remix';
    setSongTitle(`${it.title} (${kind})`);
    setPrompt(`${it.prompt || it.title || ''} — ${suffix}`);
    if (it.style) setStyleText(it.style);
    setStatusLine(`🎚 Remix preset = ${kind}. Click ⚡ Create to render the variation.`);
    setOpenMenuId(null);
    setOpenRemixMenuId(null);
  };

  const removeItem = async (id) => {
    await fetch(`${API}/ai/workspace/${id}`, { method: 'DELETE' });
    fetchWorkspace();
    if (currentPlay && currentPlay.id === id) setCurrentPlay(null);
  };

  const playItem = (it) => {
    if (!it.audio_url) { setStatusLine('No audio file for this card yet.'); return; }
    setCurrentPlay(it);
    setTimeout(() => audioRef.current?.play(), 50);
    // Sync with the global bottom transport bar
    try {
      const url = it.audio_url.startsWith('http') ? it.audio_url : `${BACKEND_URL}${it.audio_url}`;
      window.dispatchEvent(new CustomEvent('riba:play-workspace-item', {
        detail: {
          id: it.id,
          title: it.title || 'Untitled',
          audio_url: url,
          tags: it.tags || [],
          playlist: items
            .filter((x) => x.audio_url)
            .map((x) => ({
              id: x.id,
              title: x.title || 'Untitled',
              audio_url: x.audio_url.startsWith('http') ? x.audio_url : `${BACKEND_URL}${x.audio_url}`,
              tags: x.tags || [],
            })),
        },
      }));
    } catch { /* SSR safe */ }
  };

  const importToTimeline = (it) => {
    if (!it.audio_url) { setStatusLine('No audio to import — generate first.'); return; }
    if (typeof onImportToTimeline === 'function') onImportToTimeline(it);
    setStatusLine(`⤵ Imported "${it.title}" to timeline`);
  };

  const filledTags = useMemo(
    () => styleText.split(/[,;]/).map((s) => s.trim()).filter(Boolean).slice(0, 6),
    [styleText]
  );

  return (
    <Modal title={t('magicGen.title')} onClose={onClose} width={1100}>
      {/* Top-level tabs : Generator | Album Builder */}
      <div data-testid="magic-gen-tabs" style={{
        display: 'flex', gap: 4, marginBottom: 12,
        background: '#0B0B0E', borderRadius: 8, padding: 3,
        border: '1px solid rgba(255,255,255,0.05)',
      }}>
        {[
          { id: 'generator', label: '🎵 Generator', desc: 'Suno-style AI music' },
          { id: 'album',     label: '🎼 Album Builder', desc: 'Bantu Drop Map teaser' },
        ].map((t) => (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setActiveTab(t.id)}
            className="riba-btn"
            style={{
              flex: 1, padding: '8px 0', fontSize: 12, border: 'none',
              background: activeTab === t.id
                ? 'linear-gradient(135deg, rgba(217,70,239,0.30), rgba(99,102,241,0.30))'
                : 'transparent',
              color: activeTab === t.id ? '#FAFAFA' : '#A1A1AA',
              fontWeight: activeTab === t.id ? 700 : 500,
              display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center',
            }}
          >
            <span>{t.label}</span>
            <span style={{ fontSize: 9, color: '#71717A', letterSpacing: '0.08em' }}>{t.desc}</span>
          </button>
        ))}
      </div>

      {activeTab === 'album' ? (
        <AlbumBuilderPanel workspaceItems={items} />
      ) : (
      <div style={{
        display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16,
        height: 580,
      }}>
        {/* === LEFT PANEL === */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 12,
          background: '#09090B', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10, padding: 14, overflowY: 'auto',
        }}>
          {/* Simple/Advanced toggle */}
          <div data-testid="mode-toggle" style={{
            display: 'flex', background: '#0B0B0E', borderRadius: 8, padding: 3,
            border: '1px solid rgba(255,255,255,0.05)',
          }}>
            {['simple', 'advanced'].map((m) => (
              <button
                key={m}
                data-testid={`mode-${m}`}
                onClick={() => setMode(m)}
                className="riba-btn"
                style={{
                  flex: 1, fontSize: 11, padding: '6px 0', border: 'none',
                  background: mode === m
                    ? 'linear-gradient(135deg, rgba(217,70,239,0.3), rgba(99,102,241,0.3))'
                    : 'transparent',
                  color: mode === m ? '#FAFAFA' : '#A1A1AA',
                  fontWeight: mode === m ? 700 : 500,
                }}
              >{m === 'simple' ? 'Simple' : 'Advanced'}</button>
            ))}
          </div>

          {/* Inject / capture buttons */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="riba-btn"
              data-testid="inject-audio"
              style={injectBtn}
              onClick={() => fileInputRef.current?.click()}
              title="Upload a local WAV / MP3 reference"
            >+ Audio</button>
            <button
              className="riba-btn"
              data-testid="inject-record"
              style={{
                ...injectBtn,
                background: recording ? 'rgba(239,68,68,0.18)' : injectBtn.background,
                borderColor: recording ? 'rgba(239,68,68,0.5)' : 'rgba(34,211,238,0.25)',
                color: recording ? '#EF4444' : '#22D3EE',
                fontWeight: recording ? 800 : 500,
              }}
              onClick={recording ? stopRecording : startRecording}
              title="Record from microphone (Web Audio API)"
            >
              {recording ? `🔴 ${recordSecs}s · stop` : '🎙 Record'}
            </button>
            <button
              className="riba-btn"
              data-testid="inject-browse"
              style={{ ...injectBtn, background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.25)', color: '#F59E0B' }}
              onClick={() => setLibraryOpen((s) => !s)}
              title="Browse the RIBA loop library"
            >{libraryOpen ? '✕ Close' : '📚 Browse'}</button>
            {/* hidden file input */}
            <input
              ref={fileInputRef}
              data-testid="inject-audio-input"
              type="file"
              accept="audio/wav,audio/mpeg,audio/mp3,audio/ogg,audio/m4a,audio/flac,audio/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUploadFile(f);
                if (e.target) e.target.value = '';
              }}
            />
          </div>

          {/* Library inline panel */}
          {libraryOpen && (
            <div
              data-testid="library-panel"
              style={{
                background: '#0B0B0E', borderRadius: 8, padding: 8,
                border: '1px solid rgba(245,158,11,0.25)',
                display: 'flex', flexDirection: 'column', gap: 4,
                maxHeight: 200, overflowY: 'auto',
              }}
            >
              <div className="font-mono-r" style={{ fontSize: 9, color: '#F59E0B', letterSpacing: '0.12em', marginBottom: 4 }}>
                RIBA LIBRARY · {library.length} LOOPS
              </div>
              {library.length === 0 && <div style={{ fontSize: 10, color: '#71717A' }}>Loading…</div>}
              {library.map((lit) => (
                <div
                  key={lit.id}
                  data-testid={`library-item-${lit.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: 6, borderRadius: 6, background: '#09090B',
                    border: '1px solid rgba(255,255,255,0.04)',
                  }}
                >
                  <ProceduralCover seed={lit.id} tags={lit.tags} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFAFA',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{lit.title}</div>
                    <div style={{ fontSize: 9, color: '#71717A' }} className="font-mono-r">
                      {(lit.tags || []).join(' · ')} · {lit.bpm} BPM
                    </div>
                  </div>
                  <button
                    className="riba-btn"
                    data-testid={`library-play-${lit.id}`}
                    onClick={() => playItem({ ...lit, audio_url: lit.audio_url })}
                    style={{ fontSize: 9, padding: '3px 7px', color: '#D946EF' }}
                  >▶</button>
                  <button
                    className="riba-btn"
                    data-testid={`library-import-${lit.id}`}
                    onClick={() => importLibraryItem(lit)}
                    style={{ fontSize: 9, padding: '3px 7px' }}
                  >⤵</button>
                </div>
              ))}
            </div>
          )}

          {/* Song Title input (Optional) */}
          <div>
            <label className="font-mono-r" style={lbl}>SONG TITLE <span style={{ color: '#3F3F46' }}>(OPTIONAL)</span></label>
            <input
              data-testid="song-title-input"
              value={songTitle}
              onChange={(e) => setSongTitle(e.target.value)}
              placeholder="e.g. Bantu Phoenix"
              style={input}
            />
          </div>

          {/* Prompt textarea */}
          <div>
            <label className="font-mono-r" style={lbl}>PROMPT</label>
            <textarea
              data-testid="prompt-input"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g. A phoenix rising over Yaoundé at dawn"
              rows={3}
              style={input}
            />
          </div>

          {/* Lyrics tabs */}
          <div>
            <label className="font-mono-r" style={lbl}>LYRICS</label>
            <div style={{
              display: 'flex', gap: 2, marginBottom: 6,
              background: '#0B0B0E', borderRadius: 6, padding: 2,
            }}>
              {LYRICS_TABS.map((t) => (
                <button
                  key={t.id}
                  data-testid={`lyrics-tab-${t.id}`}
                  onClick={() => setLyricsTab(t.id)}
                  className="riba-btn"
                  style={{
                    flex: 1, fontSize: 10, padding: '5px 0', border: 'none',
                    background: lyricsTab === t.id ? '#1F1F23' : 'transparent',
                    color: lyricsTab === t.id ? '#D946EF' : '#71717A',
                    fontWeight: lyricsTab === t.id ? 700 : 500,
                  }}
                >{t.label}</button>
              ))}
            </div>
            {lyricsTab === 'instrumental' ? (
              <div style={{
                padding: 14, textAlign: 'center', color: '#71717A', fontSize: 11,
                background: '#0B0B0E', borderRadius: 6, border: '1px dashed rgba(255,255,255,0.05)',
              }}>
                🎼 Instrumental only — no vocals will be generated.
              </div>
            ) : lyricsTab === 'prompt' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className="riba-btn"
                  data-testid="generate-lyrics-btn"
                  onClick={generateLyrics}
                  disabled={isLyricsLoading || !prompt.trim()}
                  style={{
                    background: 'linear-gradient(135deg, #6366F1, #D946EF)',
                    color: '#fff', border: 'none', fontSize: 11, padding: '8px 0',
                    fontWeight: 700, opacity: isLyricsLoading ? 0.6 : 1,
                  }}
                >
                  {isLyricsLoading ? '✨ Writing…' : '✨ Generate with Claude'}
                </button>
                {lyricsText && (
                  <textarea value={lyricsText} readOnly rows={6} style={{ ...input, fontSize: 10.5, lineHeight: 1.5 }} />
                )}
              </div>
            ) : (
              <textarea
                data-testid="lyrics-text"
                value={lyricsText}
                onChange={(e) => setLyricsText(e.target.value)}
                rows={6}
                placeholder="[Verse]\nWrite your lyrics here..."
                style={{ ...input, fontSize: 11, lineHeight: 1.5 }}
              />
            )}
          </div>

          {/* Styles */}
          <div>
            <label className="font-mono-r" style={lbl}>STYLES</label>
            <textarea
              data-testid="styles-input"
              value={styleText}
              onChange={(e) => setStyleText(e.target.value)}
              rows={2}
              style={input}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {STYLE_TAGS.map((t) => (
                <button
                  key={t.id}
                  data-testid={`tag-${t.id}`}
                  onClick={() => setStyleText((s) => s ? `${s}, ${t.label}` : t.label)}
                  className="riba-btn"
                  style={{
                    fontSize: 9, padding: '3px 7px',
                    background: 'rgba(217,70,239,0.08)',
                    border: '1px solid rgba(217,70,239,0.2)',
                    color: '#D946EF',
                  }}
                >{t.label}</button>
              ))}
            </div>
          </div>

          {/* Advanced extras */}
          {mode === 'advanced' && (
            <div>
              <label className="font-mono-r" style={lbl}>DURATION (sec)</label>
              <input
                data-testid="duration-input"
                type="number" min={5} max={90} value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value || '30', 10))}
                style={input}
              />
            </div>
          )}

          {/* Create button */}
          <button
            data-testid="create-btn"
            onClick={createTrack}
            disabled={isCreating}
            className="riba-btn"
            style={{
              marginTop: 'auto',
              padding: '12px 0', fontSize: 13, fontWeight: 800,
              background: 'linear-gradient(135deg, #D946EF, #F59E0B)',
              color: '#fff', border: 'none', borderRadius: 10,
              boxShadow: '0 0 18px rgba(217,70,239,0.5)',
              cursor: isCreating ? 'wait' : 'pointer', opacity: isCreating ? 0.7 : 1,
            }}
          >
            {isCreating ? '⚡ Creating…' : '⚡ Create'}
          </button>
          {statusLine && (
            <div data-testid="status-line" style={{ fontSize: 10, color: '#71717A', textAlign: 'center', fontStyle: 'italic' }}>
              {statusLine}
            </div>
          )}
        </div>

        {/* === RIGHT PANEL: GALLERY === */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: '#09090B', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10, padding: 14, overflow: 'hidden',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 10,
          }}>
            <div className="font-heading" style={{ fontSize: 15, fontWeight: 700, color: '#FAFAFA' }}>
              Workspace · {items.length} item{items.length !== 1 ? 's' : ''}
            </div>
            <button
              className="riba-btn"
              data-testid="refresh-workspace"
              onClick={fetchWorkspace}
              style={{ fontSize: 10, padding: '3px 8px' }}
            >Refresh</button>
          </div>

          <div
            data-testid="workspace-grid"
            style={{
              flex: 1, overflowY: 'auto',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: 10, alignContent: 'start',
              paddingBottom: 80,
            }}
          >
            {items.length === 0 && (
              <div style={{
                gridColumn: '1 / -1', color: '#71717A', fontSize: 12,
                textAlign: 'center', padding: 40, fontStyle: 'italic',
              }}>
                🌍 No creations yet. Type a prompt on the left and hit ⚡ Create.
              </div>
            )}
            {items.map((it) => (
              <div
                key={it.id}
                data-testid={`card-${it.id}`}
                style={{
                  background: '#0B0B0E', borderRadius: 10, padding: 10,
                  border: '1px solid rgba(255,255,255,0.06)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                  transition: 'border-color 200ms',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(217,70,239,0.4)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
              >
                <div style={{ display: 'flex', gap: 10 }}>
                  <ProceduralCover seed={it.id} tags={it.tags} size={72} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 12.5, fontWeight: 700, color: '#FAFAFA',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>{it.title || 'Untitled'}</div>
                    <div style={{ fontSize: 9.5, color: '#71717A', marginTop: 2 }} className="font-mono-r">
                      {(it.tags || []).slice(0, 3).join(' · ')}
                    </div>
                    {it.fallback && (
                      <div style={{
                        fontSize: 9, color: '#F59E0B', marginTop: 4,
                        background: 'rgba(245,158,11,0.08)', padding: '1px 5px',
                        borderRadius: 3, display: 'inline-block',
                      }}>
                        {it.fallback_reason === 'FAL_KEY_MISSING' ? 'card only' : 'fallback'}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, position: 'relative' }}>
                  <button
                    className="riba-btn"
                    data-testid={`play-${it.id}`}
                    onClick={() => playItem(it)}
                    disabled={!it.audio_url}
                    style={{
                      flex: 1, fontSize: 10, padding: '5px 0',
                      background: 'rgba(217,70,239,0.15)',
                      border: '1px solid rgba(217,70,239,0.3)',
                      color: '#D946EF', fontWeight: 700,
                      opacity: !it.audio_url ? 0.4 : 1,
                    }}
                  >▶ Play</button>
                  <button
                    className="riba-btn"
                    data-testid={`import-${it.id}`}
                    onClick={() => importToTimeline(it)}
                    disabled={!it.audio_url}
                    style={{
                      fontSize: 10, padding: '5px 8px',
                      opacity: !it.audio_url ? 0.4 : 1,
                    }}
                    title="Import to RIBA Timeline"
                  >⤵</button>
                  <button
                    className="riba-btn"
                    data-testid={`menu-${it.id}`}
                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === it.id ? null : it.id); setOpenRemixMenuId(null); }}
                    style={{ fontSize: 12, padding: '5px 8px', fontWeight: 800, lineHeight: 1 }}
                    title="More actions"
                  >⋯</button>
                  <button
                    className="riba-btn"
                    data-testid={`delete-${it.id}`}
                    onClick={() => removeItem(it.id)}
                    style={{ fontSize: 10, padding: '5px 8px', color: '#EF4444' }}
                    title="Delete"
                  >✕</button>

                  {/* === Card "..." context menu === */}
                  {openMenuId === it.id && (
                    <div
                      data-testid={`menu-popup-${it.id}`}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        position: 'absolute', right: 28, bottom: '105%',
                        background: '#09090B', border: '1px solid rgba(217,70,239,0.3)',
                        borderRadius: 8, padding: 4, minWidth: 180, zIndex: 30,
                        boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
                      }}
                    >
                      {/* Remix sub-menu */}
                      <div
                        data-testid={`menu-remix-${it.id}`}
                        onMouseEnter={() => setOpenRemixMenuId(it.id)}
                        style={{
                          position: 'relative',
                          padding: '6px 10px', cursor: 'pointer',
                          fontSize: 11, color: '#FAFAFA', borderRadius: 4,
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          background: openRemixMenuId === it.id ? 'rgba(217,70,239,0.12)' : 'transparent',
                        }}
                      >
                        <span>🎚 Remix</span>
                        <span style={{ color: '#71717A', fontSize: 9 }}>▶</span>
                        {openRemixMenuId === it.id && (
                          <div
                            data-testid={`menu-remix-sub-${it.id}`}
                            style={{
                              position: 'absolute', left: '100%', top: -4,
                              background: '#09090B', border: '1px solid rgba(217,70,239,0.3)',
                              borderRadius: 8, padding: 4, minWidth: 170,
                              boxShadow: '0 8px 22px rgba(0,0,0,0.5)',
                            }}
                          >
                            {['cover', 'mashup', 'sample'].map((k) => (
                              <div
                                key={k}
                                data-testid={`menu-remix-${k}-${it.id}`}
                                onClick={() => remixAs(it, k)}
                                style={{
                                  padding: '6px 10px', cursor: 'pointer',
                                  fontSize: 11, color: '#FAFAFA', borderRadius: 4,
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(217,70,239,0.12)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                {k === 'cover' && '🎙 Cover'}
                                {k === 'mashup' && '🎛 Mashup'}
                                {k === 'sample' && '✂ Sample this song'}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        data-testid={`menu-reuse-${it.id}`}
                        onClick={() => reusePrompt(it)}
                        onMouseEnter={() => setOpenRemixMenuId(null)}
                        style={{
                          padding: '6px 10px', cursor: 'pointer',
                          fontSize: 11, color: '#FAFAFA', borderRadius: 4,
                        }}
                      >↩ Reuse Prompt</div>
                      <div
                        data-testid={`menu-import-${it.id}`}
                        onClick={() => { importToTimeline(it); setOpenMenuId(null); }}
                        onMouseEnter={() => setOpenRemixMenuId(null)}
                        style={{
                          padding: '6px 10px', cursor: it.audio_url ? 'pointer' : 'not-allowed',
                          fontSize: 11, color: it.audio_url ? '#22D3EE' : '#52525B', borderRadius: 4,
                          fontWeight: 700,
                        }}
                      >⤵ Add to Timeline</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Persistent player */}
          {currentPlay && (
            <div
              data-testid="persistent-player"
              style={{
                position: 'absolute', bottom: 14, left: 358, right: 14,
                background: 'rgba(11,11,14,0.95)',
                backdropFilter: 'blur(10px)',
                border: '1px solid rgba(217,70,239,0.3)',
                borderRadius: 10, padding: '8px 12px',
                display: 'flex', alignItems: 'center', gap: 10,
                boxShadow: '0 -4px 18px rgba(0,0,0,0.4)',
              }}
            >
              <ProceduralCover seed={currentPlay.id} tags={currentPlay.tags} size={36} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#FAFAFA' }}>
                  {currentPlay.title || 'Untitled'}
                </div>
                <div style={{ fontSize: 9, color: '#71717A' }} className="font-mono-r">
                  {(currentPlay.tags || []).join(' · ')}
                </div>
              </div>
              <audio
                ref={audioRef}
                src={currentPlay.audio_url.startsWith('http') ? currentPlay.audio_url : `${BACKEND_URL}${currentPlay.audio_url}`}
                controls
                style={{ height: 30, flex: '0 0 280px' }}
              />
              <button
                className="riba-btn"
                onClick={() => setCurrentPlay(null)}
                style={{ fontSize: 10, padding: '4px 8px' }}
              >✕</button>
            </div>
          )}

          {(isCreating || isLyricsLoading) && !currentPlay && (
            <div style={{
              position: 'absolute', bottom: 20, left: 380,
              display: 'flex', alignItems: 'center', gap: 10,
            }}>
              <MagentaSpinner size={24} label="generating…" testId="generator-spinner" />
            </div>
          )}
        </div>
      </div>
      )}
    </Modal>
  );
}

const lbl = { fontSize: 9, color: '#71717A', letterSpacing: '0.12em', display: 'block', marginBottom: 4 };
const input = {
  width: '100%', background: '#0B0B0E', color: '#FAFAFA', resize: 'vertical',
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 10px',
  fontSize: 12, fontFamily: 'Manrope, sans-serif', outline: 'none', boxSizing: 'border-box',
};
const injectBtn = {
  flex: 1, fontSize: 10.5, padding: '6px 0',
  background: 'rgba(34,211,238,0.08)', border: '1px solid rgba(34,211,238,0.25)',
  color: '#22D3EE', borderRadius: 6,
};
