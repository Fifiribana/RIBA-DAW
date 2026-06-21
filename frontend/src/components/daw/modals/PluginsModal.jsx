import React, { useEffect, useState } from 'react';
import { Modal } from '../Modal';

export function PluginsModal({ onClose }) {
  const [plugins, setPlugins] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadRealPlugins() {
      try {
        // Si on tourne sous Tauri (sur votre PC), on appelle le scanner Rust
        if (window.__TAURI_INTERNALS__ !== undefined) {
          const { invoke } = await import('@tauri-apps/api/core');
          const realList = await invoke('scan_vst_plugins');
          setPlugins(realList || []);
        } else {
          setPlugins([]);
        }
      } catch (e) {
        console.error("Erreur lors du chargement des plugins :", e);
      } finally {
        setLoading(false);
      }
    }
    loadRealPlugins();
  }, []);

  return (
    <Modal title={window.__TAURI_INTERNALS__ !== undefined ? "Plugins VST3 de votre PC" : "Plugins (Liste simulée)"} onClose={onClose}>
      
      {/* Message d'état dynamique selon la plateforme */}
      {window.__TAURI_INTERNALS__ !== undefined ? (
        <div style={{ color: '#22C55E', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>✓</span> Moteur natif RIBA connecté à votre système Windows.
        </div>
      ) : (
        <div style={{ color: '#EAB308', fontSize: 12, marginBottom: 12 }}>
          ⚠️ Mode aperçu web — lancez l'application de bureau pour scanner vos vrais fichiers locaux.
        </div>
      )}

      {/* Liste des plugins */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 400, overflow: 'auto' }}>
        {loading ? (
          <div style={{ color: '#71717A', fontSize: 13, textAlign: 'center', padding: 10 }}>
            Lecture du catalogue de votre PC...
          </div>
        ) : plugins.length === 0 ? (
          <div style={{ color: '#71717A', fontSize: 13, textAlign: 'center', padding: 10 }}>
            Aucun plugin détecté. Cliquez sur le bouton "VST Scan" dans le panneau de gauche pour lancer la recherche.
          </div>
        ) : (
          plugins.map((pluginName, i) => (
            <div key={i} style={{
              background: '#09090B', borderRadius: 6, padding: '10px 12px',
              border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  background: 'rgba(217, 70, 239, 0.1)', color: '#D946EF', padding: '2px 6px',
                  borderRadius: 3, fontSize: 9, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700
                }}>VST3</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#FFF' }}>{pluginName}</div>
              </div>
              <div style={{ fontSize: 10, color: '#52525B', fontFamily: 'monospace' }}>.vst3</div>
            </div>
          ))
        )}
      </div>
    </Modal>
  );
}
