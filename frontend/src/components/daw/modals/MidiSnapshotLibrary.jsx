// RIBA · MIDI Snapshot Library — save/load/share named control maps.
//
// Rendered inside the Setup → MIDI tab. Talks to /api/midi/snapshots/*.
// All actions are owner-scoped via the localStorage MIDI owner key.

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMidiLearn } from '@/hooks/useMidiLearn';

const API = process.env.REACT_APP_BACKEND_URL?.replace(/\/$/, '') || '';

export function MidiSnapshotLibrary() {
  const { t } = useTranslation();
  const { owner, assignments, replaceAssignments } = useMidiLearn();
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [shareLabel, setShareLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [publicItems, setPublicItems] = useState([]);
  const [featured, setFeatured] = useState(null);
  const [featuredCount, setFeaturedCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!owner) return;
    try {
      const r = await fetch(`${API}/api/midi/snapshots?owner=${encodeURIComponent(owner)}`);
      if (!r.ok) return;
      const data = await r.json();
      setItems(data.snapshots || []);
    } catch { /* offline */ }
  }, [owner]);

  const refreshPublic = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/midi/snapshots/public?limit=30`);
      if (!r.ok) return;
      const data = await r.json();
      setPublicItems(data.snapshots || []);
    } catch { /* offline */ }
  }, []);

  const refreshFeatured = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/midi/snapshots/featured?window_days=7`);
      if (!r.ok) return;
      const data = await r.json();
      setFeatured(data.featured);
      setFeaturedCount(data.window_count || 0);
    } catch { /* offline */ }
  }, []);

  useEffect(() => {
    refresh();
    refreshPublic();
    refreshFeatured();
  }, [refresh, refreshPublic, refreshFeatured]);

  // Build the current mapping payload from live MIDI Learn assignments.
  const buildPayload = useCallback(() => {
    const notes = {};
    const cc = {};
    for (const [action, a] of Object.entries(assignments || {})) {
      if (a.kind === 'noteon') notes[a.key] = action;
      else if (a.kind === 'cc') cc[a.key] = action;
    }
    return { notes, cc };
  }, [assignments]);

  const save = useCallback(async () => {
    const n = (name || '').trim();
    if (!n) { setStatus(t('midi.snapshots.errEmptyName')); return; }
    setBusy(true);
    setStatus('');
    try {
      const { notes, cc } = buildPayload();
      const r = await fetch(`${API}/api/midi/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, name: n, notes, cc, shared: false }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus(`✓ ${t('midi.snapshots.saved')} · ${n}`);
      setName('');
      refresh();
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }, [name, owner, buildPayload, refresh, t]);

  const apply = useCallback(async (snap) => {
    setBusy(true);
    setStatus(`… ${t('midi.snapshots.applying')} · ${snap.name}`);
    try {
      // Replace the user mapping wholesale with this snapshot — done via the
      // existing PATCH endpoint, key by key (idempotent merge). Persistence
      // and local-state refresh happen in parallel so the UI updates without
      // a full page reload.
      const tasks = [];
      for (const [k, action] of Object.entries(snap.notes || {})) {
        tasks.push(fetch(`${API}/api/midi/mapping/${owner}/learn`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner, kind: 'noteon', pitch: Number(k), action,
          }),
        }));
      }
      for (const [k, action] of Object.entries(snap.cc || {})) {
        tasks.push(fetch(`${API}/api/midi/mapping/${owner}/learn`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner, kind: 'cc', controller: Number(k), action,
          }),
        }));
      }
      await Promise.all(tasks);
      // Local assignments refresh — no more forced reload.
      replaceAssignments(snap);
      setStatus(`✓ ${t('midi.snapshots.applied')} · ${snap.name} (${tasks.length} bindings)`);
      setTimeout(() => setStatus(''), 2500);
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }, [owner, replaceAssignments, t]);

  const shareToggle = useCallback(async (snap) => {
    setBusy(true);
    try {
      const next = !snap.shared;
      const params = new URLSearchParams({
        owner, shared: String(next),
      });
      if (next && shareLabel) params.set('share_label', shareLabel);
      const r = await fetch(`${API}/api/midi/snapshots/${snap.id}/share?${params}`, {
        method: 'POST',
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus(next ? `📡 ${t('midi.snapshots.sharedOn')}` : `🔒 ${t('midi.snapshots.sharedOff')}`);
      refresh();
      refreshPublic();
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }, [owner, shareLabel, refresh, refreshPublic, t]);

  const remove = useCallback(async (snap) => {
    if (!window.confirm(`${t('midi.snapshots.confirmDelete')} · ${snap.name}?`)) return;
    setBusy(true);
    try {
      const r = await fetch(
        `${API}/api/midi/snapshots/${snap.id}?owner=${encodeURIComponent(owner)}`,
        { method: 'DELETE' },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setStatus(`✓ ${t('midi.snapshots.deleted')}`);
      refresh();
      refreshPublic();
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }, [owner, refresh, refreshPublic, t]);

  const applyPublic = useCallback(async (sid) => {
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/midi/snapshots/${sid}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const full = await r.json();
      await apply(full);
      // Log the import event so the Featured-this-week ranking reflects it.
      fetch(`${API}/api/midi/snapshots/${sid}/import?importer=${encodeURIComponent(owner)}`, {
        method: 'POST',
      })
        .then(() => refreshFeatured())
        .catch(() => { /* best-effort */ });
    } catch (e) {
      setStatus(`⚠️ ${e.message}`);
    } finally { setBusy(false); }
  }, [apply, owner, refreshFeatured]);

  const liveCount = Object.keys(assignments || {}).length;

  return (
    <div
      data-testid="midi-snapshot-library"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12, marginTop: 4 }}
    >
      <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em' }}>
        {t('midi.snapshots.title')} · {t('midi.snapshots.liveCount', { count: liveCount })}
      </div>

      {/* 🏆 Snapshot of the Week — featured banner */}
      {featured && (
        <div
          data-testid="midi-snapshot-featured-banner"
          style={{
            position: 'relative',
            padding: '10px 12px',
            background: 'linear-gradient(135deg, rgba(217,70,239,0.18), rgba(245,158,11,0.18))',
            border: '1px solid rgba(245,158,11,0.45)',
            borderRadius: 6,
            display: 'flex', alignItems: 'center', gap: 10,
            boxShadow: '0 4px 14px rgba(245,158,11,0.18) inset',
          }}
        >
          <div style={{ fontSize: 22 }}>🏆</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="font-mono-r" style={{ fontSize: 9, color: '#F59E0B', letterSpacing: '0.1em' }}>
              {t('midi.snapshots.sotwLabel')}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FAFAFA', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {featured.name}
            </div>
            <div style={{ fontSize: 10, color: '#A1A1AA' }}>
              {featured.share_label && <>{featured.share_label} · </>}
              <span data-testid="midi-snapshot-featured-count">
                {t('midi.snapshots.sotwCount', { count: featuredCount })}
              </span>
              <span style={{ marginLeft: 6, color: '#71717A' }}>by {featured.owner}</span>
            </div>
          </div>
          <button
            data-testid="midi-snapshot-featured-apply"
            className="riba-btn"
            disabled={busy}
            onClick={() => applyPublic(featured.id)}
            style={{
              fontSize: 10, padding: '5px 12px',
              background: 'linear-gradient(135deg, #D946EF, #F59E0B)',
              color: '#fff', fontWeight: 700,
            }}
          >
            ⬇ {t('midi.snapshots.import')}
          </button>
        </div>
      )}

      {/* Save row */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          data-testid="midi-snapshot-name-input"
          type="text" value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('midi.snapshots.namePlaceholder')}
          maxLength={80}
          style={{
            flex: 1, background: '#09090B', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4, color: '#FAFAFA', fontSize: 11, padding: '4px 8px',
          }}
        />
        <button
          data-testid="midi-snapshot-save-btn"
          className="riba-btn"
          disabled={busy || !name.trim() || liveCount === 0}
          onClick={save}
          style={{ fontSize: 10, background: 'linear-gradient(135deg, #D946EF, #F59E0B)', color: '#fff', fontWeight: 700, opacity: (busy || !name.trim() || liveCount === 0) ? 0.45 : 1 }}
        >
          💾 {t('midi.snapshots.save')}
        </button>
      </div>

      {/* User snapshots */}
      <div data-testid="midi-snapshot-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflow: 'auto' }}>
        {items.length === 0 ? (
          <div style={{ fontSize: 11, color: '#71717A', padding: '6px 0' }}>
            {t('midi.snapshots.empty')}
          </div>
        ) : items.map((s) => (
          <div
            key={s.id}
            data-testid={`midi-snapshot-row-${s.id}`}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: '#09090B', padding: '6px 8px', borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.05)',
            }}
          >
            <span style={{ flex: 1, fontWeight: 600, fontSize: 11 }}>
              {s.shared && <span style={{ color: '#22C55E', marginRight: 6 }}>📡</span>}
              {s.name}
            </span>
            <span className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
              {(Object.keys(s.notes || {}).length + Object.keys(s.cc || {}).length)} ▸
            </span>
            <button
              data-testid={`midi-snapshot-apply-${s.id}`}
              className="riba-btn" disabled={busy}
              onClick={() => apply(s)}
              style={{ fontSize: 9, padding: '3px 8px' }}
            >
              {t('midi.snapshots.apply')}
            </button>
            <button
              data-testid={`midi-snapshot-share-${s.id}`}
              className="riba-btn" disabled={busy}
              onClick={() => shareToggle(s)}
              style={{ fontSize: 9, padding: '3px 8px',
                background: s.shared ? '#22C55E' : undefined,
                color: s.shared ? '#000' : undefined,
              }}
            >
              {s.shared ? t('midi.snapshots.unshare') : t('midi.snapshots.share')}
            </button>
            <button
              data-testid={`midi-snapshot-delete-${s.id}`}
              className="riba-btn" disabled={busy}
              onClick={() => remove(s)}
              style={{ fontSize: 9, padding: '3px 8px', color: '#EF4444' }}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Share label input */}
      {items.some((s) => !s.shared) && (
        <input
          data-testid="midi-snapshot-share-label"
          type="text" value={shareLabel}
          onChange={(e) => setShareLabel(e.target.value)}
          placeholder={t('midi.snapshots.shareLabelPlaceholder')}
          maxLength={120}
          style={{
            background: '#09090B', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 4, color: '#FAFAFA', fontSize: 10, padding: '4px 8px',
          }}
        />
      )}

      {/* Public Bantu Library snapshots */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em', marginBottom: 6 }}>
          {t('midi.snapshots.publicTitle')} ({publicItems.length})
        </div>
        <div data-testid="midi-snapshot-public-list" style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 140, overflow: 'auto' }}>
          {publicItems.length === 0 ? (
            <div style={{ fontSize: 11, color: '#71717A' }}>
              {t('midi.snapshots.publicEmpty')}
            </div>
          ) : publicItems.map((s) => (
            <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#09090B', padding: '6px 8px', borderRadius: 4, border: '1px solid rgba(34,197,94,0.18)' }}>
              <span style={{ flex: 1 }}>
                <span style={{ fontWeight: 600, fontSize: 11 }}>📡 {s.name}</span>
                {s.share_label && (
                  <span style={{ fontSize: 10, color: '#A1A1AA', marginLeft: 6 }}>· {s.share_label}</span>
                )}
                <div className="font-mono-r" style={{ fontSize: 9, color: '#71717A' }}>
                  by {s.owner}
                  {typeof s.import_count === 'number' && s.import_count > 0 && (
                    <span style={{ color: '#F59E0B', marginLeft: 8 }}>· ⬇ {s.import_count}</span>
                  )}
                </div>
              </span>
              <button
                data-testid={`midi-snapshot-public-apply-${s.id}`}
                className="riba-btn" disabled={busy}
                onClick={() => applyPublic(s.id)}
                style={{ fontSize: 9, padding: '3px 8px', background: 'linear-gradient(135deg, #D946EF, #F59E0B)', color: '#fff', fontWeight: 700 }}
              >
                ⬇ {t('midi.snapshots.import')}
              </button>
            </div>
          ))}
        </div>
      </div>

      {!!status && (
        <div data-testid="midi-snapshot-status" style={{ fontSize: 10, color: status.startsWith('⚠️') ? '#EF4444' : '#A1A1AA', padding: '4px 0' }}>
          {status}
        </div>
      )}
    </div>
  );
}
