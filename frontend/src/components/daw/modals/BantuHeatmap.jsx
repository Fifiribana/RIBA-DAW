import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/**
 * BantuHeatmap — SVG world map with pulsing diaspora circles.
 *
 * Geographic anchors come from `/api/storytelling/library/heatmap`. We render
 * a stylized continent silhouette (deliberately schematic — no leaflet/d3) so
 * the visual stays inside the RIBA brand mood. The Phoenix logo sits in the
 * geometric center; each region's circle pulses proportionally to its `count`.
 */
export function BantuHeatmap() {
  const { t } = useTranslation();
  const [data, setData] = useState({ regions: [], total_records: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    axios.get(`${API}/storytelling/library/heatmap`)
      .then((r) => { if (mounted) setData(r.data); })
      .catch(() => { if (mounted) setData({ regions: [], total_records: 0 }); })
      .finally(() => { if (mounted) setLoading(false); });
    return () => { mounted = false; };
  }, []);

  // Project lat/lng to SVG coordinates (equirectangular into a 1000×500 viewBox)
  const VB_W = 1000, VB_H = 500;
  const proj = (lat, lng) => ({
    x: ((lng + 180) / 360) * VB_W,
    y: ((90 - lat) / 180) * VB_H,
  });

  const maxCount = Math.max(1, ...data.regions.map(r => r.count));

  return (
    <div data-testid="bantu-heatmap" style={{
      background: 'linear-gradient(135deg, #0F1138 0%, #281658 60%, #0B0B0E 100%)',
      borderRadius: 12, padding: 12,
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 16 }}>🌍</span>
        <span className="font-heading" style={{
          fontSize: 13, fontWeight: 800, color: '#FAFAFA',
          letterSpacing: '0.06em', textTransform: 'uppercase',
        }}>
          {t('library.heatmapTitle', 'Diaspora Heatmap')}
        </span>
        <span className="font-mono-r" style={{ fontSize: 9, color: '#A1A1AA', letterSpacing: '0.10em' }}>
          {data.total_records} records
        </span>
      </div>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 8 }}
        data-testid="heatmap-svg"
      >
        {/* Stylized continent silhouettes (very rough, brand-mood) */}
        <g fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5">
          {/* Americas */}
          <path d="M 160 90 Q 200 150 220 230 Q 230 320 200 400 Q 180 440 200 470 L 240 460 Q 260 410 260 360 Q 280 300 260 240 Q 240 160 240 110 Z" />
          {/* Africa */}
          <path d="M 470 180 Q 510 200 540 250 Q 550 320 530 380 Q 510 410 480 410 Q 460 380 460 320 Q 450 240 470 180 Z" />
          {/* Europe */}
          <path d="M 460 100 Q 490 110 510 140 Q 530 170 510 180 Q 480 190 460 170 Q 450 140 460 100 Z" />
          {/* Asia */}
          <path d="M 540 110 Q 620 130 700 160 Q 760 200 780 250 Q 760 290 700 290 Q 620 280 560 260 Q 540 200 540 110 Z" />
          {/* Oceania */}
          <path d="M 760 360 Q 820 360 830 390 Q 810 410 770 405 Q 750 390 760 360 Z" />
        </g>

        {/* Phoenix at the visual center */}
        <g transform={`translate(${VB_W / 2 - 28}, ${VB_H / 2 - 28})`}>
          <image href="/riba-logo.png" width="56" height="56" />
          <circle cx="28" cy="28" r="34" fill="none"
                  stroke="#D946EF" strokeWidth="0.7" opacity="0.4">
            <animate attributeName="r" values="34;46;34" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.55;0.05;0.55" dur="3s" repeatCount="indefinite" />
          </circle>
        </g>

        {/* Diaspora pulses */}
        {data.regions.map((r, i) => {
          const { x, y } = proj(r.lat, r.lng);
          const intensity = r.count / maxCount;
          const baseR = 8 + intensity * 22;
          const c = r.color;
          const rgba = `rgba(${c[0]}, ${c[1]}, ${c[2]},`;
          return (
            <g key={r.lang} data-testid={`heatmap-region-${r.lang}`}>
              {/* outer slow pulse */}
              <circle cx={x} cy={y} r={baseR * 2.4}
                      fill={`${rgba} 0)`}
                      stroke={`${rgba} 0.55)`}
                      strokeWidth="0.8">
                <animate attributeName="r"
                         values={`${baseR * 1.2};${baseR * 2.6};${baseR * 1.2}`}
                         dur={`${1.8 + i * 0.25}s`} repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.55;0;0.55"
                         dur={`${1.8 + i * 0.25}s`} repeatCount="indefinite" />
              </circle>
              {/* solid core */}
              <circle cx={x} cy={y} r={baseR}
                      fill={`${rgba} 0.85)`}
                      stroke="#0B0B0E" strokeWidth="1.2">
                <animate attributeName="r"
                         values={`${baseR};${baseR * 1.18};${baseR}`}
                         dur="2.2s" repeatCount="indefinite" />
              </circle>
              <text x={x + baseR + 6} y={y + 4}
                    fill={`rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.95)`}
                    fontSize="12" fontFamily="JetBrains Mono, monospace" fontWeight="700">
                {r.count}
              </text>
              <text x={x + baseR + 6} y={y + 17}
                    fill="#A1A1AA"
                    fontSize="9" fontFamily="Manrope, sans-serif">
                {r.region.split(' · ')[1] || r.region}
              </text>
            </g>
          );
        })}
      </svg>

      {loading && (
        <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A', textAlign: 'center' }}>
          ⚙ {t('common.loading', 'Loading…')}
        </div>
      )}
      {!loading && data.regions.length === 0 && (
        <div data-testid="heatmap-empty" style={{
          fontSize: 11, color: '#71717A', textAlign: 'center',
          padding: 10, fontStyle: 'italic',
        }}>
          🌍 {t('library.heatmapEmpty', 'No diaspora signal yet — publish to ignite the first pulse.')}
        </div>
      )}
    </div>
  );
}
