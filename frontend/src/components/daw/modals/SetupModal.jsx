import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, SetupRow } from '../Modal';
import { engine } from '@/audio/engine';
import { MidiSnapshotLibrary } from './MidiSnapshotLibrary';

function CinematicBootToggle() {
  const [on, setOn] = useState(() => {
    try { return localStorage.getItem('riba-cinematic-boot') === '1'; }
    catch { return false; }
  });
  const toggle = () => {
    const next = !on;
    try {
      if (next) localStorage.setItem('riba-cinematic-boot', '1');
      else localStorage.removeItem('riba-cinematic-boot');
      // Force the splash to replay on the next reload by clearing the seen flag.
      sessionStorage.removeItem('riba-splash-seen');
    } catch { /* ignore */ }
    setOn(next);
  };
  return (
    <button
      className="riba-btn"
      data-testid="setup-cinematic-toggle"
      onClick={toggle}
      style={{
        fontSize: 11,
        background: on ? 'linear-gradient(135deg, #D946EF, #F59E0B)' : undefined,
        color: on ? '#fff' : undefined,
        fontWeight: on ? 700 : 500,
      }}
    >
      {on ? '🎬 ON · 8 s trailer at boot' : 'OFF · short boot'}
    </button>
  );
}

function MidiActivityDot({ active }) {
  return (
    <span
      style={{
        display: 'inline-block', width: 9, height: 9, borderRadius: '50%',
        background: active ? '#22C55E' : '#3F3F46',
        boxShadow: active ? '0 0 10px rgba(34,197,94,0.85)' : 'none',
        transition: 'box-shadow 120ms ease-out, background 120ms ease-out',
      }}
    />
  );
}

