import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { Modal } from '../Modal';
import { BantuStorytellingLibrary } from './BantuStorytellingLibrary';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SLUG_COLORS = {
  intro:   '#22D3EE',
  defi:    '#F59E0B',
  combat:  '#D946EF',
  sagesse: '#22C55E',
};

const STRUCTURE_OPTIONS = [
  { id: 'mvett', label: 'Mvett · Épopée traditionnelle' },
  { id: 'conte', label: 'Conte · Récit court' },
];

/**
 * BantuStorytellingModal — call POST /api/ai/storytelling to generate a 4-chapter
 * Mvett arrangement plan and inject it into the DAW (story chapters + bantu style
 * + lyrics + dynamic tempo/swing curve).
 *
 * Props :
 *   - onClose                : () => void
 *   - language              : current i18n code ('fr'|'en'|'es'|'pt'|'sw')
 *   - baseTempo             : current project tempo (BPM)
 *   - timeSig               : current time signature numerator (defaults 4)
 *   - onApply({ chapters, title, lyrics, bantu_style, base_tempo, total_bars }) :
 *                              the host (Daw.jsx) injects the result into its state
 *                              + Y.Map for live broadcast.
 */
export function BantuStorytellingModal({
  onClose, language = 'fr', baseTempo = 120, timeSig = 4, onApply,
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('generate'); // 'generate' | 'library'
  const [theme, setTheme] = useState('');
  const [structure, setStructure] = useState('mvett');
  const [totalBars, setTotalBars] = useState(32);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [publishedToken, setPublishedToken] = useState(null);
  const [authorName, setAuthorName] = useState('Anonymous Griot');

  const generate = async (e) => {
    e?.preventDefault?.();
    if (!theme.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const r = await axios.post(`${API}/ai/storytelling`, {
        theme: theme.trim(),
        structure, language,
        base_tempo: baseTempo,
        total_bars: totalBars,
      });
      setResult(r.data);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    if (!result) return;
    onApply?.({
      chapters: result.chapters,
      title: result.title,
      lyrics: result.lyrics,
      bantu_style: result.bantu_style,
      base_tempo: baseTempo,
      total_bars: totalBars,
    });
    onClose?.();
  };

  const publish = async () => {
    if (!result?.chapters) return;
    setPublishing(true); setError(null); setPublishedToken(null);
    try {
      const r = await axios.post(`${API}/storytelling/library`, {
        title: result.title || 'Untitled Mvett',
        theme: theme.trim() || result.title || 'Untitled',
        language: language || 'fr',
        bantu_style: result.bantu_style,
        total_bars: totalBars,
        chapters: result.chapters,
        lyrics: result.lyrics || ['—'],
        author_name: authorName.trim() || 'Anonymous Griot',
      });
      setPublishedToken(r.data?.author_token || null);
    } catch (err) {
      setError(err?.response?.data?.detail || err.message || 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  const loadFromLibrary = (record) => {
    if (!record) return;
    setResult({
      title: record.title,
      bantu_style: record.bantu_style,
      chapters: record.chapters,
      lyrics: record.lyrics,
      fallback: false,
    });
    setTheme(record.theme || '');
    setTotalBars(record.total_bars || 32);
    setTab('generate'); // jump back to the preview pane
  };

  return (
    <Modal title={t('storytelling.title', 'Bantu Storytelling · Mvett')} onClose={onClose} width={780}>
      <div data-testid="storytelling-modal" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Tab strip */}
        <div data-testid="storytelling-tabs" style={{
          display: 'flex', gap: 4, padding: 3,
          background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10,
        }}>
          {[
            { id: 'generate', label: '✨ ' + t('storytelling.tabGenerate', 'Generate'), testid: 'storytelling-tab-generate' },
            { id: 'library',  label: '🌍 ' + t('storytelling.tabLibrary',  'Library'),  testid: 'storytelling-tab-library' },
          ].map((it) => {
            const on = tab === it.id;
            return (
              <button
                key={it.id}
                data-testid={it.testid}
                onClick={() => setTab(it.id)}
                style={{
                  flex: 1, padding: '8px 12px', fontSize: 12,
                  fontWeight: on ? 800 : 500,
                  background: on ? 'linear-gradient(135deg,#D946EF22,#22D3EE22)' : 'transparent',
                  border: '1px solid', borderColor: on ? '#D946EF55' : 'transparent',
                  color: on ? '#FAFAFA' : '#A1A1AA',
                  borderRadius: 8, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}
              >{it.label}</button>
            );
          })}
        </div>

        {tab === 'library' && (
          <BantuStorytellingLibrary onLoad={loadFromLibrary} />
        )}

        {tab === 'generate' && (
        <>
        <form onSubmit={generate} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
            {t('storytelling.themeLabel', 'Theme / proverb')}
          </label>
          <input
            data-testid="storytelling-theme-input"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            placeholder={t('storytelling.themePlaceholder', "La sagesse du baobab millénaire...")}
            autoFocus
            style={{
              background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6, padding: '10px 12px', color: '#FAFAFA', fontSize: 13,
              fontFamily: 'Manrope, sans-serif',
            }}
          />
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                {t('storytelling.structureLabel', 'Structure')}
              </label>
              <select
                data-testid="storytelling-structure-select"
                value={structure}
                onChange={(e) => setStructure(e.target.value)}
                style={{
                  background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, padding: '8px 10px', color: '#FAFAFA', fontSize: 12,
                }}
              >
                {STRUCTURE_OPTIONS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '0 0 130px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 10, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
                {t('storytelling.barsLabel', 'Total bars')}
              </label>
              <input
                data-testid="storytelling-bars-input"
                type="number" min={8} max={128} value={totalBars}
                onChange={(e) => setTotalBars(Math.max(8, Math.min(128, Number(e.target.value) || 32)))}
                style={{
                  background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 6, padding: '8px 10px', color: '#FAFAFA', fontSize: 12,
                  textAlign: 'right',
                }}
              />
            </div>
            <button
              type="submit"
              disabled={loading || !theme.trim()}
              data-testid="storytelling-generate-btn"
              style={{
                marginLeft: 'auto', alignSelf: 'flex-end',
                background: loading
                  ? 'rgba(99,102,241,0.4)'
                  : 'linear-gradient(135deg, #D946EF, #F59E0B)',
                color: '#fff', border: 'none', borderRadius: 8,
                padding: '10px 18px', fontSize: 12, fontWeight: 800,
                letterSpacing: '0.06em', cursor: loading ? 'wait' : 'pointer',
                boxShadow: '0 0 14px rgba(217,70,239,0.4)',
                textTransform: 'uppercase',
              }}
            >
              {loading
                ? `⚙ ${t('common.loading', 'Loading…')}`
                : `✨ ${t('storytelling.generateBtn', 'Generate epic')}`}
            </button>
          </div>
        </form>

        {error && (
          <div data-testid="storytelling-error" style={{
            background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)',
            color: '#FCA5A5', padding: '8px 12px', borderRadius: 6, fontSize: 12,
          }}>
            {String(error)}
          </div>
        )}

        {result && (
          <div data-testid="storytelling-result" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
              gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8,
            }}>
              <div className="font-heading" style={{ fontSize: 22, fontWeight: 800, color: '#FAFAFA' }}>
                {result.title}
              </div>
              <div style={{
                fontSize: 10, color: '#22D3EE', letterSpacing: '0.14em',
                fontFamily: 'JetBrains Mono, monospace', textTransform: 'uppercase',
              }}>
                {result.bantu_style.replace(/_/g, ' ')}
                {result.fallback ? ' · offline' : ''}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {result.chapters.map((c) => (
                <div key={c.slug}
                  data-testid={`storytelling-chapter-${c.slug}`}
                  style={{
                    background: `linear-gradient(135deg, ${SLUG_COLORS[c.slug]}1A, rgba(11,11,14,0.4))`,
                    border: `1px solid ${SLUG_COLORS[c.slug]}55`,
                    borderRadius: 8, padding: 10,
                  }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div className="font-mono-r" style={{
                      fontSize: 9, color: SLUG_COLORS[c.slug], textTransform: 'uppercase', letterSpacing: '0.16em',
                    }}>{c.slug}</div>
                    <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
                      bars {c.bar_start}–{c.bar_end}
                    </div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#FAFAFA', marginTop: 2 }}>
                    {c.marker_label}
                  </div>
                  <div style={{ fontSize: 11, color: '#A1A1AA', marginTop: 4, lineHeight: 1.5 }}>
                    {c.narration}
                  </div>
                  <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#71717A', marginTop: 6 }}>
                    <span>♩ {c.tempo_target} BPM</span>
                    <span>swing {Math.round(c.swing_intensity * 100)}%</span>
                    <span style={{ color: SLUG_COLORS[c.slug] }}>{c.arrangement_hint}</span>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="font-mono-r" style={{
                fontSize: 10, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.14em', marginBottom: 4,
              }}>
                {t('storytelling.lyricsLabel', 'Lyrics & proverbs')}
              </div>
              <div data-testid="storytelling-lyrics" style={{
                background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: 6, padding: 10, fontSize: 12, color: '#E4E4E7', lineHeight: 1.7,
                fontStyle: 'italic',
              }}>
                {result.lyrics.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  data-testid="storytelling-author-input"
                  placeholder={t('library.authorPlaceholder', 'Your griot name…')}
                  value={authorName}
                  onChange={(e) => setAuthorName(e.target.value)}
                  style={{
                    background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 6, padding: '6px 10px', fontSize: 11, color: '#E4E4E7',
                    width: 160,
                  }}
                />
                <button
                  data-testid="storytelling-publish-btn"
                  onClick={publish}
                  disabled={publishing}
                  style={{
                    background: publishing
                      ? 'rgba(99,102,241,0.4)'
                      : 'linear-gradient(135deg,#6366F1,#D946EF)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '7px 14px', fontSize: 11, fontWeight: 800,
                    letterSpacing: '0.06em', cursor: publishing ? 'wait' : 'pointer',
                    textTransform: 'uppercase',
                  }}
                >
                  {publishing
                    ? `⚙ ${t('common.loading','Loading…')}`
                    : `🌍 ${t('library.publishBtn','Publish to library')}`}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="riba-btn"
                  onClick={generate}
                  disabled={loading}
                  data-testid="storytelling-regen-btn"
                >
                  ↻ {t('storytelling.regenBtn', 'Re-generate')}
                </button>
                <button
                  data-testid="storytelling-apply-btn"
                  onClick={apply}
                  style={{
                    background: 'linear-gradient(135deg, #22C55E, #22D3EE)',
                    color: '#0B0B0E', border: 'none', borderRadius: 8,
                    padding: '8px 16px', fontSize: 12, fontWeight: 800,
                    letterSpacing: '0.06em', cursor: 'pointer', textTransform: 'uppercase',
                    boxShadow: '0 0 14px rgba(34,197,94,0.35)',
                  }}
                >
                  ▸ {t('storytelling.applyBtn', 'Apply to Timeline')}
                </button>
              </div>
            </div>
            {publishedToken && (
              <div data-testid="storytelling-published-token" style={{
                background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.32)',
                borderRadius: 8, padding: 10, marginTop: 4, color: '#86EFAC', fontSize: 11,
                display: 'flex', flexDirection: 'column', gap: 4,
              }}>
                <div style={{ fontWeight: 700, fontSize: 12 }}>
                  ✅ {t('library.publishedTitle','Published to the library!')}
                </div>
                <div style={{ color: '#A1A1AA', fontSize: 10 }}>
                  {t('library.publishedHint','Keep this author-token to delete your story later (shown only once) :')}
                </div>
                <code style={{
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
                  color: '#FAFAFA', background: '#0B0B0E', padding: '4px 8px',
                  borderRadius: 4, userSelect: 'all', wordBreak: 'break-all',
                }}>{publishedToken}</code>
              </div>
            )}
          </div>
        )}
        </>
        )}
      </div>
    </Modal>
  );
}
