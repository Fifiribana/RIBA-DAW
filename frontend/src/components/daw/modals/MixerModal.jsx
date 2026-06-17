import React from 'react';
import { Modal } from '../Modal';
import VUMeter from '../../VUMeter';

export function MixerModal({ tracks, masterVol, setMasterVol, onTrackAction, onClose }) {
  return (
    <Modal title="Mixer · All Tracks" onClose={onClose}>
      {tracks.length === 0 ? (
        <div style={{ color: '#A1A1AA', padding: '20px 0', textAlign: 'center' }}>No tracks in session.</div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, overflow: 'auto', padding: '4px 0' }}>
        {tracks.map((t, i) => (
          <div key={t.id} style={{
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
            <input
              type="range" min={0} max={100} value={t.volume}
              onChange={(e) => onTrackAction('volume', t.id, parseInt(e.target.value))}
              className="riba-slider"
              style={{ width: 80, color: t.color, '--val': `${t.volume}%` }}
            />
            <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA' }}>{t.volume}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="riba-btn riba-btn-icon" data-active={t.isMuted}
                onClick={() => onTrackAction('mute', t.id)}
                style={{ width: 28, height: 22, fontSize: 9 }}>M</button>
              <button className="riba-btn riba-btn-icon" data-active={t.isSolo}
                onClick={() => onTrackAction('solo', t.id)}
                style={{ width: 28, height: 22, fontSize: 9, color: t.isSolo ? '#000' : '#EAB308' }}>S</button>
            </div>
          </div>
        ))}
        <div style={{
          minWidth: 100, background: '#09090B',
          border: '2px solid #FFFFFF22', borderRadius: 8, padding: 8,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8
        }}>
          <div style={{ background: '#FAFAFA', color: '#000', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3 }} className="font-mono-r">MASTER</div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>Out</div>
          <VUMeter width={20} height={120} />
          <input type="range" min={0} max={100} value={masterVol}
            onChange={(e) => setMasterVol(parseInt(e.target.value))}
            className="riba-slider"
            style={{ width: 80, color: '#FAFAFA', '--val': `${masterVol}%` }}
          />
          <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA' }}>{masterVol}</div>
        </div>
      </div>
    </Modal>
  );
}
