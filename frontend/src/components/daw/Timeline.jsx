import React, { useEffect, useMemo, useRef } from 'react';
import { TID } from '@/constants/testIds';
import { computeBantuGrid, BANTU_STYLES } from '@/lib/bantuGrid';
import { LiveCursorOverlay } from './useStudioLive';

export function Timeline({
  isPlaying, looping, maxBeats, timeSig, tempo,
  onLoopWrap, onPositionChange,
  // Bantu Grid overlay
  showBantuMarkers = false,
  bantuStyle = 'bikutsi_44',
  bantuDensity = 16,
  bantuBars = 4,
  // Studio Live cursors
  collaborators = [],
  onLocalCursor = null,
  // Storytelling chapter markers (4 segments with bar_start/bar_end + label + color)
  storyChapters = null,
}) {
  const containerRef = useRef(null);
  const headRef = useRef(null);
  const labelRef = useRef(null);
  const beatRef = useRef(0);

  // reset on play start
  useEffect(() => {
    if (isPlaying) beatRef.current = 0;
  }, [isPlaying]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      if (isPlaying) {
        const cur = beatRef.current + (dt * tempo) / 60;
        if (cur >= maxBeats) {
          if (looping) {
            beatRef.current = 0;
            if (onLoopWrap) onLoopWrap();
          } else {
            beatRef.current = maxBeats;
          }
        } else {
          beatRef.current = cur;
        }
      }
      const beat = beatRef.current;
      if (onPositionChange) onPositionChange(beat);
      const pct = Math.min(100, (beat / maxBeats) * 100);
      if (headRef.current) headRef.current.style.left = pct + '%';
      if (labelRef.current) {
        const m = Math.floor(beat / timeSig) + 1;
        const b = Math.floor(beat % timeSig) + 1;
        labelRef.current.textContent = `${m}.${b} · ${beat.toFixed(2)} beats · ${((beat * 60) / tempo).toFixed(2)}s`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, looping, maxBeats, timeSig, tempo, onLoopWrap, onPositionChange]);

  const handleClick = (e) => {
    const r = containerRef.current.getBoundingClientRect();
    const x = e.clientX - r.left;
    beatRef.current = Math.max(0, Math.min(maxBeats, (x / r.width) * maxBeats));
  };
  const handleMouseMove = (e) => {
    if (!onLocalCursor) return;
    const r = containerRef.current.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    const percent_x = Math.max(0, Math.min(1, px / r.width));
    const percent_y = Math.max(0, Math.min(1, py / r.height));
    onLocalCursor({
      target: 'timeline',
      percent_x, percent_y,
      beat: percent_x * maxBeats,
    });
  };
  const handleMouseLeave = () => { if (onLocalCursor) onLocalCursor(null); };
  const measures = Math.ceil(maxBeats / timeSig);

  // === Bantu Oral Grid markers (RIBA innovation) ===
  // Computed once when style/density/bars change; positions are in beats.
  const bantuPositions = useMemo(() => {
    if (!showBantuMarkers) return [];
    return computeBantuGrid(bantuStyle, bantuDensity, bantuBars);
  }, [showBantuMarkers, bantuStyle, bantuDensity, bantuBars]);
  const bantuColor = (BANTU_STYLES.find((s) => s.id === bantuStyle) || BANTU_STYLES[0]).color;

  return (
    <div
      ref={containerRef}
      data-testid={TID.timeline}
      onClick={handleClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        height: 28, background: '#0B0B0E', borderBottom: '1px solid rgba(255,255,255,0.05)',
        position: 'relative', overflow: 'hidden', flexShrink: 0, cursor: 'pointer'
      }}
    >
      {/* Storytelling chapter bands — render BEHIND everything else */}
      {Array.isArray(storyChapters) && storyChapters.map((ch, i) => {
        const startBeat = (ch.bar_start - 1) * timeSig;
        const endBeat = ch.bar_end * timeSig;
        const left = Math.max(0, (startBeat / maxBeats) * 100);
        const right = Math.min(100, (endBeat / maxBeats) * 100);
        const width = Math.max(0, right - left);
        // Colour by slug — keep palette aligned with the modal
        const slugColors = {
          intro:   '#22D3EE',
          defi:    '#F59E0B',
          combat:  '#D946EF',
          sagesse: '#22C55E',
        };
        const col = slugColors[ch.slug] || '#71717A';
        return (
          <React.Fragment key={`story-${i}`}>
            <div
              data-testid={`story-chapter-${ch.slug}`}
              style={{
                position: 'absolute', left: `${left}%`, top: 0, bottom: 0,
                width: `${width}%`,
                background: `${col}1F`,
                borderLeft: `1px solid ${col}88`,
                borderRight: `1px solid ${col}33`,
                pointerEvents: 'none',
              }}
            />
            <div style={{
              position: 'absolute', left: `${left + 0.4}%`, top: 1,
              fontSize: 8.5, color: col, fontWeight: 700,
              letterSpacing: '0.04em', textTransform: 'uppercase',
              fontFamily: 'JetBrains Mono, monospace',
              textShadow: '0 1px 2px rgba(0,0,0,0.7)',
              pointerEvents: 'none',
            }}>{ch.marker_label}</div>
          </React.Fragment>
        );
      })}
      {/* Bantu Grid asymmetric markers — render BEHIND measure lines */}
      {showBantuMarkers && bantuPositions.map((b, i) => {
        const x = (b / maxBeats) * 100;
        if (x < 0 || x > 100) return null;
        return (
          <div
            key={`bantu-${i}`}
            data-testid="bantu-marker"
            style={{
              position: 'absolute', left: `${x}%`, top: 0, bottom: 0,
              width: 1,
              background: bantuColor,
              opacity: 0.35,
              pointerEvents: 'none',
              boxShadow: `0 0 4px ${bantuColor}66`,
            }}
          />
        );
      })}
      {/* Standard measure lines (in front of bantu markers) */}
      {Array.from({ length: measures + 1 }).map((_, m) => {
        const x = ((m * timeSig) / maxBeats) * 100;
        return (
          <div key={m} style={{
            position: 'absolute', left: `${x}%`, top: 0, bottom: 0,
            width: 1, background: m === 0 ? 'transparent' : 'rgba(255,255,255,0.08)'
          }}>
            <span style={{
              position: 'absolute', top: 4, left: 4, fontSize: 9, color: '#52525B',
              fontFamily: 'JetBrains Mono, monospace'
            }}>{m + 1}</span>
          </div>
        );
      })}
      <div
        ref={headRef}
        data-testid={TID.playhead}
        style={{
          position: 'absolute', top: 0, bottom: 0,
          left: '0%',
          width: 2, background: '#EF4444', boxShadow: '0 0 8px #EF4444',
          pointerEvents: 'none'
        }}
      />
      <div
        ref={labelRef}
        style={{
          position: 'absolute', right: 8, top: 6, fontSize: 10, color: '#A1A1AA',
          fontFamily: 'JetBrains Mono, monospace', background: 'rgba(0,0,0,0.5)',
          padding: '1px 6px', borderRadius: 3
        }}
      >1.1 · 0.00 beats · 0.00s</div>
      {/* Live collaborator cursors (Studio Live) */}
      <LiveCursorOverlay collaborators={collaborators} />
    </div>
  );
}
