import React from 'react';
import { Modal, SetupRow } from '../Modal';
import { engine } from '@/audio/engine';

export function SetupModal({
  setupTab, setSetupTab, audioDevices, onRefreshDevices,
  theme, setTheme, tempo, timeSig, looping, metronomeOn,
  undoCount, onClose
}) {
  const title = `Setup · ${setupTab === 'playback' ? 'Playback Engine' : setupTab === 'io' ? 'I/O Setup' : 'Preferences'}`;
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
        {[['playback', 'Playback Engine'], ['io', 'I/O Setup'], ['preferences', 'Preferences']].map(([k, l]) => (
          <button key={k} className="riba-btn" data-active={setupTab === k}
            onClick={() => setSetupTab(k)}
            style={{ fontSize: 11 }}>{l}</button>
        ))}
      </div>
      {setupTab === 'playback' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <SetupRow label="Audio Engine" value="Web Audio API" />
          <SetupRow label="Sample Rate" value={`${engine.ctx?.sampleRate || 48000} Hz`} />
          <SetupRow label="Buffer Size" value={`${engine.ctx?.baseLatency ? Math.round(engine.ctx.baseLatency * 1000) : '~'} ms (system)`} />
          <SetupRow label="Output Latency" value={`${engine.ctx?.outputLatency ? Math.round(engine.ctx.outputLatency * 1000) : '~'} ms`} />
          <SetupRow label="State" value={engine.ctx?.state || 'not started'} />
          <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em' }}>DETECTED HARDWARE</div>
              <button className="riba-btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={onRefreshDevices}>Refresh</button>
            </div>
            {!audioDevices.loaded ? (
              <div style={{ fontSize: 12, color: '#71717A' }}>Click Refresh to enumerate audio devices.</div>
            ) : !audioDevices.supported ? (
              <div style={{ fontSize: 12, color: '#EF4444' }}>enumerateDevices not supported in this browser.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>INPUTS ({audioDevices.inputs.length})</div>
                {audioDevices.inputs.map((d, i) => (
                  <div key={d.deviceId || i} style={{ fontSize: 11, color: '#FAFAFA', background: '#09090B', padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    🎤 {d.label || `Microphone ${i + 1}`}
                  </div>
                ))}
                <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A', marginTop: 4 }}>OUTPUTS ({audioDevices.outputs.length})</div>
                {audioDevices.outputs.map((d, i) => (
                  <div key={d.deviceId || i} style={{ fontSize: 11, color: '#FAFAFA', background: '#09090B', padding: '4px 8px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)' }}>
                    🔊 {d.label || `Speaker ${i + 1}`}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ marginTop: 8, color: '#A1A1AA', fontSize: 11 }}>
            ⚠️ Native ASIO / CoreAudio drivers cannot be selected in browsers. For lower latency, consider the desktop build (Electron + ASIO host).
          </div>
        </div>
      )}
      {setupTab === 'io' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <SetupRow label="Input" value="Default microphone (getUserMedia)" />
          <SetupRow label="Output" value="Default speakers (AudioDestinationNode)" />
          <SetupRow label="Active Input Channels" value="1 (mono mic capture)" />
          <SetupRow label="Active Output Channels" value="2 (stereo)" />
          <SetupRow label="Master Bus" value="Master Gain → Analyser → Destination" />
        </div>
      )}
      {setupTab === 'preferences' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <SetupRow label="Theme" value={
            <button className="riba-btn" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} style={{ fontSize: 11 }}>
              {theme === 'dark' ? 'Dark (click to switch)' : 'Light (click to switch)'}
            </button>
          } />
          <SetupRow label="Tempo" value={`${tempo} BPM`} />
          <SetupRow label="Time Signature" value={`${timeSig}/4`} />
          <SetupRow label="Loop" value={looping ? 'ON' : 'OFF'} />
          <SetupRow label="Metronome" value={metronomeOn ? 'ON' : 'OFF'} />
          <SetupRow label="Auto-save" value="Disabled (use Ctrl+S manually)" />
          <SetupRow label="Undo History" value={`${undoCount} / 30 steps`} />
        </div>
      )}
    </Modal>
  );
}
