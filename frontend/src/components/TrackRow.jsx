import React from 'react';
import {
  Play, Stop, SpeakerSimpleHigh, SpeakerSimpleSlash, Headphones,
  Trash, PianoKeys, Equalizer as EqIcon, MagicWand, MusicNote
} from '@phosphor-icons/react';
import Waveform from './Waveform';
import VUMeter from './VUMeter';
import { TID } from '@/constants/testIds';

const TYPE_LABEL = {
  voice: 'VOICE', drums: 'DRUMS', bass: 'BASS', guitar: 'GUITAR',
  synth: 'SYNTH', dream: 'DREAM', recording: 'REC', other: 'AUDIO'
};

export default function TrackRow({ track, index, color, onAction }) {
  const sliderStyle = (v, c) => ({ color: c, '--val': `${v}%` });

  return (
    <div
      data-testid={TID.trackRow(index)}
      className="track-row"
      style={{
        display: 'flex', alignItems: 'stretch',
        background: '#18181B',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 8, overflow: 'hidden',
        minHeight: 92,
      }}
    >
      {/* Color tag */}
      <div style={{ width: 6, background: color, boxShadow: `inset 0 0 8px ${color}` }} />

      {/* Track name + controls block */}
      <div style={{ width: 220, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{
            background: color, color: '#000', fontSize: 9, fontWeight: 700,
            padding: '2px 6px', borderRadius: 3, letterSpacing: '0.08em'
          }} className="font-mono-r">
            {TYPE_LABEL[track.trackType] || 'AUDIO'}
          </div>
          <div style={{ fontSize: 10, color: '#71717A' }} className="font-mono-r">#{index + 1}</div>
          {track.isMIDI && <MusicNote size={11} color="#A1A1AA" />}
        </div>
        <div style={{
          fontSize: 13, fontWeight: 600, color: '#FAFAFA',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
        }}>
          {track.displayName}
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 'auto' }}>
          <button
            data-testid={TID.trackPlay(index)}
            className="riba-btn riba-btn-icon"
            onClick={() => onAction('play', track.id)}
            title="Play / Stop"
          >
            {track.isPlaying ? <Stop size={14} weight="fill" /> : <Play size={14} weight="fill" />}
          </button>
          <button
            data-testid={TID.trackSolo(index)}
            className="riba-btn riba-btn-icon"
            data-active={track.isSolo}
            onClick={() => onAction('solo', track.id)}
            title="Solo"
            style={{ color: track.isSolo ? '#000' : '#EAB308' }}
          >
            <Headphones size={14} weight={track.isSolo ? 'fill' : 'regular'} />
          </button>
          <button
            data-testid={TID.trackMute(index)}
            className="riba-btn riba-btn-icon"
            data-active={track.isMuted}
            onClick={() => onAction('mute', track.id)}
            title="Mute"
          >
            {track.isMuted ? <SpeakerSimpleSlash size={14} /> : <SpeakerSimpleHigh size={14} />}
          </button>
          {track.isMIDI && (
            <button
              data-testid={TID.trackPiano(index)}
              className="riba-btn riba-btn-icon"
              onClick={() => onAction('piano', track.id)}
              title="Piano Roll"
            >
              <PianoKeys size={14} />
            </button>
          )}
          <button
            data-testid={TID.trackDelete(index)}
            className="riba-btn riba-btn-icon"
            onClick={() => onAction('delete', track.id)}
            title="Delete"
            style={{ color: '#EF4444' }}
          >
            <Trash size={14} />
          </button>
        </div>
      </div>

      {/* Waveform area */}
      <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, background: '#0B0B0E' }}>
        <Waveform peaks={track.peaks} color={color} height={48} />
        <VUMeter source="track" trackId={track.id} width={200} height={6} />
      </div>

      {/* EQ + Volume + Pan controls */}
      <div style={{ width: 320, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
        {/* EQ row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            data-testid={TID.trackEqToggle(index)}
            className="riba-btn"
            data-active={track.eq.enabled}
            onClick={() => onAction('toggleEq', track.id)}
            style={{ fontSize: 10, padding: '4px 8px' }}
            title="EQ on/off"
          >
            <EqIcon size={12} /> EQ
          </button>
          {['bass', 'mid', 'high'].map((band) => (
            <div key={band} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ fontSize: 9, color: '#71717A', width: 12, textAlign: 'right' }} className="font-mono-r">
                {band[0].toUpperCase()}
              </div>
              <input
                type="range"
                min={0} max={100}
                value={track.eq[band]}
                onChange={(e) => onAction('eqChange', track.id, { band, value: parseInt(e.target.value) })}
                className="riba-slider"
                style={sliderStyle(track.eq[band], color)}
                data-testid={
                  band === 'bass' ? TID.trackEqBass(index)
                    : band === 'mid' ? TID.trackEqMid(index)
                      : TID.trackEqHigh(index)
                }
              />
            </div>
          ))}
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <SpeakerSimpleHigh size={12} color="#A1A1AA" />
          <input
            type="range" min={0} max={100} value={track.volume}
            onChange={(e) => onAction('volume', track.id, parseInt(e.target.value))}
            className="riba-slider"
            style={sliderStyle(track.volume, color)}
            data-testid={TID.trackVolume(index)}
          />
          <div style={{ width: 32, textAlign: 'right', fontSize: 10, color: '#A1A1AA' }} className="font-mono-r">
            {track.volume}
          </div>
        </div>

        {/* Pan */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontSize: 10, color: '#A1A1AA', width: 14 }} className="font-mono-r">L</div>
          <input
            type="range" min={-50} max={50} value={track.pan}
            onChange={(e) => onAction('pan', track.id, parseInt(e.target.value))}
            className="riba-slider riba-pan-track"
            style={sliderStyle(((track.pan + 50) / 100) * 100, color)}
            data-testid={TID.trackPan(index)}
          />
          <div style={{ fontSize: 10, color: '#A1A1AA', width: 14 }} className="font-mono-r">R</div>
        </div>
      </div>
    </div>
  );
}
