import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * GlobalTransportPlayer — global bottom transport bar synced with the workspace.
 *
 * Listens to the window event 'riba:play-workspace-item' (dispatched by the
 * Magic Generator modal) and plays the picked track here. Supports a full
 * audio-player UX : play/pause, prev/next, shuffle, repeat, volume, scrubber.
 *
 * The bar stays hidden until the first workspace item is queued.
 */
export function GlobalTransportPlayer() {
  const [queue, setQueue] = useState([]);          // [{ id, title, audio_url, tags }]
  const [idx, setIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [dur, setDur] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState('off');     // 'off' | 'one' | 'all'
  const audioRef = useRef(null);

  const cur = idx >= 0 && idx < queue.length ? queue[idx] : null;

  // Listen for workspace play events
  useEffect(() => {
    const onPlay = (e) => {
      const { id, title, audio_url, tags, playlist } = e.detail || {};
      if (!audio_url) return;
      const list = Array.isArray(playlist) && playlist.length ? playlist : [{ id, title, audio_url, tags }];
      const startIdx = Math.max(0, list.findIndex((x) => x.id === id));
      setQueue(list);
      setIdx(startIdx);
      setPlaying(true);
    };
    window.addEventListener('riba:play-workspace-item', onPlay);
    return () => window.removeEventListener('riba:play-workspace-item', onPlay);
  }, []);

  // Apply play/pause on the underlying <audio>
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) a.play().catch(() => setPlaying(false));
    else a.pause();
  }, [playing, idx]);

  useEffect(() => { if (audioRef.current) audioRef.current.volume = volume; }, [volume]);

  const advance = useCallback((delta = 1) => {
    if (queue.length === 0) return;
    if (repeat === 'one') { audioRef.current.currentTime = 0; setPlaying(true); return; }
    let next;
    if (shuffle) next = Math.floor(Math.random() * queue.length);
    else next = (idx + delta + queue.length) % queue.length;
    if (next === idx && repeat === 'off' && delta > 0) { setPlaying(false); return; }
    setIdx(next);
  }, [queue, idx, repeat, shuffle]);

  if (!cur) return null;
  const pct = dur > 0 ? Math.min(100, (time / dur) * 100) : 0;
  const fmt = (s) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60), x = Math.floor(s % 60);
    return `${m}:${x.toString().padStart(2, '0')}`;
  };

  const btn = {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color: '#A1A1AA', fontSize: 14, padding: '4px 8px', fontWeight: 700,
  };
  const btnActive = { ...btn, color: '#D946EF' };

  return (
    <div
      data-testid="global-transport-player"
      style={{
        position: 'fixed', left: 14, right: 14, bottom: 14, zIndex: 60,
        background: 'rgba(11,11,14,0.96)', backdropFilter: 'blur(14px)',
        border: '1px solid rgba(217,70,239,0.3)', borderRadius: 12,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 -8px 28px rgba(0,0,0,0.6), 0 0 24px rgba(217,70,239,0.10)',
        fontFamily: 'Manrope, sans-serif',
      }}
    >
      <audio
        ref={audioRef}
        src={cur.audio_url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onLoadedMetadata={(e) => setDur(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setTime(e.currentTarget.currentTime || 0)}
        onEnded={() => advance(1)}
        style={{ display: 'none' }}
      />

      {/* now playing */}
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: '0 0 200px' }}>
        <div data-testid="gp-title" style={{
          fontSize: 12, fontWeight: 800, color: '#FAFAFA',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{cur.title}</div>
        <div className="font-mono-r" style={{
          fontSize: 9, color: '#71717A', letterSpacing: '0.08em',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{(cur.tags || []).join(' · ')}</div>
      </div>

      {/* controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <button data-testid="gp-shuffle" style={shuffle ? btnActive : btn} onClick={() => setShuffle((s) => !s)} title="Shuffle">⇆</button>
        <button data-testid="gp-prev" style={btn} onClick={() => advance(-1)} title="Previous">⏮</button>
        <button
          data-testid="gp-playpause"
          style={{
            ...btn, color: '#fff', fontSize: 14,
            width: 32, height: 32, borderRadius: '50%',
            background: 'linear-gradient(135deg, #D946EF, #6366F1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 12px rgba(217,70,239,0.4)',
          }}
          onClick={() => setPlaying((p) => !p)}
          title={playing ? 'Pause' : 'Play'}
        >{playing ? '⏸' : '▶'}</button>
        <button data-testid="gp-next" style={btn} onClick={() => advance(1)} title="Next">⏭</button>
        <button
          data-testid="gp-repeat"
          style={repeat !== 'off' ? btnActive : btn}
          onClick={() => setRepeat((r) => r === 'off' ? 'all' : r === 'all' ? 'one' : 'off')}
          title={`Repeat: ${repeat}`}
        >
          {repeat === 'one' ? '↻¹' : '↻'}
        </button>
      </div>

      {/* scrubber + times */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span data-testid="gp-time" className="font-mono-r" style={{ fontSize: 9, color: '#71717A', minWidth: 32 }}>{fmt(time)}</span>
        <div
          data-testid="gp-scrubber"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (audioRef.current && dur > 0) audioRef.current.currentTime = p * dur;
          }}
          style={{
            flex: 1, height: 4, background: 'rgba(255,255,255,0.06)',
            borderRadius: 4, cursor: 'pointer', position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', inset: 0, width: `${pct}%`,
            background: 'linear-gradient(90deg, #6366F1, #D946EF)',
            borderRadius: 4, transition: 'width 100ms linear',
          }} />
        </div>
        <span data-testid="gp-dur" className="font-mono-r" style={{ fontSize: 9, color: '#71717A', minWidth: 32 }}>{fmt(dur)}</span>
      </div>

      {/* volume */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 11, color: '#71717A' }}>♪</span>
        <input
          data-testid="gp-volume"
          type="range" min={0} max={1} step={0.02}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{ width: 70, accentColor: '#D946EF' }}
        />
      </div>

      {/* close */}
      <button
        data-testid="gp-close"
        onClick={() => { setIdx(-1); setQueue([]); setPlaying(false); }}
        style={{ ...btn, color: '#71717A', fontSize: 12 }}
        title="Close player"
      >✕</button>
    </div>
  );
}
