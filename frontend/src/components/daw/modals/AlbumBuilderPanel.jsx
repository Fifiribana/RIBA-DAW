import React, { useCallback, useEffect, useMemo, useState } from 'react';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const BANTU_STYLES = [
  { id: 'bikutsi_44',   label: 'Bikutsi 4/4' },
  { id: 'bikutsi_68',   label: 'Bikutsi 6/8' },
  { id: 'bikutsi_1224', label: 'Bikutsi 12/24' },
  { id: 'makossa_roots',label: 'Makossa Roots' },
  { id: 'asiko_wisdom', label: 'Asiko Wisdom' },
];

const lbl = { fontSize: 9, color: '#71717A', letterSpacing: '0.12em', display: 'block', marginBottom: 4 };
const inp = {
  width: '100%', background: '#0B0B0E', color: '#FAFAFA',
  border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 10px',
  fontSize: 12, outline: 'none', boxSizing: 'border-box',
};

/**
 * AlbumBuilderPanel — second tab of the Magic Generator.
 *
 *  • Lists workspace items with an audio_url so the user can pick the album.
 *  • Drag-and-drop reorder using HTML5 dataTransfer.
 *  • POST /api/ai/album/teaser → mosaic cover + 60s Bantu-Drop-Map MP4.
 */
export function AlbumBuilderPanel({ workspaceItems = [] }) {
  const [selected, setSelected] = useState([]);          // ordered list of track IDs
  const [title, setTitle] = useState('RIBA Album');
  const [styleLabel, setStyleLabel] = useState('Bantu Drop Map');
  const [bantuStyle, setBantuStyle] = useState('bikutsi_44');
  const [mode, setMode] = useState('drop_map');
  const [target, setTarget] = useState(60);
  const [transition, setTransition] = useState(1.5);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [output, setOutput] = useState(null);            // last album response
  const [dragId, setDragId] = useState(null);

  const playable = useMemo(
    () => workspaceItems.filter((it) => it.audio_url && it.kind !== 'lyrics'),
    [workspaceItems],
  );

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : (s.length < 16 ? [...s, id] : s)));
  };

  const move = (from, to) => {
    if (from === to || from < 0 || to < 0 || from >= selected.length || to >= selected.length) return;
    const a = [...selected];
    const [x] = a.splice(from, 1);
    a.splice(to, 0, x);
    setSelected(a);
  };

  const generate = async () => {
    if (selected.length < 1) { setStatus('Pick at least 1 track.'); return; }
    setBusy(true); setOutput(null);
    setStatus(`🎼 Building Bantu Drop Map for ${selected.length} track${selected.length > 1 ? 's' : ''}…`);
    try {
      const r = await fetch(`${API}/ai/album/teaser`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          track_ids:       selected,
          mode,
          target_duration: target,
          transition_sec:  transition,
          bantu_style:     bantuStyle,
          title,
          style_label:     styleLabel,
        }),
      });
      if (!r.ok) {
        const b = await r.json().catch(() => ({}));
        throw new Error(b.detail || `HTTP ${r.status}`);
      }
      const d = await r.json();
      setOutput(d);
      const mp3 = d.mp3_bytes ? ` + MP3 ${Math.round(d.mp3_bytes / 1024)}KB` : '';
      setStatus(`✓ Album teaser ready · ${selected.length} tracks · ${d.duration}s · crossfade ${d.transition_sec}s${mp3}`);
    } catch (e) {
      setStatus(`Album build failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="album-builder-panel" style={{
      display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, height: 580,
    }}>
      {/* LEFT — picker + drag-drop order */}
      <div style={{
        background: '#09090B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
        padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        <div className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.14em' }}>
          PICK · {playable.length} tracks available · {selected.length}/16 selected
        </div>
        {playable.length === 0 && (
          <div style={{ fontSize: 11, color: '#71717A', fontStyle: 'italic', textAlign: 'center', padding: 30 }}>
            Generate tracks in the Magic Generator first, then come back here.
          </div>
        )}
        {playable.map((it) => {
          const picked = selected.includes(it.id);
          const order = selected.indexOf(it.id);
          return (
            <div
              key={it.id}
              data-testid={`album-pick-${it.id}`}
              draggable={picked}
              onDragStart={() => picked && setDragId(it.id)}
              onDragOver={(e) => { if (picked) e.preventDefault(); }}
              onDrop={(e) => {
                if (!picked || !dragId) return;
                e.preventDefault();
                const from = selected.indexOf(dragId);
                const to = selected.indexOf(it.id);
                move(from, to); setDragId(null);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                borderRadius: 6,
                background: picked ? 'rgba(217,70,239,0.08)' : '#0B0B0E',
                border: picked ? '1px solid rgba(217,70,239,0.4)' : '1px solid rgba(255,255,255,0.04)',
                cursor: 'pointer',
              }}
              onClick={() => toggle(it.id)}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 4,
                background: picked ? 'linear-gradient(135deg, #D946EF, #6366F1)' : 'rgba(255,255,255,0.05)',
                color: '#fff', fontSize: 11, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{picked ? (order + 1) : '+'}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#FAFAFA',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>{it.title || 'Untitled'}</div>
                <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
                  {(it.tags || []).slice(0, 3).join(' · ')}
                </div>
              </div>
              {picked && <span style={{ color: '#71717A', fontSize: 11 }}>⋮⋮</span>}
            </div>
          );
        })}
      </div>

      {/* RIGHT — config + output */}
      <div style={{
        background: '#09090B', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10,
        padding: 12, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto',
      }}>
        <div className="font-heading" style={{ fontSize: 14, fontWeight: 700, color: '#FAFAFA' }}>
          🎼 Album Teaser · Bantu Drop Map
        </div>

        <div>
          <label style={lbl}>ALBUM TITLE</label>
          <input data-testid="album-title" value={title} onChange={(e) => setTitle(e.target.value)} style={inp} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>BANTU STYLE</label>
            <select data-testid="album-bantu-style" value={bantuStyle} onChange={(e) => setBantuStyle(e.target.value)} style={inp}>
              {BANTU_STYLES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>MODE</label>
            <select data-testid="album-mode" value={mode} onChange={(e) => setMode(e.target.value)} style={inp}>
              <option value="drop_map">Bantu Drop Map (best snippets)</option>
              <option value="sequential">Sequential (from track start)</option>
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <div>
            <label style={lbl}>TARGET DURATION (s)</label>
            <input data-testid="album-target" type="number" min={15} max={120} value={target}
              onChange={(e) => setTarget(parseInt(e.target.value || '60', 10))} style={inp} />
          </div>
          <div>
            <label style={lbl}>CROSSFADE (s)</label>
            <input data-testid="album-transition" type="number" step={0.1} min={0.5} max={3} value={transition}
              onChange={(e) => setTransition(parseFloat(e.target.value || '1.5'))} style={inp} />
          </div>
        </div>

        <button
          data-testid="album-generate"
          onClick={generate}
          disabled={busy || selected.length < 1}
          className="riba-btn"
          style={{
            padding: '12px 0', fontSize: 13, fontWeight: 800,
            background: 'linear-gradient(135deg, #D946EF, #6366F1, #22D3EE)',
            color: '#fff', border: 'none', borderRadius: 10,
            boxShadow: '0 0 16px rgba(217,70,239,0.4)',
            cursor: busy ? 'wait' : 'pointer', opacity: (busy || selected.length < 1) ? 0.6 : 1,
          }}
        >
          {busy ? '⚙ Building Bantu Drop Map…' : '📱 Export Full Album Teaser'}
        </button>

        {status && (
          <div data-testid="album-status" style={{
            fontSize: 11, color: busy ? '#D946EF' : '#A1A1AA',
            fontFamily: 'JetBrains Mono, monospace', padding: '6px 9px', borderRadius: 6,
            background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.05)',
          }}>{status}</div>
        )}

        {output && (
          <div data-testid="album-output" style={{
            display: 'flex', gap: 10, background: '#0B0B0E', borderRadius: 8, padding: 10,
            border: '1px solid rgba(34,197,94,0.3)',
          }}>
            <img
              src={`${BACKEND_URL}${output.cover_url}`}
              alt="album cover"
              style={{ width: 90, height: 90, borderRadius: 6, flexShrink: 0 }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#FAFAFA' }}>{output.title}</div>
              <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
                {output.tracks} tracks · {output.duration}s · crossfade {output.transition_sec}s · {output.bantu_style}
              </div>
              <video
                src={`${BACKEND_URL}${output.mp4_url}`}
                controls muted loop playsInline
                style={{ width: '100%', maxHeight: 120, borderRadius: 6, background: '#050507' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                <a
                  data-testid="album-download-mp4"
                  href={`${BACKEND_URL}${output.mp4_url}`}
                  download={`${output.title}-${output.id.slice(0, 6)}.mp4`}
                  className="riba-btn"
                  style={{
                    flex: 1, textAlign: 'center', textDecoration: 'none',
                    fontSize: 10, padding: '5px 0', fontWeight: 700,
                    background: 'linear-gradient(135deg, #D946EF, #F59E0B)',
                    color: '#fff', border: 'none', borderRadius: 6,
                  }}
                >⬇ MP4</a>
                {output.mp3_url && (
                  <a
                    data-testid="album-download-mp3"
                    href={`${BACKEND_URL}${output.mp3_url}`}
                    download={`${output.title}-${output.id.slice(0, 6)}.mp3`}
                    className="riba-btn"
                    style={{
                      flex: 1, textAlign: 'center', textDecoration: 'none',
                      fontSize: 10, padding: '5px 0', fontWeight: 700,
                      background: 'rgba(34,211,238,0.1)', color: '#22D3EE',
                      border: '1px solid rgba(34,211,238,0.3)', borderRadius: 6,
                    }}
                  >⬇ MP3</a>
                )}
                <a
                  href={`${BACKEND_URL}${output.cover_url}`}
                  download={`${output.title}-cover.png`}
                  className="riba-btn"
                  style={{
                    flex: 1, textAlign: 'center', textDecoration: 'none',
                    fontSize: 10, padding: '5px 0', fontWeight: 700,
                    background: 'rgba(245,158,11,0.1)', color: '#F59E0B',
                    border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6,
                  }}
                >⬇ Cover</a>
              </div>
            </div>
          </div>
        )}

        {output?.segments?.length > 0 && (
          <div style={{ fontSize: 10, color: '#71717A', fontFamily: 'JetBrains Mono, monospace' }}>
            Picks:
            {output.segments.map((s, i) => (
              <div key={i}>
                {i + 1}. {s.title?.slice(0, 24)} → @{s.start_sec}s ({s.debug?.picked_name || 'n/a'})
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
