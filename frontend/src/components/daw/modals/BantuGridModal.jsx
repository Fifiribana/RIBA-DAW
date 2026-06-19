import React from 'react';
import { useTranslation } from 'react-i18next';
import { Modal } from '../Modal';
import { TID } from '@/constants/testIds';

const DEFAULT_STYLES = [
  { id: 'asiko_wisdom', label: 'Asiko Wisdom (Sagesse africaine)' },
  { id: 'makossa_roots', label: 'Makossa Roots (Cameroun)' },
  { id: 'bikutsi_44', label: 'Bikutsi 4/4 (8 ternaire)' },
  { id: 'bikutsi_68', label: 'Bikutsi 6/8' },
  { id: 'bikutsi_1224', label: 'Bikutsi 12/24 (3-contre-4)' },
];

export function BantuGridModal({
  styles, style, setStyle, density, setDensity, bars, setBars,
  selectedTrack, onApply, onClose
}) {
  const { t } = useTranslation();
  const styleList = styles && styles.length ? styles : DEFAULT_STYLES;
  return (
    <Modal title={t('bantuGrid.title')} onClose={onClose}>
      <div style={{ color: '#A1A1AA', fontSize: 12, marginBottom: 12 }}>
        Quantification asymétrique inspirée des structures rythmiques d&apos;Afrique Centrale.
        Sélectionnez la piste MIDI cible (en cliquant dessus), puis le style :
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div>
          <label className="font-mono-r" style={{ fontSize: 10, color: '#71717A', display: 'block', marginBottom: 4 }}>STYLE RYTHMIQUE</label>
          <select
            data-testid={TID.bantuStyleSelect}
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            style={{
              width: '100%', background: '#09090B', color: '#FAFAFA',
              border: '1px solid rgba(217,70,239,0.3)', borderRadius: 6,
              padding: '8px 10px', fontSize: 13, fontFamily: 'Manrope, sans-serif'
            }}
          >
            {styleList.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label className="font-mono-r" style={{ fontSize: 10, color: '#71717A', display: 'block', marginBottom: 4 }}>DENSITÉ (points de grille)</label>
            <input
              data-testid={TID.bantuDensity}
              type="number" min={4} max={64} value={density}
              onChange={(e) => setDensity(parseInt(e.target.value) || 16)}
              style={{
                width: '100%', background: '#09090B', color: '#FAFAFA',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                padding: '8px 10px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label className="font-mono-r" style={{ fontSize: 10, color: '#71717A', display: 'block', marginBottom: 4 }}>MESURES</label>
            <input
              data-testid={TID.bantuBars}
              type="number" min={1} max={16} value={bars}
              onChange={(e) => setBars(parseFloat(e.target.value) || 4)}
              style={{
                width: '100%', background: '#09090B', color: '#FAFAFA',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                padding: '8px 10px', fontSize: 13, fontFamily: 'JetBrains Mono, monospace'
              }}
            />
          </div>
        </div>
        <div style={{ background: 'rgba(217,70,239,0.08)', padding: 10, borderRadius: 6, border: '1px solid rgba(217,70,239,0.2)', fontSize: 11, color: '#E4E4E7' }}>
          💡 <b>Innovation Riba</b> : aucun autre DAW (Pro Tools, Ableton, FL Studio) ne propose ces grilles. Vos notes MIDI seront snappées sur des positions asymétriques inspirées des proverbes Bantu, du Bikutsi camerounais, du Makossa et de l&apos;Asiko.
        </div>
        <div style={{ color: '#A1A1AA', fontSize: 11 }}>
          Piste cible : {selectedTrack?.displayName || <em>aucune sélectionnée — cliquez sur une piste MIDI d&apos;abord</em>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
        <button className="riba-btn" onClick={onClose}>Annuler</button>
        <button
          data-testid={TID.bantuApply}
          className="riba-btn"
          style={{ background: 'linear-gradient(135deg, #D946EF, #F59E0B)', color: '#fff', border: 'none' }}
          onClick={onApply}
        >🌍 Appliquer la grille</button>
      </div>
    </Modal>
  );
}
