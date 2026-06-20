import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const SLUG_COLORS = {
  intro:   '#22D3EE',
  defi:    '#F59E0B',
  combat:  '#D946EF',
  sagesse: '#22C55E',
};

const LANG_FILTERS = [
  { code: '',   label: 'all', flag: '🌐' },
  { code: 'fr', label: 'fr',  flag: '🇫🇷' },
  { code: 'en', label: 'en',  flag: '🇬🇧' },
  { code: 'es', label: 'es',  flag: '🇪🇸' },
  { code: 'pt', label: 'pt',  flag: '🇵🇹' },
  { code: 'sw', label: 'sw',  flag: '🇰🇪' },
];

const STYLE_FILTERS = [
  { code: '',                label: 'all' },
  { code: 'asiko_wisdom',    label: 'Asiko' },
  { code: 'makossa_roots',   label: 'Makossa' },
  { code: 'bikutsi_44',      label: 'Bikutsi 4/4' },
  { code: 'bikutsi_68',      label: 'Bikutsi 6/8' },
  { code: 'bikutsi_1224',    label: 'Bikutsi 12/24' },
];

/**
 * BantuStorytellingLibrary — browse / search / load community-published Mvett
 * arrangements. Plugged inside BantuStorytellingModal as a second tab.
 *
 * Props :
 *   - onLoad({chapters, lyrics, bantu_style, total_bars, title}) : forwarded
 *     to the parent so it can fill the modal's `result` preview pane (which
 *     in turn lets the user click "Apply to Timeline").
 */
