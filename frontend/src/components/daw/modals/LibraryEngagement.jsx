import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Persistent anonymous client id used for Like de-dup + comment ownership
function getOrCreateClientId() {
  try {
    let v = localStorage.getItem('riba-client-id');
    if (!v) {
      v = `c-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem('riba-client-id', v);
    }
    return v;
  } catch { return `c-${Date.now()}`; }
}

export function LibraryLikeButton({ storyId, initialLikes = 0, onAuthorClick }) {
  const [likes, setLikes] = useState(initialLikes);
  const [liked, setLiked] = useState(false);
  const [busy, setBusy] = useState(false);
  const cid = getOrCreateClientId();

  useEffect(() => {
    axios.get(`${API}/storytelling/library/${storyId}/like-status`,
      { headers: { 'X-Client-Id': cid } })
      .then((r) => { setLiked(!!r.data?.liked); setLikes(r.data?.likes ?? initialLikes); })
      .catch(() => { /* ignore */ });
  }, [storyId, cid, initialLikes]);

  const toggle = async (e) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const r = await axios.post(`${API}/storytelling/library/${storyId}/like`, null,
        { headers: { 'X-Client-Id': cid } });
      setLiked(!!r.data?.liked); setLikes(r.data?.likes ?? likes);
    } catch { /* ignore */ } finally { setBusy(false); }
  };

  return (
    <button
      data-testid={`library-like-btn-${storyId}`}
      onClick={toggle}
      title={liked ? 'Unlike' : 'Like'}
      style={{
        background: liked ? 'rgba(217,70,239,0.16)' : 'transparent',
        border: '1px solid', borderColor: liked ? '#D946EF80' : 'rgba(255,255,255,0.10)',
        color: liked ? '#D946EF' : '#A1A1AA',
        borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700,
        display: 'flex', alignItems: 'center', gap: 4, cursor: busy ? 'wait' : 'pointer',
        transition: 'background 160ms ease',
      }}
    >
      <span>{liked ? '★' : '☆'}</span>
      <span>{likes}</span>
    </button>
  );
}

/**
 * Inline comment thread — POST + GET + DELETE (own comments).
 */
export function LibraryCommentsPanel({ storyId }) {
  const { t } = useTranslation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [author, setAuthor] = useState('Anonymous');
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [ownedTokens, setOwnedTokens] = useState({});  // commentId -> author_token
  const cid = getOrCreateClientId();

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(`${API}/storytelling/library/${storyId}/comments`,
        { params: { limit: 30 } });
      setItems(r.data?.items || []);
    } catch { setItems([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [storyId]);

  const post = async () => {
    if (!text.trim() || posting) return;
    setPosting(true);
    try {
      const r = await axios.post(
        `${API}/storytelling/library/${storyId}/comments`,
        { author_name: author.trim() || 'Anonymous', content: text.trim() },
        { headers: { 'X-Client-Id': cid } },
      );
      setOwnedTokens((prev) => ({ ...prev, [r.data.id]: r.data.author_token }));
      setText('');
      load();
    } catch { /* ignore */ } finally { setPosting(false); }
  };

  const del = async (commentId) => {
    const tok = ownedTokens[commentId];
    if (!tok) return;
    try {
      await axios.delete(`${API}/storytelling/library/${storyId}/comments/${commentId}`,
        { headers: { 'X-Author-Token': tok } });
      load();
    } catch { /* */ }
  };

  return (
    <div data-testid={`library-comments-${storyId}`} style={{
      background: 'rgba(11,11,14,0.7)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6,
    }}>
      <div className="font-mono-r" style={{
        fontSize: 9, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.10em',
      }}>
        💬 {t('library.comments', 'Comments')} ({items.length})
      </div>
      <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {items.length === 0 && !loading && (
          <div style={{ fontSize: 11, color: '#52525B', fontStyle: 'italic', padding: '4px 0' }}>
            {t('library.commentsEmpty', 'Be the first to speak.')}
          </div>
        )}
        {items.map((c) => (
          <div key={c.id}
            data-testid={`library-comment-${c.id}`}
            style={{
              borderLeft: '2px solid #6366F1', paddingLeft: 8,
              fontSize: 11, color: '#E4E4E7',
            }}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8,
            }}>
              <span style={{ color: '#22D3EE', fontWeight: 700, fontSize: 10 }}>{c.author_name}</span>
              {ownedTokens[c.id] && (
                <button onClick={() => del(c.id)}
                  title="Delete my comment"
                  style={{
                    background: 'transparent', border: 'none', color: '#EF4444',
                    fontSize: 10, cursor: 'pointer', padding: 0,
                  }}
                >✕</button>
              )}
            </div>
            <div style={{ lineHeight: 1.45 }}>{c.content}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          data-testid={`library-comment-author-${storyId}`}
          style={{
            width: 100, background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 5, padding: '4px 6px', fontSize: 10, color: '#E4E4E7',
          }}
        />
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') post(); }}
          placeholder={t('library.commentPlaceholder', 'Share a proverb…')}
          data-testid={`library-comment-input-${storyId}`}
          style={{
            flex: 1, background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 5, padding: '4px 6px', fontSize: 11, color: '#FAFAFA',
          }}
        />
        <button
          onClick={post}
          disabled={posting || !text.trim()}
          data-testid={`library-comment-send-${storyId}`}
          style={{
            background: 'linear-gradient(135deg,#6366F1,#D946EF)', color: '#fff',
            border: 'none', borderRadius: 5, padding: '4px 10px', fontSize: 11,
            cursor: posting ? 'wait' : 'pointer', fontWeight: 700,
          }}
        >➤</button>
      </div>
    </div>
  );
}

/**
 * Compact griot profile modal. Opens when an author_name link is clicked.
 */
export function GriotProfileModal({ author, onClose, onLoadStory }) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!author) return;
    axios.get(`${API}/storytelling/griot/${encodeURIComponent(author)}`)
      .then((r) => setProfile(r.data))
      .catch((e) => setError(e?.response?.status === 404 ? 'not found' : 'load failed'));
  }, [author]);

  if (!author) return null;

  return (
    <div
      data-testid="griot-profile-modal"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', zIndex: 120,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(6px)',
      }}>
      <div style={{
        background: '#18181B', borderRadius: 14, padding: 22,
        width: 'min(680px, 92vw)', maxHeight: '85vh', overflowY: 'auto',
        border: '1px solid rgba(217,70,239,0.36)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <div>
            <div className="font-mono-r" style={{
              fontSize: 9, color: '#22D3EE', letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}>{t('library.griotLabel', 'Griot')}</div>
            <div className="font-heading" style={{ fontSize: 24, fontWeight: 800, color: '#FAFAFA' }}>
              {author}
            </div>
          </div>
          <button onClick={onClose} className="riba-btn" data-testid="griot-close-btn">✕</button>
        </div>

        {error === 'not found' && (
          <div style={{ color: '#FCA5A5', fontSize: 12 }}>
            🔍 {t('library.griotNotFound', 'No public records yet from this griot.')}
          </div>
        )}

        {profile && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <Stat label={t('library.griotRecords', 'Records')}     value={profile.stats.records} />
              <Stat label={t('library.griotPlays', 'Plays')}         value={profile.stats.total_plays} />
              <Stat label={t('library.griotLikes', 'Likes')}         value={profile.stats.total_likes} />
              <Stat label={t('library.griotTopStyle', 'Top style')}
                    value={(profile.stats.top_style || '—').replace(/_/g, ' ')} />
              <Stat label={t('library.griotLanguages', 'Languages')}
                    value={(profile.stats.languages || []).join(' · ').toUpperCase() || '—'} />
            </div>

            {profile.badges?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {profile.badges.map((b) => (
                  <span key={b} data-testid={`griot-badge-${b}`}
                    style={{
                      background: 'linear-gradient(135deg,#F59E0B,#D946EF)',
                      color: '#0B0B0E', padding: '4px 10px', borderRadius: 999,
                      fontSize: 10, fontWeight: 800,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}
                  >🏅 {b.replace(/_/g, ' ')}</span>
                ))}
              </div>
            )}

            <div className="font-mono-r" style={{
              fontSize: 10, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.10em',
              marginTop: 6,
            }}>
              {t('library.griotRecent', 'Recent publications')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 8 }}>
              {profile.records.map((r) => (
                <div key={r.id}
                  data-testid={`griot-record-${r.id}`}
                  style={{
                    background: '#0B0B0E', border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 8, padding: 8, display: 'flex', flexDirection: 'column', gap: 4,
                  }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#FAFAFA',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.title}
                  </div>
                  <div style={{ fontSize: 10, color: '#A1A1AA', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#22D3EE' }}>{r.bantu_style.replace(/_/g, ' ')}</span>
                    <span>· {r.language}</span>
                    <span>· ▶ {r.plays}</span>
                    <span>· ★ {r.likes || 0}</span>
                  </div>
                  <button
                    data-testid={`griot-load-${r.id}`}
                    onClick={() => { onLoadStory?.(r); onClose(); }}
                    style={{
                      background: 'transparent', border: '1px solid #22D3EE66',
                      color: '#22D3EE', borderRadius: 5, padding: '2px 8px',
                      fontSize: 10, fontWeight: 700, cursor: 'pointer',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2,
                    }}
                  >{t('library.loadBtn', 'Load')}</button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div style={{
      flex: '1 1 100px',
      background: 'rgba(11,11,14,0.6)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 8, padding: 8,
    }}>
      <div className="font-mono-r" style={{
        fontSize: 9, color: '#71717A',
        textTransform: 'uppercase', letterSpacing: '0.10em',
      }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#FAFAFA', marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}