export function SetupModal({
  setupTab, setSetupTab, audioDevices, onRefreshDevices,
  theme, setTheme, tempo, timeSig, looping, metronomeOn,
  undoCount, onClose,
  // MIDI props (Sprint v3.8)
  midi,
  onMidiRequestAccess,
}) {
  const { t } = useTranslation();
  const subtitleMap = {
    playback: 'Playback Engine',
    io: 'I/O Setup',
    midi: 'MIDI Input',
    preferences: 'Preferences',
  };
  const title = `${t('setup.title')} · ${subtitleMap[setupTab] || ''}`;
  const tabs = [
    ['playback', t('setup.playbackTab')],
    ['io', t('setup.ioTab')],
    ['midi', t('setup.midiTab')],
    ['preferences', t('setup.preferencesTab')],
  ];
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 8 }}>
        {tabs.map(([k, l]) => (
          <button key={k} className="riba-btn" data-active={setupTab === k}
            data-testid={`setup-tab-${k}`}
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
      {setupTab === 'midi' && (
        <MidiTab midi={midi} onRequestAccess={onMidiRequestAccess} t={t} />
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
          <SetupRow label="Boot Cinematic Intro" value={<CinematicBootToggle />} />
        </div>
      )}
    </Modal>
  );
}

function MidiTab({ midi, onRequestAccess, t }) {
  const m = midi || { supported: false, devices: [], activity: {}, permission: 'idle', lastEvent: null };
  const inputs = m.devices.filter((d) => d.kind === 'input');
  const outputs = m.devices.filter((d) => d.kind === 'output');
  const evt = m.lastEvent;

  return (
    <div
      data-testid="setup-midi-panel"
      style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}
    >
      <SetupRow label={t('setup.midi.support')} value={
        <span data-testid="setup-midi-support" className="font-mono-r" style={{ color: m.supported ? '#22C55E' : '#EF4444', fontSize: 12 }}>
          {m.supported ? t('setup.midi.supportedYes') : t('setup.midi.supportedNo')}
        </span>
      } />
      <SetupRow label={t('setup.midi.permission')} value={
        <span data-testid="setup-midi-permission" className="font-mono-r" style={{ fontSize: 12 }}>
          {m.permission === 'granted' ? '✓ ' + t('setup.midi.granted')
            : m.permission === 'denied' ? '✕ ' + t('setup.midi.denied')
              : t('setup.midi.idle')}
        </span>
      } />
      {m.supported && m.permission !== 'granted' && (
        <button
          className="riba-btn"
          data-testid="setup-midi-request-access"
          onClick={onRequestAccess}
          style={{ alignSelf: 'flex-start', fontSize: 11, marginTop: 2 }}
        >
          🎹 {t('setup.midi.requestAccess')}
        </button>
      )}

      {/* Devices list */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em', marginBottom: 6 }}>
          {t('setup.midi.devicesLabel')} ({inputs.length})
        </div>
        {inputs.length === 0 ? (
          <div data-testid="setup-midi-no-inputs" style={{ fontSize: 12, color: '#71717A' }}>
            {t('setup.midi.noInputs')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {inputs.map((d) => (
              <div
                key={d.id}
                data-testid={`setup-midi-device-${d.id}`}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  fontSize: 11, color: '#FAFAFA', background: '#09090B',
                  padding: '5px 10px', borderRadius: 4, border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MidiActivityDot active={!!m.activity[d.id]} />
                  <span style={{ fontWeight: 600 }}>🎹 {d.name}</span>
                  {d.manufacturer && (
                    <span style={{ color: '#71717A', fontSize: 10 }}>· {d.manufacturer}</span>
                  )}
                </span>
                <span className="font-mono-r" style={{ fontSize: 10, color: d.state === 'connected' ? '#22C55E' : '#A1A1AA' }}>
                  {d.state}
                </span>
              </div>
            ))}
          </div>
        )}
        {outputs.length > 0 && (
          <>
            <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A', marginTop: 8 }}>
              {t('setup.midi.outputsLabel')} ({outputs.length})
            </div>
            {outputs.map((d) => (
              <div key={d.id} style={{ fontSize: 11, color: '#A1A1AA', padding: '3px 8px' }}>
                ▸ {d.name}
              </div>
            ))}
          </>
        )}
      </div>

      {/* Live signal indicator */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em', marginBottom: 6 }}>
          {t('setup.midi.lastEvent')}
        </div>
        {!evt ? (
          <div data-testid="setup-midi-no-event" style={{ fontSize: 12, color: '#71717A' }}>
            {t('setup.midi.lastEventEmpty')}
          </div>
        ) : (
          <div
            data-testid="setup-midi-last-event"
            className="font-mono-r"
            style={{
              fontSize: 11, color: '#FAFAFA', background: '#09090B',
              padding: '6px 10px', borderRadius: 4, border: '1px solid rgba(217,70,239,0.35)',
            }}
          >
            {evt.kind === 'noteon' && (
              <>note-on · pitch {evt.pitch} · vel {evt.velocity} {evt.action ? `→ ${evt.action}` : ''}</>
            )}
            {evt.kind === 'noteoff' && (
              <>note-off · pitch {evt.pitch}</>
            )}
            {evt.kind === 'cc' && (
              <>cc {evt.controller} = {evt.value} {evt.action ? `→ ${evt.action}` : ''}</>
            )}
            {evt.kind === 'pitchbend' && (
              <>pitch-bend · {evt.value}</>
            )}
          </div>
        )}
      </div>

      {/* Mapping reference card */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="font-mono-r" style={{ fontSize: 10, color: '#A1A1AA', letterSpacing: '0.1em', marginBottom: 6 }}>
          {t('setup.midi.mappingLabel')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
          <div style={{ color: '#A1A1AA' }}>♪ 60 / C4</div><div>{t('setup.midi.actionPlay')}</div>
          <div style={{ color: '#A1A1AA' }}>♪ 61 / C#4</div><div>{t('setup.midi.actionStop')}</div>
          <div style={{ color: '#A1A1AA' }}>♪ 62 / D4</div><div>{t('setup.midi.actionRecord')}</div>
          <div style={{ color: '#A1A1AA' }}>♪ 63 / D#4</div><div>{t('setup.midi.actionLoop')}</div>
          <div style={{ color: '#A1A1AA' }}>♪ 64 / E4</div><div>{t('setup.midi.actionMetronome')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 16</div><div>{t('setup.midi.actionTempo')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 17</div><div>{t('setup.midi.actionSwingIntensity')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 18</div><div>{t('setup.midi.actionSwingEnable')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 19</div><div>{t('setup.midi.actionSwingStyle')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 7</div><div>{t('setup.midi.actionVolume')}</div>
          <div style={{ color: '#A1A1AA' }}>CC 1</div><div>{t('setup.midi.actionPan')}</div>
        </div>
      </div>

      {/* Snapshot Library (Sprint v3.10) */}
      <div style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <MidiSnapshotLibrary />
      </div>

      <div style={{ marginTop: 8, color: '#A1A1AA', fontSize: 11 }}>
        🎹 {t('setup.midi.note')}
      </div>
    </div>
  );
}