export function BantuStorytellingLibrary({ onLoad }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [featured, setFeatured] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lang, setLang] = useState('');
  const [style, setStyle] = useState('');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState('recent');

  const fetchFeatured = async () => {
    try {
      const r = await axios.get(`${API}/storytelling/library/featured`, { params: { limit: 3 } });
      setFeatured(r.data?.items || []);
    } catch { setFeatured([]); }
  };

  const fetchItems = async () => {
    setLoading(true); setError(null);
    try {
      const params = { sort, limit: 24 };
      if (lang) params.lang = lang;
      if (style) params.style = style;
      if (q.trim()) params.q = q.trim();
      const r = await axios.get(`${API}/storytelling/library`, { params });
      setItems(r.data?.items || []);
      setTotal(r.data?.total ?? 0);
    } catch (e) {
      setError(e?.response?.data?.detail || e.message || 'Library load failed.');
      setItems([]); setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchItems(); fetchFeatured(); /* eslint-disable-next-line */ }, [lang, style, sort]);

  // Lookup table : story_id -> badge ("featured" | "trending") for fast row-decoration
  const featuredMap = new Map(featured.map((it) => [it.id, it.badge || 'trending']));

  return (
    <div data-testid="storytelling-library" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Filters row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {LANG_FILTERS.map((l) => (
            <button
              key={l.code || 'all-lang'}
              data-testid={`library-lang-${l.code || 'all'}`}
              onClick={() => setLang(l.code)}
              style={{
                background: lang === l.code ? 'rgba(217,70,239,0.18)' : 'transparent',
                border: '1px solid', borderColor: lang === l.code ? '#D946EF80' : 'rgba(255,255,255,0.08)',
                borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#E4E4E7',
                cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {STYLE_FILTERS.map((s) => (
            <button
              key={s.code || 'all-style'}
              data-testid={`library-style-${s.code || 'all'}`}
              onClick={() => setStyle(s.code)}
              style={{
                background: style === s.code ? 'rgba(34,211,238,0.18)' : 'transparent',
                border: '1px solid', borderColor: style === s.code ? '#22D3EE80' : 'rgba(255,255,255,0.08)',
                borderRadius: 999, padding: '4px 10px', fontSize: 11, color: '#E4E4E7',
                cursor: 'pointer',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>
        <select
          data-testid="library-sort-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          style={{
            background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '4px 8px', fontSize: 11, color: '#E4E4E7',
          }}
        >
          <option value="recent">recent</option>
          <option value="popular">popular</option>
          <option value="random">random</option>
        </select>
        <input
          data-testid="library-search-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') fetchItems(); }}
          placeholder={t('library.searchPlaceholder', 'Search…')}
          style={{
            flex: 1, minWidth: 160,
            background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#FAFAFA',
          }}
        />
        <button
          data-testid="library-refresh-btn"
          onClick={fetchItems}
          style={{
            background: 'linear-gradient(135deg,#D946EF,#F59E0B)', color: '#fff',
            border: 'none', borderRadius: 6, padding: '6px 14px', fontSize: 11, fontWeight: 700,
            cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.06em',
          }}
        >↻</button>
      </div>

      {error && (
        <div data-testid="library-error" style={{
          color: '#FCA5A5', background: 'rgba(239,68,68,0.10)', borderRadius: 6,
          padding: '8px 12px', fontSize: 12, border: '1px solid rgba(239,68,68,0.32)',
        }}>{String(error)}</div>
      )}

      <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.10em' }}>
        {loading ? `⚙ ${t('common.loading', 'Loading…')}` : `${items.length} / ${total}  ${t('library.results', 'records')}`}
      </div>

      {/* === #MvettWorldwide spotlight strip === */}
      {featured.length > 0 && (
        <div data-testid="library-featured-strip" style={{
          background: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(217,70,239,0.10))',
          border: '1px solid rgba(245,158,11,0.30)',
          borderRadius: 10, padding: 10,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14 }}>🏆</span>
            <span className="font-heading" style={{ fontSize: 12, fontWeight: 800, color: '#FAFAFA',
              letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {t('library.featuredTitle', '#MvettWorldwide · Featured this month')}
            </span>
            <span className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.10em' }}>
              top {featured.length}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {featured.map((f) => (
              <button
                key={`feat-${f.id}`}
                data-testid={`library-featured-${f.id}`}
                onClick={async () => {
                  try {
                    const full = await axios.get(`${API}/storytelling/library/${f.id}`);
                    onLoad?.(full.data);
                  } catch {
                    onLoad?.(f);
                  }
                }}
                style={{
                  flex: '0 0 220px', cursor: 'pointer', textAlign: 'left',
                  background: 'rgba(11,11,14,0.7)',
                  border: '1px solid rgba(245,158,11,0.55)',
                  borderRadius: 8, padding: '8px 10px',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  color: '#FAFAFA', fontFamily: 'Manrope, sans-serif',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="font-mono-r" style={{
                    fontSize: 8, color: '#0B0B0E',
                    background: f.badge === 'featured'
                      ? 'linear-gradient(135deg,#F59E0B,#D946EF)'
                      : 'linear-gradient(135deg,#22D3EE,#6366F1)',
                    padding: '2px 6px', borderRadius: 999,
                    fontWeight: 800, letterSpacing: '0.10em', textTransform: 'uppercase',
                  }}>
                    {f.badge === 'featured' ? '★ Featured' : '↑ Trending'}
                  </span>
                  <span style={{ fontSize: 9, color: '#71717A' }}>▶ {f.plays}</span>
                </div>
                <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.title}
                </div>
                <div style={{ fontSize: 9, color: '#A1A1AA', display: 'flex', gap: 6 }}>
                  <span style={{ color: '#22D3EE' }}>{f.bantu_style.replace(/_/g, ' ')}</span>
                  <span>· {f.language}</span>
                  <span>· {f.total_bars}b</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Items grid */}
      {items.length === 0 && !loading && (
        <div data-testid="library-empty" style={{
          color: '#71717A', fontSize: 12, padding: 22, textAlign: 'center',
          border: '1px dashed rgba(255,255,255,0.08)', borderRadius: 8,
        }}>
          🌍 {t('library.empty', 'No story yet for these filters — be the first to publish !')}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
        {items.map((it) => {
          const badge = featuredMap.get(it.id);
          return (
          <div
            key={it.id}
            data-testid={`library-item-${it.id}`}
            style={{
              background: 'rgba(11,11,14,0.66)',
              border: '1px solid', borderColor: badge ? 'rgba(245,158,11,0.45)' : 'rgba(255,255,255,0.06)',
              borderRadius: 10, padding: 10,
              display: 'flex', flexDirection: 'column', gap: 6,
              position: 'relative',
            }}
          >
            {badge && (
              <div
                data-testid={`library-badge-${it.id}`}
                style={{
                  position: 'absolute', top: -8, right: 8,
                  fontSize: 8, color: '#0B0B0E', fontWeight: 800,
                  letterSpacing: '0.10em', textTransform: 'uppercase',
                  padding: '2px 8px', borderRadius: 999,
                  background: badge === 'featured'
                    ? 'linear-gradient(135deg,#F59E0B,#D946EF)'
                    : 'linear-gradient(135deg,#22D3EE,#6366F1)',
                  boxShadow: badge === 'featured' ? '0 0 8px rgba(245,158,11,0.5)' : '0 0 8px rgba(34,211,238,0.4)',
                }}
                title={badge === 'featured' ? '#MvettWorldwide · curator pick' : '#MvettWorldwide · trending'}
              >
                {badge === 'featured' ? '★ FEAT' : '↑ TREND'}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
              <div className="font-heading" style={{
                fontSize: 13, fontWeight: 700, color: '#FAFAFA',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
              }} title={it.title}>{it.title}</div>
              <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A', textTransform: 'uppercase' }}>
                {it.language}
              </div>
            </div>
            <div style={{ fontSize: 10, color: '#A1A1AA', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ color: '#22D3EE' }}>{it.bantu_style.replace(/_/g, ' ')}</span>
              <span>· {it.total_bars} bars</span>
              <span>· ▶ {it.plays}</span>
            </div>
            <div style={{ fontSize: 10, color: '#71717A', fontStyle: 'italic', overflow: 'hidden', maxHeight: 30 }}>
              &ldquo;{(it.theme || '').slice(0, 90)}&rdquo;
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(it.chapters || []).map((c) => (
                <div key={c.slug}
                  title={`${c.slug} · ${c.marker_label} (${c.tempo_target} BPM · swing ${Math.round(c.swing_intensity * 100)}%)`}
                  style={{
                    flex: 1, height: 4, borderRadius: 2,
                    background: SLUG_COLORS[c.slug] || '#71717A',
                    opacity: 0.7,
                  }}
                />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
              <span style={{ fontSize: 9, color: '#52525B' }}>
                — {it.author_name || 'Anonymous'}
              </span>
              <button
                data-testid={`library-load-${it.id}`}
                onClick={async () => {
                  // Fetch full doc (server bumps plays + we get a fresh copy)
                  try {
                    const full = await axios.get(`${API}/storytelling/library/${it.id}`);
                    onLoad?.(full.data);
                  } catch {
                    onLoad?.(it);
                  }
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid #D946EF66',
                  color: '#D946EF',
                  borderRadius: 6, padding: '3px 10px',
                  fontSize: 10, fontWeight: 700, cursor: 'pointer',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                }}
              >
                {t('library.loadBtn', 'Load')}
              </button>
            </div>
          </div>
        );
        })}
      </div>
    </div>
  );
}
