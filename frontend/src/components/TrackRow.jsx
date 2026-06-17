import React from 'react';
import {
  Play, Stop, SpeakerSimpleHigh, SpeakerSimpleSlash, Headphones,
  Trash, PianoKeys, Equalizer as EqIcon, MusicNote, Waveform as WaveIcon, Drop
} from '@phosphor-icons/react';
import Waveform from './Waveform';
import VUMeter from './VUMeter';
import { TID } from '@/constants/testIds';
import { GM_INSTRUMENTS } from '@/audio/instruments';

const TYPE_LABEL = {
  voice: 'VOICE', drums: 'DRUMS', bass: 'BASS', guitar: 'GUITAR',
  synth: 'SYNTH', dream: 'DREAM', recording: 'REC', other: 'AUDIO'
};

export default function TrackRow({ track, index, color, isSelected, onSelect, onAction }) {
  const sliderStyle = (v, c) => ({ color: c, '--val': `${v}%` });

  return (
    <div
      data-testid={TID.trackRow(index)}
      className="track-row"
      onClick={(e) => {
        // only select if not clicking buttons/inputs
        if (['BUTTON','INPUT','SELECT','OPTION','TEXTAREA'].includes(e.target.tagName)) return;
        onSelect?.(track.id);
      }}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: isSelected ? '#27272A' : '#18181B',
        border: isSelected ? `1px solid ${color}` : '1px solid rgba(255,255,255,0.05)',
        boxShadow: isSelected ? `0 0 0 1px ${color}33, 0 0 12px ${color}22` : 'none',
        borderRadius: 8, overflow: 'hidden',
        minHeight: 110, cursor: 'pointer'
      }}
    >
      {/* Color tag */}
      <div style={{ width: 6, background: color, boxShadow: `inset 0 0 8px ${color}` }} />

      {/* Name + controls */}
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

        {track.isMIDI && (
          <select
            data-testid={TID.trackInstrument(index)}
            value={track.instrumentIndex || 0}
            onChange={(e) => onAction('instrument', track.id, parseInt(e.target.value))}
            style={{
              background: '#0B0B0E', color: '#A1A1AA', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 4, padding: '2px 4px', fontSize: 10, fontFamily: 'JetBrains Mono, monospace'
            }}
            title="GM Instrument"
          >
            {GM_INSTRUMENTS.map((ins, i) => (
              <option key={i} value={i}>{i + 1}. {ins.name}</option>
            ))}
          </select>
        )}

        <div style={{ display: 'flex', gap: 4, marginTop: 'auto', flexWrap: 'wrap' }}>
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
          {!track.isMIDI && (
            <button
              data-testid={TID.detectBpmBtn(index)}
              className="riba-btn riba-btn-icon"
              onClick={() => onAction('detectBpm', track.id)}
              title="Auto-detect BPM"
              style={{ color: '#22D3EE' }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>BPM</span>
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

      {/* Waveform */}
      <div style={{ flex: 1, padding: 6, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, background: '#0B0B0E' }}>
        <Waveform peaks={track.peaks} color={color} height={48} />
        <VUMeter source="track" trackId={track.id} width={200} height={6} />
        {track.isMIDI && (
          <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A', textAlign: 'right' }}>
            {(GM_INSTRUMENTS[track.instrumentIndex || 0]?.name || '').slice(0, 28)} · {(track.midiNotes || []).length} notes
          </div>
        )}
      </div>

      {/* EQ + FX + Volume + Pan */}
      <div style={{ width: 340, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4, borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
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

        {/* FX row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span className="font-mono-r" style={{ fontSize: 9, color: '#71717A', width: 18 }}>FX</span>
          <button
            data-testid={TID.trackReverb(index)}
            className="riba-btn"
            data-active={track.effects?.reverb}
            onClick={() => onAction('toggleReverb', track.id)}
            style={{ fontSize: 10, padding: '4px 8px', flex: 1 }}
            title="Reverb"
          >
            <Drop size={12} weight={track.effects?.reverb ? 'fill' : 'regular'} /> Reverb
          </button>
          <button
            data-testid={TID.trackDelay(index)}
            className="riba-btn"
            data-active={track.effects?.delay}
            onClick={() => onAction('toggleDelay', track.id)}
            style={{ fontSize: 10, padding: '4px 8px', flex: 1 }}
            title="Delay"
          >
            <WaveIcon size={12} weight={track.effects?.delay ? 'fill' : 'regular'} /> Delay
          </button>
        </div>

        {/* Volume */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
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
