import React from 'react';
import { Modal } from '../Modal';
import VUMeter from '../../VUMeter';
import { MidiLearnTrigger } from '../MidiLearnTrigger';

export function MixerModal({ tracks, masterVol, setMasterVol, onTrackAction, onClose }) {
  return (
    <Modal title="Mixer · All Tracks" onClose={onClose}>
      {tracks.length === 0 ? (
        <div style={{ color: '#A1A1AA', padding: '20px 0', textAlign: 'center' }}>No tracks in session.</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, overflow: 'auto', padding: '4px 0' }}>
        {tracks.map((t, i) => {
          const base = `mixer-strip-${t.id}`;
          return (
          <div key={t.id} data-testid={base} style={{
            minWidth: 100, background: '#09090B',
            border: `1px solid ${t.color}33`, borderRadius: 8, padding: 8,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
          }}>
            <div style={{
              background: t.color, color: '#000', fontSize: 9, fontWeight: 700,
              padding: '2px 6px', borderRadius: 3
            }} className="font-mono-r">#{i + 1}</div>
            <div style={{
              fontSize: 11, fontWeight: 600, textAlign: 'center',
              height: 28, overflow: 'hidden'
            }}>{t.displayName.slice(0, 16)}</div>
            <VUMeter source="track" trackId={t.id} width={20} height={120} />
            <MidiLearnTrigger
              targetId={`track.${t.id}.volume`}
              label={`${t.displayName} · Volume`}
              testid={`${base}-vol`}
            >
              <input
                type="range" min={0} max={100} value={t.volume}
                onChange={(e) => onTrackAction('volume', t.id, parseInt(e.target.value))}
                className="riba-slider"
                style={{ width: 80, color: t.color, '--val': `${t.volume}%` }}
              />
            </MidiLearnTrigger>
            <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA' }}>{t.volume}</div>
            <MidiLearnTrigger
              targetId={`track.${t.id}.pan`}
              label={`${t.displayName} · Pan`}
              testid={`${base}-pan`}
            >
              <input
                type="range" min={-50} max={50} value={t.pan ?? 0}
                onChange={(e) => onTrackAction('pan', t.id, parseInt(e.target.value))}
                className="riba-slider"
                style={{ width: 80, color: '#A1A1AA', '--val': `${((t.pan ?? 0) + 50)}%` }}
                title="Pan (-50 L … +50 R)"
              />
            </MidiLearnTrigger>
            <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
              {(t.pan ?? 0) === 0 ? 'C' : ((t.pan ?? 0) < 0 ? `L${-((t.pan ?? 0))}` : `R${(t.pan ?? 0)}`)}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <MidiLearnTrigger
                targetId={`track.${t.id}.mute`}
                label={`${t.displayName} · Mute`}
                testid={`${base}-mute`}
              >
                <button className="riba-btn riba-btn-icon" data-active={t.isMuted}
                  onClick={() => onTrackAction('mute', t.id)}
                  style={{ width: 28, height: 22, fontSize: 9 }}>M</button>
              </MidiLearnTrigger>
              <MidiLearnTrigger
                targetId={`track.${t.id}.solo`}
                label={`${t.displayName} · Solo`}
                testid={`${base}-solo`}
              >
                <button className="riba-btn riba-btn-icon" data-active={t.isSolo}
                  onClick={() => onTrackAction('solo', t.id)}
                  style={{ width: 28, height: 22, fontSize: 9, color: t.isSolo ? '#000' : '#EAB308' }}>S</button>
              </MidiLearnTrigger>
            </div>
          </div>
          );
        })}
        <div style={{
          minWidth: 100, background: '#09090B',
          border: '2px solid #FFFFFF22', borderRadius: 8, padding: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
        }}>
          <div style={{ background: '#FAFAFA', color: '#000', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }} className="font-mono-r">MASTER</div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>Out</div>
          <VUMeter width={20} height={120} />
          <MidiLearnTrigger
            targetId="master.volume"
            label="Master Volume"
            testid="mixer-master-vol"
          >
            <input type="range" min={0} max={100} value={masterVol}
              onChange={(e) => setMasterVol(parseInt(e.target.value))}
              className="riba-slider"
              style={{ width: 80, color: '#FAFAFA', '--val': `${masterVol}%` }}
            />
          </MidiLearnTrigger>
          <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA' }}>{masterVol}</div>
        </div>
      </div>
    </Modal>
  );
}
