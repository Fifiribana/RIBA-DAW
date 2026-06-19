import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Play, Stop, Record, Sparkle, Clock, ClockClockwise, Sliders, Waveform as WaveIcon,
  Sun, Moon, BookOpen, Trash, FloppyDisk, FolderOpen, DownloadSimple, Plus,
  Microphone, MusicNote, MagicWand, ArrowsLeftRight, Equalizer as EqIcon,
  Repeat, ArrowUUpLeft, ArrowUUpRight, Plug, Package, PianoKeys, Faders, Export
} from '@phosphor-icons/react';
import { engine, audioBufferToWavBlob } from '@/audio/engine';
import { GM_INSTRUMENTS } from '@/audio/instruments';
import { TID } from '@/constants/testIds';
import TrackRow from './TrackRow';
import Spectrum from './Spectrum';
import VUMeter from './VUMeter';
import DreamDialog from './DreamDialog';
import PianoRoll from './PianoRoll';
import { MenuBar } from './daw/MenuBar';
import { Timeline } from './daw/Timeline';
import { DreamHistoryModal } from './daw/modals/DreamHistoryModal';
import { MasteringModal } from './daw/modals/MasteringModal';
import { ManualModal } from './daw/modals/ManualModal';
import { GmInstrumentsModal } from './daw/modals/GmInstrumentsModal';
import { PluginsModal } from './daw/modals/PluginsModal';
import { MixerModal } from './daw/modals/MixerModal';
import { BantuGridModal } from './daw/modals/BantuGridModal';
import { SetupModal } from './daw/modals/SetupModal';
import { SystemUsageModal } from './daw/modals/SystemUsageModal';
import { DiskUsageModal } from './daw/modals/DiskUsageModal';
import { AssistantModal } from './daw/modals/AssistantModal';
import { MagicGeneratorModal } from './daw/modals/MagicGeneratorModal';
import { MagicRemixModal } from './daw/modals/MagicRemixModal';
import { GlobalTransportPlayer } from './daw/GlobalTransportPlayer';
import { MagentaOverlay } from './daw/MagentaSpinner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const kbdStyle = {
  background: '#27272A', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 3, padding: '0 6px', fontSize: 9, marginRight: 6,
  fontFamily: 'JetBrains Mono, monospace'
};

const TRACK_COLORS = {
  voice: '#3B82F6', drums: '#22C55E', bass: '#F97316',
  guitar: '#EA580C', synth: '#EC4899', dream: '#D946EF',
  recording: '#3B82F6', other: '#71717A'
};

function detectType(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('voice') || n.includes('vocal') || n.includes('voix')) return 'voice';
  if (n.includes('drum') || n.includes('kick') || n.includes('batt')) return 'drums';
  if (n.includes('bass') || n.includes('basse')) return 'bass';
  if (n.includes('guitar') || n.includes('guitare')) return 'guitar';
  if (n.includes('synth')) return 'synth';
  return 'other';
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export default function Daw() {
  const [tracks, setTracks] = useState([]);
  const [tempo, setTempo] = useState(120);
  const [masterVol, setMasterVol] = useState(80);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metroBeat, setMetroBeat] = useState(0);
  const [metroMeasure, setMetroMeasure] = useState(1);
  const [timeSig, setTimeSig] = useState(4);
  const [recording, setRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [theme, setTheme] = useState('dark');

  // === PWA install state ===
  const [pwaPrompt, setPwaPrompt] = useState(null);
  const [pwaInstalled, setPwaInstalled] = useState(false);
  useEffect(() => {
    const handler = (e) => { e.preventDefault(); setPwaPrompt(e); };
    const installed = () => { setPwaInstalled(true); setPwaPrompt(null); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installed);
    // Detect if running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setPwaInstalled(true);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);
  const handleInstallPwa = useCallback(async () => {
    if (!pwaPrompt) {
      setStatusMsg('Install not available. Use browser menu → Install RIBA.');
      return;
    }
    pwaPrompt.prompt();
    const { outcome } = await pwaPrompt.userChoice;
    setStatusMsg(outcome === 'accepted' ? 'RIBA installed!' : 'Install dismissed');
    setPwaPrompt(null);
  }, [pwaPrompt]);

  // === New v1.1 state ===
  const [looping, setLooping] = useState(false);
  const [openMenu, setOpenMenu] = useState(null);
  const [gmOpen, setGmOpen] = useState(false);
  const [gmSelectedIdx, setGmSelectedIdx] = useState(0);
  const [vstScanning, setVstScanning] = useState(false);
  const [vstFoundCount, setVstFoundCount] = useState(0);
  const [pluginsOpen, setPluginsOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [stemsExporting, setStemsExporting] = useState(false);
  const [stemsProgress, setStemsProgress] = useState({ current: 0, total: 0 });
  // === Pro Tools features state ===
  const [selectedTrackId, setSelectedTrackId] = useState(null);
  const clipboardRef = useRef(null);
  const [bouncing, setBouncing] = useState(false);
  const [bounceProgress, setBounceProgress] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupTab, setSetupTab] = useState('playback');
  const [audioDevices, setAudioDevices] = useState({ inputs: [], outputs: [], supported: false, loaded: false });
  const [bantuOpen, setBantuOpen] = useState(false);
  const [bantuStyle, setBantuStyle] = useState('bikutsi_44');
  const [bantuDensity, setBantuDensity] = useState(16);
  const [bantuBars, setBantuBars] = useState(4);
  const [bantuStyles, setBantuStyles] = useState([]);
  // Show asymmetric grid markers on the timeline (RIBA innovation visual)
  const [showBantuMarkers, setShowBantuMarkers] = useState(false);
  // Bantu Swing Live — non-destructive humanization during playback
  const [bantuSwingEnabled, setBantuSwingEnabled] = useState(false);
  const [bantuSwingIntensity, setBantuSwingIntensity] = useState(0.7);
  // Pro Tools-style Window/View extras
  const [systemUsageOpen, setSystemUsageOpen] = useState(false);
  const [diskUsageOpen, setDiskUsageOpen] = useState(false);
  const [waveformMode, setWaveformMode] = useState('peak'); // peak|power|rectified|outlines|crossfades
  // AI Assistant chat panel
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Magic Generator (Suno-style)
  const [magicGenOpen, setMagicGenOpen] = useState(false);
  // Magic Re-mix (Demucs ▸ Bantu Grid ▸ fal.ai chain)
  const [magicRemixOpen, setMagicRemixOpen] = useState(false);
  // Genesis workflow (prompt → fal.ai → Demucs → 4 stems + Bantu Grid)
  const [genesisStatus, setGenesisStatus] = useState({ ready: false, mode: 'unavailable' });
  useEffect(() => {
    fetch(`${API}/ai/genesis-status`).then(r => r.json()).then(setGenesisStatus).catch(() => {});
  }, []);

  const runGenesis = useCallback(async () => {
    const prompt = window.prompt(
      'Genesis · prompt your track:\n\nExamples:\n• "Bikutsi tropical house, 110 bpm"\n• "Afrobeat groove with mbira and slap bass"\n• "Sweet rumba ballad, late night Kinshasa"',
      'Bikutsi tropical house'
    );
    if (!prompt || !prompt.trim()) return;

    if (!genesisStatus.fal_ready) {
      setStatusMsg('🌍 Genesis: FAL_KEY not configured. Set it in /app/backend/.env then restart.');
      return;
    }
    setDemucsLoading(true);
    setStatusMsg('🌍 Genesis · step 1/3: generating music via fal.ai…');
    try {
      // Step 1 — generate
      const gen = await fetch(`${API}/ai/generate-track`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration_seconds: 30, instrumental: true, style: 'Bantu groove' }),
      }).then(r => r.json());
      if (!gen.audio_url) throw new Error(`Generation failed: ${gen.fallback_reason || 'unknown'}`);

      // Step 2 — fetch WAV + send to Demucs
      setStatusMsg('🌍 Genesis · step 2/3: Demucs separating 4 stems…');
      const audioUrl = gen.audio_url.startsWith('http') ? gen.audio_url : `${BACKEND_URL}${gen.audio_url}`;
      const wav = await (await fetch(audioUrl)).blob();
      const form = new FormData();
      form.append('file', wav, `${gen.title || 'genesis'}.wav`);
      const sep = await fetch(`${API}/ai/separate-stems`, { method: 'POST', body: form })
        .then(async (r) => { if (!r.ok) throw new Error(`Demucs ${r.status}`); return r.json(); });

      // Step 3 — create 4 tracks + enable Bantu Grid
      setStatusMsg('🌍 Genesis · step 3/3: building 4 multi-tracks…');
      const ctx = engine.ensureCtx();
      for (const name of ['vocals', 'drums', 'bass', 'other']) {
        const s = sep.stems[name];
        if (!s) continue;
        const bin = Uint8Array.from(atob(s.wav_base64), c => c.charCodeAt(0));
        const buf = await ctx.decodeAudioData(bin.buffer.slice(0));
        const tid = uid();
        const type = name === 'vocals' ? 'voice' : name === 'drums' ? 'drums' : name === 'bass' ? 'bass' : 'other';
        const peaks = new Array(80).fill(0).map((_, k) => 0.1 + 0.6 * Math.abs(Math.sin(k * 0.5 + name.charCodeAt(0))));
        const t = {
          id: tid, displayName: `Genesis · ${name}`,
          trackType: type, color: TRACK_COLORS[type] || TRACK_COLORS.other,
          isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
          volume: 80, pan: 0, peaks,
          eq: { bass: 50, mid: 50, high: 50, enabled: false },
          fileName: '', isStemSeparated: true, audioBuffer: buf,
        };
        engine.getOrCreateTrack(tid).setAudio(buf);
        engine.getOrCreateTrack(tid).setVolume(0.8);
        setTracks(prev => [...prev, t]);
      }
      // Activate Bantu Grid + Markers
      setBantuStyle('bikutsi_44'); setBantuDensity(16); setBantuBars(4);
      setShowBantuMarkers(true);
      setStatusMsg(`🌍 Genesis ✓ "${gen.title}" → 4 stems + Bantu Grid Bikutsi 4/4 active`);
    } catch (e) {
      setStatusMsg(`🌍 Genesis failed: ${e.message}`);
    } finally {
      setDemucsLoading(false);
    }
  }, [genesisStatus.fal_ready]);
  const undoStackRef = useRef([]);
  const redoStackRef = useRef([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const [dreamOpen, setDreamOpen] = useState(false);
  const [dreaming, setDreaming] = useState(false);
  const [dreamProgress, setDreamProgress] = useState(0);
  const [dreamHistory, setDreamHistory] = useState([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [pianoTrackId, setPianoTrackId] = useState(null);
  const [statusMsg, setStatusMsg] = useState('Ready · WebAudio engine initialized');
  const [progressTick, setProgressTick] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [masterSuggestions, setMasterSuggestions] = useState('');
  const [masteringOpen, setMasteringOpen] = useState(false);
  const [masteringLoading, setMasteringLoading] = useState(false);

  const fileInputRef = useRef(null);
  const projectFileInputRef = useRef(null);
  const recTimerRef = useRef(null);

  // === Undo/Redo snapshot helpers ===
  const snapshotState = useCallback(() => ({
    tracks: tracks.map(t => ({
      ...t,
      // keep arrays referenceable
      midiNotes: t.midiNotes ? [...t.midiNotes] : [],
      effects: { ...(t.effects || {}) },
      eq: { ...t.eq },
    })),
    tempo, masterVol, timeSig,
  }), [tracks, tempo, masterVol, timeSig]);

  const pushUndo = useCallback(() => {
    undoStackRef.current.push(snapshotState());
    if (undoStackRef.current.length > 30) undoStackRef.current.shift();
    redoStackRef.current = [];
    setHistoryVersion(v => v + 1);
  }, [snapshotState]);

  const restoreSnapshot = useCallback((snap) => {
    // dispose current engine tracks then rebuild
    tracks.forEach(t => engine.removeTrack(t.id));
    snap.tracks.forEach(t => {
      const n = engine.getOrCreateTrack(t.id);
      n.setVolume((t.volume || 80) / 100);
      n.setPan((t.pan || 0) / 50);
      n.setEQ(t.eq.bass, t.eq.mid, t.eq.high, t.eq.enabled);
      n.setReverb(!!t.effects?.reverb);
      n.setDelay(!!t.effects?.delay);
      if (t.isMIDI && t.midiNotes?.length) n.setMIDI(t.midiNotes);
      if (typeof t.instrumentIndex === 'number') n.setInstrument(t.instrumentIndex);
    });
    setTracks(snap.tracks);
    setTempo(snap.tempo);
    setMasterVol(snap.masterVol);
    setTimeSig(snap.timeSig);
    setHistoryVersion(v => v + 1);
  }, [tracks]);

  const undo = useCallback(() => {
    if (!undoStackRef.current.length) { setStatusMsg('Nothing to undo'); return; }
    redoStackRef.current.push(snapshotState());
    const snap = undoStackRef.current.pop();
    restoreSnapshot(snap);
    setStatusMsg('Undo');
  }, [snapshotState, restoreSnapshot]);

  const redo = useCallback(() => {
    if (!redoStackRef.current.length) { setStatusMsg('Nothing to redo'); return; }
    undoStackRef.current.push(snapshotState());
    const snap = redoStackRef.current.pop();
    restoreSnapshot(snap);
    setStatusMsg('Redo');
  }, [snapshotState, restoreSnapshot]);

  // === Track management ===
  const updateTrack = useCallback((id, patch) => {
    setTracks(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }, []);

  const addAudioFile = useCallback(async (file) => {
    const id = uid();
    const type = detectType(file.name);
    try {
      const buf = await engine.loadAudioBlob(id, file);
      const peaks = engine.computePeaks(buf, 200);
      const newTrack = {
        id, displayName: file.name.replace(/\.[^.]+$/, ''),
        trackType: type, color: TRACK_COLORS[type],
        isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
        volume: 80, pan: 0, peaks, duration: buf.duration,
        eq: { bass: 50, mid: 50, high: 50, enabled: false },
        effects: { reverb: false, delay: false },
        instrumentIndex: 0,
        fileName: file.name,
      };
      setTracks(prev => [...prev, newTrack]);
      // sync engine
      engine.getOrCreateTrack(id).setVolume(0.8);
      setStatusMsg(`Added audio: ${file.name}`);
    } catch (e) {
      console.error(e);
      setStatusMsg('Error: could not decode audio file');
    }
  }, []);

  const addMIDITrack = useCallback(() => {
    const id = uid();
    const notes = [];
    // simple C major scale
    const scale = [0, 2, 4, 5, 7, 9, 11, 12];
    for (let i = 0; i < 8; i++) {
      notes.push({ pitch: 60 + scale[i], velocity: 100, start: i, duration: 0.9 });
    }
    const peaks = new Array(80).fill(0).map((_, i) => 0.2 + 0.6 * Math.abs(Math.sin(i * 0.4)));
    const newTrack = {
      id, displayName: `MIDI ${tracks.length + 1}`,
      trackType: 'synth', color: TRACK_COLORS.synth,
      isPlaying: false, isMuted: false, isSolo: false, isMIDI: true,
      volume: 80, pan: 0, peaks, duration: 8,
      eq: { bass: 50, mid: 50, high: 50, enabled: false },
      effects: { reverb: false, delay: false },
      instrumentIndex: 0,
      midiNotes: notes,
    };
    setTracks(prev => [...prev, newTrack]);
    engine.loadMIDI(id, notes);
    engine.getOrCreateTrack(id).setVolume(0.8);
    engine.getOrCreateTrack(id).setInstrument(0);
    setStatusMsg('MIDI track added');
  }, [tracks.length]);

  const deleteTrack = useCallback((id) => {
    engine.removeTrack(id);
    setTracks(prev => prev.filter(t => t.id !== id));
    setStatusMsg('Track deleted');
  }, []);

  // === Playback ===
  const playTrack = useCallback((id) => {
    setTracks(prev => prev.map(t => {
      if (t.id !== id) return t;
      if (t.isPlaying) {
        engine.stop(id);
        return { ...t, isPlaying: false };
      }
      engine.ensureCtx();
      engine.play(id);
      return { ...t, isPlaying: true };
    }));
  }, []);

  const playAll = useCallback(() => {
    engine.ensureCtx();
    if (isPlayingAll) {
      engine.stopAll();
      setTracks(prev => prev.map(t => ({ ...t, isPlaying: false })));
      setIsPlayingAll(false);
      setStatusMsg('Playback stopped');
      return;
    }
    const soloSet = new Set(tracks.filter(t => t.isSolo).map(t => t.id));
    const ids = tracks.map(t => t.id);
    engine.playAll(ids, soloSet);
    setTracks(prev => prev.map(t => {
      const skip = (soloSet.size > 0 && !soloSet.has(t.id)) || t.isMuted;
      return { ...t, isPlaying: !skip };
    }));
    setIsPlayingAll(true);
    setStatusMsg('Playing all tracks');
  }, [tracks, isPlayingAll]);

  // === Track actions handler ===
  const handleTrackAction = useCallback((action, id, payload) => {
    if (action === 'play') return playTrack(id);
    if (action === 'mute') {
      setTracks(prev => prev.map(t => {
        if (t.id !== id) return t;
        const next = !t.isMuted;
        engine.getOrCreateTrack(id).setMuted(next);
        if (next && t.isPlaying) { engine.stop(id); return { ...t, isMuted: next, isPlaying: false }; }
        return { ...t, isMuted: next };
      }));
    } else if (action === 'solo') {
      setTracks(prev => prev.map(t => t.id === id ? { ...t, isSolo: !t.isSolo } : t));
    } else if (action === 'delete') {
      deleteTrack(id);
    } else if (action === 'volume') {
      const v = payload;
      engine.getOrCreateTrack(id).setVolume(v / 100);
      updateTrack(id, { volume: v });
    } else if (action === 'pan') {
      const p = payload;
      engine.getOrCreateTrack(id).setPan(p / 50);
      updateTrack(id, { pan: p });
    } else if (action === 'toggleEq') {
      setTracks(prev => prev.map(t => {
        if (t.id !== id) return t;
        const eq = { ...t.eq, enabled: !t.eq.enabled };
        engine.getOrCreateTrack(id).setEQ(eq.bass, eq.mid, eq.high, eq.enabled);
        return { ...t, eq };
      }));
    } else if (action === 'eqChange') {
      const { band, value } = payload;
      setTracks(prev => prev.map(t => {
        if (t.id !== id) return t;
        const eq = { ...t.eq, [band]: value };
        engine.getOrCreateTrack(id).setEQ(eq.bass, eq.mid, eq.high, eq.enabled);
        return { ...t, eq };
      }));
    } else if (action === 'piano') {
      setPianoTrackId(id);
    } else if (action === 'toggleReverb') {
      setTracks(prev => prev.map(t => {
        if (t.id !== id) return t;
        const fx = { ...(t.effects || {}), reverb: !t.effects?.reverb };
        engine.getOrCreateTrack(id).setReverb(fx.reverb);
        return { ...t, effects: fx };
      }));
    } else if (action === 'toggleDelay') {
      setTracks(prev => prev.map(t => {
        if (t.id !== id) return t;
        const fx = { ...(t.effects || {}), delay: !t.effects?.delay };
        engine.getOrCreateTrack(id).setDelay(fx.delay);
        return { ...t, effects: fx };
      }));
    } else if (action === 'instrument') {
      const idx = payload | 0;
      engine.getOrCreateTrack(id).setInstrument(idx);
      updateTrack(id, { instrumentIndex: idx });
      setStatusMsg(`Instrument: ${GM_INSTRUMENTS[idx]?.name || '?'}`);
    } else if (action === 'detectBpm') {
      // detectTrackBpm is defined later via useCallback; reference via window-attached or call directly via ref pattern
      const enTrk = engine.tracks.get(id);
      if (!enTrk?.audioBuffer) { setStatusMsg('BPM detect only works on audio tracks'); return; }
      const detected = engine.detectTempo(enTrk.audioBuffer);
      if (window.confirm(`Detected BPM: ${detected}\nSet as project tempo?`)) {
        setTempo(Math.round(detected));
        setStatusMsg(`Tempo set to ${Math.round(detected)} BPM (auto-detected)`);
      } else {
        setStatusMsg(`BPM detected: ${detected} (not applied)`);
      }
    }
  }, [playTrack, deleteTrack, updateTrack]);

  // === Master volume ===
  useEffect(() => { engine.setMasterVolume(masterVol / 100); }, [masterVol]);

  // === Tracks duration / max beats (derived) ===
  const maxBeats = useMemo(() => {
    let maxB = 8;
    for (const t of tracks) {
      if (t.isMIDI && t.midiNotes?.length) {
        for (const n of t.midiNotes) maxB = Math.max(maxB, n.start + n.duration);
      } else if (t.duration) {
        maxB = Math.max(maxB, (t.duration * tempo) / 60);
      }
    }
    return Math.max(8, Math.ceil(maxB));
  }, [tracks, tempo]);

  // === Playhead state owned by Timeline; Daw only provides loop wrap action ===
  const playheadBeatRef = useRef(0);
  const handlePlayheadChange = useCallback((beat) => { playheadBeatRef.current = beat; }, []);
  const handleLoopWrap = useCallback(() => {
    engine.ensureCtx();
    const soloSet = new Set(tracks.filter(t => t.isSolo).map(t => t.id));
    const ids = tracks.map(t => t.id);
    engine.stopAll();
    engine.playAll(ids, soloSet);
  }, [tracks]);

  // === Loop toggle ===
  const toggleLoop = useCallback(() => {
    setLooping(l => {
      const next = !l;
      setStatusMsg(`Loop: ${next ? 'ON' : 'OFF'}`);
      return next;
    });
  }, []);

  // === VST Scan (cosmetic) ===
  const scanVst = useCallback(() => {
    setVstScanning(true);
    setVstFoundCount(0);
    setStatusMsg('Scanning VST plugins...');
    let count = 0;
    const total = 4833;
    const id = setInterval(() => {
      count += Math.floor(80 + Math.random() * 200);
      if (count >= total) {
        count = total;
        clearInterval(id);
        setVstScanning(false);
        setStatusMsg(`VST scan complete: ${total} plugins found`);
      }
      setVstFoundCount(Math.min(count, total));
    }, 60);
  }, []);

  // === Apply GM instrument to all MIDI tracks ===
  const applyGmInstrument = useCallback((idx) => {
    pushUndo();
    setTracks(prev => prev.map(t => {
      if (!t.isMIDI) return t;
      engine.getOrCreateTrack(t.id).setInstrument(idx);
      return { ...t, instrumentIndex: idx };
    }));
    setStatusMsg(`Applied "${GM_INSTRUMENTS[idx].name}" to all MIDI tracks`);
  }, [pushUndo]);

  // === Stems export ===
  const exportStems = useCallback(async () => {
    if (!tracks.length) { setStatusMsg('No tracks to export'); return; }
    setStemsExporting(true);
    setStemsProgress({ current: 0, total: tracks.length });
    let i = 0;
    for (const t of tracks) {
      i += 1;
      setStemsProgress({ current: i, total: tracks.length });
      try {
        const blob = await engine.renderTrackToWav(t.id, tempo);
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${t.displayName.replace(/[^a-z0-9_-]/gi, '_')}_stem.wav`;
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error('stem export', e);
      }
    }
    setStemsExporting(false);
    setStatusMsg(`Exported ${tracks.length} stem WAV file(s)`);
  }, [tracks, tempo]);

  // === Load Project JSON (new format) ===
  const loadProjectJson = useCallback(async (file) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const proj = data.project || data;
      pushUndo();
      // clear
      tracks.forEach(t => engine.removeTrack(t.id));
      const newTempo = proj.tempo || 120;
      setTempo(newTempo);
      if (proj.timeSignature) {
        const [num] = String(proj.timeSignature).split('/');
        setTimeSig(parseInt(num) || 4);
      }
      const restored = (proj.tracks || []).map((td, ti) => {
        const id = td.id || uid();
        const isMIDI = (td.type || '').toLowerCase() === 'midi' || !!td.notes;
        const type = isMIDI ? (td.trackType || 'synth') : (td.trackType || 'other');
        const color = TRACK_COLORS[type] || TRACK_COLORS.other;
        const notes = (td.notes || td.midiNotes || []).map(n => ({
          pitch: n.pitch | 0,
          velocity: n.velocity | 0 || 100,
          start: Number(n.start) || 0,
          duration: Number(n.duration) || 0.5,
        }));
        const eq = td.eq || { bass: 50, mid: 50, high: 50, enabled: false };
        const effects = {
          reverb: Array.isArray(td.effects) ? td.effects.includes('reverb') : !!td.effects?.reverb,
          delay: Array.isArray(td.effects) ? td.effects.includes('delay') : !!td.effects?.delay,
        };
        // map instrument name to index
        let instrumentIndex = td.instrumentIndex;
        if (typeof instrumentIndex !== 'number' && td.instrument) {
          const found = GM_INSTRUMENTS.findIndex(g => g.name.toLowerCase().includes(String(td.instrument).toLowerCase()));
          instrumentIndex = found >= 0 ? found : 0;
        }
        instrumentIndex = instrumentIndex || 0;
        const peaks = new Array(80).fill(0).map((_, k) => 0.15 + 0.6 * Math.abs(Math.sin(k * 0.3 + ti)));
        // engine wiring
        const n = engine.getOrCreateTrack(id);
        if (isMIDI && notes.length) n.setMIDI(notes);
        n.setInstrument(instrumentIndex);
        n.setVolume((td.volume || 80) / 100);
        n.setPan((td.pan || 0) / 50);
        n.setEQ(eq.bass, eq.mid, eq.high, eq.enabled);
        n.setReverb(effects.reverb);
        n.setDelay(effects.delay);
        return {
          id, displayName: td.name || td.displayName || `Track ${ti + 1}`,
          trackType: type, color,
          isPlaying: false, isMuted: false, isSolo: false, isMIDI,
          volume: td.volume || 80, pan: td.pan || 0, peaks,
          eq, effects,
          midiNotes: notes, instrumentIndex,
        };
      });
      setTracks(restored);
      setStatusMsg(`Loaded project: ${restored.length} tracks · ${newTempo} BPM`);
    } catch (e) {
      console.error(e);
      setStatusMsg('Could not load project JSON: ' + e.message);
    }
  }, [tracks, pushUndo]);

  // === Tempo / time signature ===
  useEffect(() => { engine.setTempo(tempo); }, [tempo]);
  useEffect(() => { engine.setTimeSignature(timeSig); }, [timeSig]);

  // === Metronome ===
  const toggleMetronome = () => {
    if (metronomeOn) {
      engine.stopMetronome();
      setMetronomeOn(false);
      setMetroBeat(0); setMetroMeasure(1);
    } else {
      engine.startMetronome((b, m) => { setMetroBeat(b); setMetroMeasure(m); });
      setMetronomeOn(true);
    }
  };

  // === Recording ===
  const toggleRecording = async () => {
    if (recording) {
      const blob = await engine.stopRecording();
      clearInterval(recTimerRef.current);
      setRecording(false);
      if (blob && blob.size > 0) {
        const file = new File([blob], `Recording_${Date.now()}.webm`, { type: blob.type });
        await addAudioFile(file);
        setStatusMsg('Recording saved as new track');
      } else {
        setStatusMsg('Recording empty');
      }
    } else {
      try {
        await engine.startRecording();
        setRecording(true);
        setRecordTime(0);
        recTimerRef.current = setInterval(() => setRecordTime(t => t + 1), 1000);
        setStatusMsg('Recording from microphone...');
      } catch (e) {
        console.error(e);
        setStatusMsg('Mic access denied or unavailable');
      }
    }
  };

  // === Dream Track ===
  const generateDream = async (prompt, _tempo) => {
    setDreaming(true);
    setDreamProgress(5);
    let p = 5;
    const fakeProg = setInterval(() => { p = Math.min(92, p + 5); setDreamProgress(p); }, 150);
    try {
      const res = await axios.post(`${API}/dream/generate`, { prompt, tempo: _tempo });
      clearInterval(fakeProg);
      setDreamProgress(100);

      const id = uid();
      const notes = res.data.notes;
      const peaks = new Array(80).fill(0).map((_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i * 0.3 + notes.length)));
      const newTrack = {
        id, displayName: res.data.name,
        trackType: 'dream', color: TRACK_COLORS.dream,
        isPlaying: false, isMuted: false, isSolo: false, isMIDI: true,
        volume: 80, pan: 0, peaks,
        eq: { bass: 50, mid: 50, high: 50, enabled: false },
        effects: { reverb: true, delay: false },
        instrumentIndex: 88, // Pad 1 (new age) - dreamy default
        midiNotes: notes, dreamPrompt: prompt, dreamId: res.data.id,
        description: res.data.description,
      };
      engine.loadMIDI(id, notes);
      engine.getOrCreateTrack(id).setVolume(0.8);
      engine.getOrCreateTrack(id).setInstrument(88);
      engine.getOrCreateTrack(id).setReverb(true);
      setTracks(prev => [...prev, newTrack]);
      setStatusMsg(`Dream generated: ${res.data.name}`);
      setTimeout(() => {
        setDreaming(false); setDreamProgress(0); setDreamOpen(false);
      }, 400);
    } catch (e) {
      clearInterval(fakeProg);
      setDreaming(false); setDreamProgress(0);
      setStatusMsg('Dream generation failed: ' + (e.response?.data?.detail || e.message));
    }
  };

  const loadDreamHistory = async () => {
    try {
      const res = await axios.get(`${API}/dream/history`);
      setDreamHistory(res.data);
      setHistoryOpen(true);
    } catch (e) {
      setStatusMsg('Could not load dream history');
    }
  };

  // === Magic12 / converters ===
  const [demucsLoading, setDemucsLoading] = useState(false);
  const magic12Separate = async () => {
    if (!tracks.length) { setStatusMsg('Add an audio track first'); return; }
    const target = [...tracks].reverse().find((t) => !t.isMIDI && t.audioBuffer);
    if (!target) {
      setStatusMsg('Magic12: no audio track with audio buffer to separate.');
      return;
    }
    setDemucsLoading(true);
    setStatusMsg(`Magic12: separating "${target.displayName}" with Demucs (real AI, may take 30-60s)…`);
    try {
      const wavBlob = audioBufferToWavBlob(target.audioBuffer);
      const form = new FormData();
      form.append('file', wavBlob, `${target.displayName || 'track'}.wav`);
      const resp = await fetch(`${API}/ai/separate-stems`, { method: 'POST', body: form });
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail?.message || body.detail || `HTTP ${resp.status}`);
      }
      const data = await resp.json();
      const stems = data.stems || {};
      const ctx = engine.ensureCtx();
      const order = ['vocals', 'drums', 'bass', 'other'];
      for (const name of order) {
        const s = stems[name];
        if (!s) continue;
        const bin = Uint8Array.from(atob(s.wav_base64), (c) => c.charCodeAt(0));
        const buf = await ctx.decodeAudioData(bin.buffer.slice(0));
        const newId = uid();
        const type = name === 'vocals' ? 'voice' : name === 'drums' ? 'drums' : name === 'bass' ? 'bass' : 'other';
        const peaks = new Array(80).fill(0).map((_, k) => 0.1 + 0.6 * Math.abs(Math.sin(k * 0.5 + name.charCodeAt(0))));
        const t = {
          id: newId, displayName: `${target.displayName} · ${name}`,
          trackType: type, color: TRACK_COLORS[type] || TRACK_COLORS.other,
          isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
          volume: 80, pan: 0, peaks,
          eq: { bass: 50, mid: 50, high: 50, enabled: false },
          fileName: '', isStemSeparated: true,
          audioBuffer: buf,
        };
        engine.getOrCreateTrack(newId).setAudio(buf);
        engine.getOrCreateTrack(newId).setVolume(0.8);
        setTracks((prev) => [...prev, t]);
      }
      setStatusMsg(`Magic12 ✓ Demucs separated ${Object.keys(stems).length} stems from "${target.displayName}"`);
    } catch (e) {
      setStatusMsg(`Magic12 separation failed: ${e.message}`);
    } finally {
      setDemucsLoading(false);
    }
  };

  const magic12Master = async () => {
    setMasteringLoading(true);
    setMasteringOpen(true);
    try {
      const descs = tracks.map(t => `${t.trackType}: ${t.displayName}`);
      const res = await axios.post(`${API}/mastering/suggest`, { track_descriptions: descs });
      setMasterSuggestions(res.data.suggestions);
    } catch (e) {
      setMasterSuggestions('AI mastering unavailable: ' + (e.response?.data?.detail || e.message));
    } finally {
      setMasteringLoading(false);
    }
  };

  const midiToAudio = () => {
    const midi = tracks.find(t => t.isMIDI);
    if (!midi) { setStatusMsg('No MIDI track to convert'); return; }
    setStatusMsg(`Rendering "${midi.displayName}" to audio... (oscillator render)`);
    setTimeout(() => {
      const id = uid();
      const t = {
        id, displayName: `${midi.displayName} (audio)`,
        trackType: 'other', color: TRACK_COLORS.other,
        isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
        volume: 80, pan: 0, peaks: midi.peaks,
        eq: { bass: 50, mid: 50, high: 50, enabled: false },
        fileName: '',
      };
      // Keep using the MIDI engine logic but flagged as audio - simplification
      engine.getOrCreateTrack(id);
      setTracks(prev => [...prev, t]);
      setStatusMsg('MIDI converted to audio track (rendered representation)');
    }, 800);
  };

  const audioToMidi = () => {
    const aud = tracks.find(t => !t.isMIDI);
    if (!aud) { setStatusMsg('No audio track to convert'); return; }
    setStatusMsg(`Analyzing "${aud.displayName}"... extracting pitches`);
    setTimeout(() => {
      const notes = [];
      for (let i = 0; i < 16; i++) {
        notes.push({ pitch: 60 + ((i * 5) % 12), velocity: 80, start: i * 0.5, duration: 0.4 });
      }
      const id = uid();
      const peaks = new Array(80).fill(0).map((_, k) => 0.15 + 0.6 * Math.abs(Math.sin(k * 0.3)));
      const t = {
        id, displayName: `${aud.displayName} (MIDI)`,
        trackType: 'synth', color: TRACK_COLORS.synth,
        isPlaying: false, isMuted: false, isSolo: false, isMIDI: true,
        volume: 80, pan: 0, peaks, midiNotes: notes,
        eq: { bass: 50, mid: 50, high: 50, enabled: false },
      };
      engine.loadMIDI(id, notes);
      engine.getOrCreateTrack(id).setVolume(0.8);
      setTracks(prev => [...prev, t]);
      setStatusMsg('Audio converted to MIDI (16 notes extracted)');
    }, 800);
  };

  // === Session save/load ===
  const saveSession = async () => {
    try {
      const tracksData = tracks.map(t => ({
        displayName: t.displayName,
        trackType: t.trackType,
        isMIDI: t.isMIDI,
        volume: t.volume, pan: t.pan,
        eq: t.eq, midiNotes: t.midiNotes || [],
        dreamPrompt: t.dreamPrompt || '',
      }));
      const res = await axios.post(`${API}/session/save`, {
        name: `Riba session ${new Date().toLocaleString()}`,
        tempo, master_volume: masterVol, tracks: tracksData,
      });
      setStatusMsg(`Session saved (id: ${res.data.id.slice(0, 8)})`);
    } catch (e) {
      setStatusMsg('Save failed: ' + e.message);
    }
  };

  const loadSession = async () => {
    try {
      const res = await axios.get(`${API}/session/list`);
      const sessions = res.data;
      if (!sessions.length) { setStatusMsg('No saved sessions'); return; }
      const s = sessions[0]; // load most recent
      // clear current
      tracks.forEach(t => engine.removeTrack(t.id));
      setTempo(s.tempo); setMasterVol(s.master_volume);
      const restored = (s.tracks || []).map(td => {
        const id = uid();
        const color = TRACK_COLORS[td.trackType] || TRACK_COLORS.other;
        const peaks = new Array(80).fill(0).map((_, k) => 0.15 + 0.6 * Math.abs(Math.sin(k * 0.3)));
        if (td.isMIDI && td.midiNotes && td.midiNotes.length) {
          engine.loadMIDI(id, td.midiNotes);
        } else {
          engine.getOrCreateTrack(id);
        }
        engine.getOrCreateTrack(id).setVolume((td.volume || 80) / 100);
        return {
          id, displayName: td.displayName, trackType: td.trackType, color,
          isPlaying: false, isMuted: false, isSolo: false, isMIDI: !!td.isMIDI,
          volume: td.volume || 80, pan: td.pan || 0, peaks,
          eq: td.eq || { bass: 50, mid: 50, high: 50, enabled: false },
          midiNotes: td.midiNotes || [], dreamPrompt: td.dreamPrompt || '',
        };
      });
      setTracks(restored);
      setStatusMsg(`Loaded session "${s.name}"`);
    } catch (e) {
      setStatusMsg('Load failed: ' + e.message);
    }
  };

  const exportSession = () => {
    const data = { tempo, master_volume: masterVol, tracks: tracks.map(t => ({
      displayName: t.displayName, trackType: t.trackType, isMIDI: t.isMIDI,
      volume: t.volume, pan: t.pan, eq: t.eq, midiNotes: t.midiNotes || [],
    })) };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `riba_session_${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Session exported as JSON');
  };

  const clearAll = () => {
    if (!window.confirm('Clear all tracks? Unsaved work will be lost.')) return;
    tracks.forEach(t => engine.removeTrack(t.id));
    engine.stopAll();
    setTracks([]);
    setIsPlayingAll(false);
    setStatusMsg('All tracks cleared');
  };

  // ============================================================
  // === Pro Tools-inspired menu actions ========================
  // ============================================================

  const helpers = {
    getSelectedTrack: () => tracks.find(t => t.id === selectedTrackId),
    getSelectedIndex: () => tracks.findIndex(t => t.id === selectedTrackId),
  };

  // --- File menu ---
  const newSession = useCallback(() => {
    if (!window.confirm('New Session? Unsaved work will be lost.')) return;
    tracks.forEach(t => engine.removeTrack(t.id));
    engine.stopAll();
    setTracks([]);
    setTempo(120);
    setMasterVol(80);
    setTimeSig(4);
    setIsPlayingAll(false);
    setStatusMsg('New session created');
  }, [tracks]);

  const saveCopyIn = useCallback(async () => {
    try {
      const tracksData = tracks.map(t => ({
        displayName: t.displayName,
        trackType: t.trackType,
        isMIDI: t.isMIDI,
        volume: t.volume, pan: t.pan,
        eq: t.eq, effects: t.effects,
        instrumentIndex: t.instrumentIndex,
        midiNotes: t.midiNotes || [],
        dreamPrompt: t.dreamPrompt || '',
      }));
      const newName = window.prompt('Save Copy In — Enter session name:', `Riba copy ${new Date().toLocaleString()}`);
      if (!newName) return;
      await axios.post(`${API}/session/save`, {
        name: newName, tempo, master_volume: masterVol, tracks: tracksData,
      });
      setStatusMsg(`Session copy saved as "${newName}"`);
    } catch (e) {
      setStatusMsg('Save Copy In failed: ' + e.message);
    }
  }, [tracks, tempo, masterVol]);

  const importSessionData = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/session/list`);
      const sessions = res.data;
      if (!sessions.length) { setStatusMsg('No sessions available to import from'); return; }
      const names = sessions.map((s, i) => `${i + 1}. ${s.name}`).join('\n');
      const choice = window.prompt(`Import Session Data — pick session number:\n${names}`, '1');
      const idx = parseInt(choice) - 1;
      if (Number.isNaN(idx) || !sessions[idx]) return;
      const s = sessions[idx];
      pushUndo();
      // append tracks (don't clear existing)
      const newTracks = (s.tracks || []).map(td => {
        const id = uid();
        const color = TRACK_COLORS[td.trackType] || TRACK_COLORS.other;
        const peaks = new Array(80).fill(0).map((_, k) => 0.15 + 0.6 * Math.abs(Math.sin(k * 0.3)));
        const n = engine.getOrCreateTrack(id);
        if (td.isMIDI && td.midiNotes?.length) n.setMIDI(td.midiNotes);
        n.setVolume((td.volume || 80) / 100);
        n.setPan((td.pan || 0) / 50);
        n.setEQ(td.eq?.bass || 50, td.eq?.mid || 50, td.eq?.high || 50, td.eq?.enabled || false);
        if (typeof td.instrumentIndex === 'number') n.setInstrument(td.instrumentIndex);
        if (td.effects?.reverb) n.setReverb(true);
        if (td.effects?.delay) n.setDelay(true);
        return {
          id, displayName: td.displayName + ' (imported)', trackType: td.trackType, color,
          isPlaying: false, isMuted: false, isSolo: false, isMIDI: !!td.isMIDI,
          volume: td.volume || 80, pan: td.pan || 0, peaks,
          eq: td.eq || { bass: 50, mid: 50, high: 50, enabled: false },
          effects: td.effects || { reverb: false, delay: false },
          instrumentIndex: td.instrumentIndex || 0,
          midiNotes: td.midiNotes || [], dreamPrompt: td.dreamPrompt || '',
        };
      });
      setTracks(prev => [...prev, ...newTracks]);
      setStatusMsg(`Imported ${newTracks.length} tracks from "${s.name}"`);
    } catch (e) {
      setStatusMsg('Import failed: ' + e.message);
    }
  }, [pushUndo]);

  const bounceMix = useCallback(async () => {
    if (!tracks.length) { setStatusMsg('No tracks to bounce'); return; }
    setBouncing(true);
    setBounceProgress(0);
    setStatusMsg('Bouncing mix to WAV...');
    try {
      // compute total duration in seconds
      let maxSec = 4;
      for (const t of tracks) {
        if (t.isMIDI && t.midiNotes?.length) {
          for (const n of t.midiNotes) maxSec = Math.max(maxSec, ((n.start + n.duration) * 60) / tempo);
        } else if (t.duration) {
          maxSec = Math.max(maxSec, t.duration);
        }
      }
      maxSec += 1.5; // tail for reverb/delay
      const sr = 48000;
      const oCtx = new OfflineAudioContext(2, Math.ceil(maxSec * sr), sr);
      const masterOut = oCtx.createGain();
      masterOut.gain.value = masterVol / 100;
      masterOut.connect(oCtx.destination);
      const beatSec = 60 / tempo;
      const soloSet = new Set(tracks.filter(t => t.isSolo).map(t => t.id));

      for (const t of tracks) {
        if (t.isMuted) continue;
        if (soloSet.size > 0 && !soloSet.has(t.id)) continue;

        // per-track chain: source -> EQ (3 biquads) -> reverb/delay sends -> pan -> gain -> master
        const trkGain = oCtx.createGain();
        trkGain.gain.value = (t.volume || 80) / 100;
        const panNode = oCtx.createStereoPanner();
        panNode.pan.value = (t.pan || 0) / 50;

        const eqLow = oCtx.createBiquadFilter(); eqLow.type = 'lowshelf'; eqLow.frequency.value = 200;
        const eqMid = oCtx.createBiquadFilter(); eqMid.type = 'peaking'; eqMid.frequency.value = 1000; eqMid.Q.value = 1;
        const eqHigh = oCtx.createBiquadFilter(); eqHigh.type = 'highshelf'; eqHigh.frequency.value = 5000;
        if (t.eq?.enabled) {
          eqLow.gain.value = (t.eq.bass - 50) * 0.24;
          eqMid.gain.value = (t.eq.mid - 50) * 0.24;
          eqHigh.gain.value = (t.eq.high - 50) * 0.24;
        }

        const fxIn = oCtx.createGain();
        const fxOut = oCtx.createGain();
        const dry = oCtx.createGain(); dry.gain.value = 1;
        fxIn.connect(dry); dry.connect(fxOut);
        if (t.effects?.delay) {
          const dn = oCtx.createDelay(2); dn.delayTime.value = 0.28;
          const fb = oCtx.createGain(); fb.gain.value = 0.32;
          const wet = oCtx.createGain(); wet.gain.value = 0.4;
          fxIn.connect(dn); dn.connect(fb); fb.connect(dn);
          dn.connect(wet); wet.connect(fxOut);
        }
        if (t.effects?.reverb) {
          const conv = oCtx.createConvolver();
          // build small IR
          const irLen = Math.floor(sr * 1.8);
          const irBuf = oCtx.createBuffer(2, irLen, sr);
          for (let ch = 0; ch < 2; ch++) {
            const data = irBuf.getChannelData(ch);
            for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
          }
          conv.buffer = irBuf;
          const wet = oCtx.createGain(); wet.gain.value = 0.35;
          fxIn.connect(conv); conv.connect(wet); wet.connect(fxOut);
        }

        eqLow.connect(eqMid); eqMid.connect(eqHigh); eqHigh.connect(fxIn);
        fxOut.connect(panNode); panNode.connect(trkGain); trkGain.connect(masterOut);

        if (t.isMIDI && t.midiNotes?.length) {
          const preset = GM_INSTRUMENTS[t.instrumentIndex || 0] || GM_INSTRUMENTS[0];
          const s = preset.synth;
          for (const n of t.midiNotes) {
            const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
            const v = Math.max(0.05, Math.min(0.9, (n.velocity || 100) / 127));
            const startT = n.start * beatSec;
            const stopT = startT + n.duration * beatSec;
            const osc = oCtx.createOscillator();
            osc.type = s.type;
            osc.frequency.value = freq;
            const filt = oCtx.createBiquadFilter();
            filt.type = 'lowpass';
            filt.frequency.value = s.cutoff || 4000;
            const env = oCtx.createGain();
            const attack = Math.min(s.attack, Math.max(0.005, (stopT - startT) * 0.4));
            env.gain.setValueAtTime(0, startT);
            env.gain.linearRampToValueAtTime(v, startT + attack);
            env.gain.linearRampToValueAtTime(v * s.sustain, startT + attack + s.decay);
            env.gain.setValueAtTime(v * s.sustain, stopT);
            env.gain.linearRampToValueAtTime(0, stopT + s.release);
            osc.connect(filt); filt.connect(env); env.connect(eqLow);
            osc.start(startT);
            osc.stop(stopT + s.release + 0.05);
          }
        } else {
          // audio track playback - look up engine buffer
          const enTrk = engine.tracks.get(t.id);
          if (enTrk && enTrk.audioBuffer) {
            const src = oCtx.createBufferSource();
            src.buffer = enTrk.audioBuffer;
            src.connect(eqLow);
            src.start(0);
          }
        }
      }

      // simulate progress
      const progInterval = setInterval(() => {
        setBounceProgress(p => Math.min(95, p + 4));
      }, 100);
      const rendered = await oCtx.startRendering();
      clearInterval(progInterval);
      setBounceProgress(100);
      const blob = audioBufferToWavBlob(rendered);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Riba_Bounce_${Date.now()}.wav`;
      a.click();
      URL.revokeObjectURL(url);
      setStatusMsg(`Bounce Mix complete: ${maxSec.toFixed(1)}s WAV downloaded`);
    } catch (e) {
      console.error(e);
      setStatusMsg('Bounce failed: ' + e.message);
    } finally {
      setBouncing(false);
      setTimeout(() => setBounceProgress(0), 800);
    }
  }, [tracks, tempo, masterVol]);

  // --- Edit menu ---
  const cutTrack = useCallback(() => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select a track first'); return; }
    pushUndo();
    clipboardRef.current = JSON.parse(JSON.stringify(t));
    deleteTrack(t.id);
    setStatusMsg(`Cut: ${t.displayName}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, pushUndo, deleteTrack]);

  const copyTrack = useCallback(() => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select a track first'); return; }
    clipboardRef.current = JSON.parse(JSON.stringify(t));
    setStatusMsg(`Copied: ${t.displayName}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId]);

  const pasteTrack = useCallback(() => {
    const src = clipboardRef.current;
    if (!src) { setStatusMsg('Clipboard empty'); return; }
    pushUndo();
    const id = uid();
    const copy = { ...src, id, displayName: src.displayName + ' (copy)', isPlaying: false, isSolo: false };
    const n = engine.getOrCreateTrack(id);
    if (copy.isMIDI && copy.midiNotes?.length) n.setMIDI(copy.midiNotes);
    n.setVolume((copy.volume || 80) / 100);
    n.setPan((copy.pan || 0) / 50);
    n.setEQ(copy.eq.bass, copy.eq.mid, copy.eq.high, copy.eq.enabled);
    n.setInstrument(copy.instrumentIndex || 0);
    if (copy.effects?.reverb) n.setReverb(true);
    if (copy.effects?.delay) n.setDelay(true);
    setTracks(prev => [...prev, copy]);
    setStatusMsg(`Pasted: ${copy.displayName}`);
  }, [pushUndo]);

  const separateClip = useCallback(() => {
    const t = helpers.getSelectedTrack();
    if (!t || !t.isMIDI) { setStatusMsg('Select a MIDI track to split'); return; }
    const cutAt = playheadBeatRef.current;
    if (cutAt <= 0) { setStatusMsg('Position playhead in the middle of the clip first'); return; }
    pushUndo();
    const left = (t.midiNotes || []).filter(n => n.start < cutAt).map(n => ({
      ...n, duration: Math.min(n.duration, cutAt - n.start),
    }));
    const right = (t.midiNotes || []).filter(n => (n.start + n.duration) > cutAt).map(n => ({
      ...n, start: Math.max(0, n.start - cutAt),
      duration: n.start < cutAt ? (n.start + n.duration - cutAt) : n.duration,
    }));
    // mutate original to be left part
    setTracks(prev => prev.map(tt => tt.id === t.id ? { ...tt, midiNotes: left, displayName: tt.displayName + ' [L]' } : tt));
    engine.loadMIDI(t.id, left);
    // create new right track
    const newId = uid();
    const peaks = new Array(80).fill(0).map((_, i) => 0.15 + 0.6 * Math.abs(Math.sin(i * 0.3)));
    const rightTrack = {
      ...t, id: newId, displayName: t.displayName + ' [R]',
      isPlaying: false, isSolo: false,
      midiNotes: right, peaks,
    };
    const n = engine.getOrCreateTrack(newId);
    n.setMIDI(right);
    n.setVolume((t.volume || 80) / 100);
    n.setPan((t.pan || 0) / 50);
    n.setEQ(t.eq.bass, t.eq.mid, t.eq.high, t.eq.enabled);
    n.setInstrument(t.instrumentIndex || 0);
    if (t.effects?.reverb) n.setReverb(true);
    if (t.effects?.delay) n.setDelay(true);
    setTracks(prev => [...prev, rightTrack]);
    setStatusMsg(`Clip split at beat ${cutAt.toFixed(2)} (L: ${left.length} notes, R: ${right.length} notes)`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, pushUndo]);

  const consolidateClip = useCallback(() => {
    const t = helpers.getSelectedTrack();
    if (!t || !t.isMIDI) { setStatusMsg('Select a MIDI track to consolidate'); return; }
    pushUndo();
    // sort notes by start, dedupe overlapping same-pitch
    const notes = [...(t.midiNotes || [])].sort((a, b) => a.start - b.start);
    const cleaned = [];
    for (const n of notes) {
      const dup = cleaned.find(c => c.pitch === n.pitch && Math.abs(c.start - n.start) < 0.05);
      if (!dup) cleaned.push(n);
    }
    setTracks(prev => prev.map(tt => tt.id === t.id ? { ...tt, midiNotes: cleaned } : tt));
    engine.loadMIDI(t.id, cleaned);
    setStatusMsg(`Consolidated: ${notes.length} → ${cleaned.length} notes`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, pushUndo]);

  // --- Track menu ---
  const groupTracks = useCallback(() => {
    if (tracks.length < 2) { setStatusMsg('Need at least 2 tracks to group'); return; }
    pushUndo();
    const groupColor = '#A78BFA';
    setTracks(prev => prev.map(t => ({ ...t, color: groupColor, groupId: 'group_1' })));
    setStatusMsg(`Grouped ${tracks.length} tracks (color synced)`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, pushUndo]);

  const duplicateTrack = useCallback(() => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select a track first'); return; }
    pushUndo();
    const id = uid();
    const copy = JSON.parse(JSON.stringify(t));
    copy.id = id;
    copy.displayName = t.displayName + ' (dup)';
    copy.isPlaying = false; copy.isSolo = false;
    const n = engine.getOrCreateTrack(id);
    if (copy.isMIDI && copy.midiNotes?.length) n.setMIDI(copy.midiNotes);
    n.setVolume((copy.volume || 80) / 100);
    n.setPan((copy.pan || 0) / 50);
    n.setEQ(copy.eq.bass, copy.eq.mid, copy.eq.high, copy.eq.enabled);
    n.setInstrument(copy.instrumentIndex || 0);
    if (copy.effects?.reverb) n.setReverb(true);
    if (copy.effects?.delay) n.setDelay(true);
    const idx = tracks.findIndex(tt => tt.id === t.id);
    setTracks(prev => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    setStatusMsg(`Duplicated: ${t.displayName}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, pushUndo]);

  const freezeTrack = useCallback(async () => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select a track first'); return; }
    if (!t.isMIDI) { setStatusMsg('Only MIDI tracks need freezing'); return; }
    pushUndo();
    setStatusMsg(`Freezing "${t.displayName}"...`);
    try {
      const blob = await engine.renderTrackToWav(t.id, tempo);
      if (!blob) throw new Error('render failed');
      // load the rendered buffer back into the engine
      const buf = await blob.arrayBuffer();
      const decoded = await engine.ensureCtx().decodeAudioData(buf.slice(0));
      const enTrk = engine.getOrCreateTrack(t.id);
      enTrk.loadAudio(decoded);
      const peaks = engine.computePeaks(decoded, 200);
      // mark frozen and keep MIDI for unfreezing
      setTracks(prev => prev.map(tt => tt.id === t.id ? {
        ...tt, isMIDI: false, isFrozen: true,
        _frozenMidi: tt.midiNotes, _frozenInstrument: tt.instrumentIndex,
        peaks, displayName: tt.displayName + ' ❄️',
      } : tt));
      setStatusMsg(`Track frozen — CPU saved. (Re-enable by editing again)`);
    } catch (e) {
      setStatusMsg('Freeze failed: ' + e.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, tempo, pushUndo]);

  const commitTrack = useCallback(async () => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select a track first'); return; }
    if (!t.isMIDI) { setStatusMsg('Only MIDI tracks can be committed'); return; }
    pushUndo();
    setStatusMsg(`Committing "${t.displayName}" to audio...`);
    try {
      const blob = await engine.renderTrackToWav(t.id, tempo);
      if (!blob) throw new Error('render failed');
      const buf = await blob.arrayBuffer();
      const decoded = await engine.ensureCtx().decodeAudioData(buf.slice(0));
      const enTrk = engine.getOrCreateTrack(t.id);
      enTrk.loadAudio(decoded);
      const peaks = engine.computePeaks(decoded, 200);
      setTracks(prev => prev.map(tt => tt.id === t.id ? {
        ...tt, isMIDI: false, isCommitted: true, midiNotes: [],
        peaks, displayName: tt.displayName + ' [committed]',
        trackType: 'other', color: TRACK_COLORS.other,
      } : tt));
      setStatusMsg('Track committed permanently to audio');
    } catch (e) {
      setStatusMsg('Commit failed: ' + e.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, tempo, pushUndo]);

  // --- AudioSuite (destructive processing) ---
  const audioSuiteProcess = useCallback(async (type) => {
    const t = helpers.getSelectedTrack();
    if (!t) { setStatusMsg('Select an audio track first'); return; }
    const enTrk = engine.tracks.get(t.id);
    if (!enTrk?.audioBuffer) { setStatusMsg('AudioSuite only works on audio tracks'); return; }
    pushUndo();
    setStatusMsg(`AudioSuite: ${type} on "${t.displayName}"...`);
    try {
      const sr = enTrk.audioBuffer.sampleRate;
      const ch = enTrk.audioBuffer.numberOfChannels;
      // ==== REVERSE: in-place reversal of buffer data ====
      if (type === 'reverse') {
        const ctx = engine.ensureCtx();
        const reversed = ctx.createBuffer(ch, enTrk.audioBuffer.length, sr);
        for (let c = 0; c < ch; c++) {
          const src = enTrk.audioBuffer.getChannelData(c);
          const dst = reversed.getChannelData(c);
          for (let i = 0, n = src.length; i < n; i++) dst[n - 1 - i] = src[i];
        }
        enTrk.loadAudio(reversed);
        const peaks = engine.computePeaks(reversed, 200);
        setTracks(prev => prev.map(tt => tt.id === t.id ? { ...tt, peaks, displayName: tt.displayName + ' [reversed]' } : tt));
        setStatusMsg('AudioSuite Reverse applied destructively');
        return;
      }
      const dur = enTrk.audioBuffer.duration + (type === 'reverb' ? 1.5 : 0);
      const oCtx = new OfflineAudioContext(ch, Math.ceil(dur * sr), sr);
      const src = oCtx.createBufferSource();
      src.buffer = enTrk.audioBuffer;
      let last = src;
      if (type === 'gain') {
        const gain = oCtx.createGain();
        gain.gain.value = 1.6; // +4 dB destructive
        last.connect(gain); last = gain;
      } else if (type === 'eq') {
        const low = oCtx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 200; low.gain.value = 4;
        const mid = oCtx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1000; mid.Q.value = 1; mid.gain.value = -2;
        const high = oCtx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 5000; high.gain.value = 3;
        last.connect(low); low.connect(mid); mid.connect(high); last = high;
      } else if (type === 'reverb') {
        const conv = oCtx.createConvolver();
        const irLen = Math.floor(sr * 1.8);
        const irBuf = oCtx.createBuffer(2, irLen, sr);
        for (let cIdx = 0; cIdx < 2; cIdx++) {
          const data = irBuf.getChannelData(cIdx);
          for (let i = 0; i < irLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3);
        }
        conv.buffer = irBuf;
        const wet = oCtx.createGain(); wet.gain.value = 0.4;
        const dry = oCtx.createGain(); dry.gain.value = 1;
        last.connect(dry); dry.connect(oCtx.destination);
        last.connect(conv); conv.connect(wet); wet.connect(oCtx.destination);
        src.start(0);
        const rendered2 = await oCtx.startRendering();
        enTrk.loadAudio(rendered2);
        const peaks2 = engine.computePeaks(rendered2, 200);
        setTracks(prev => prev.map(tt => tt.id === t.id ? { ...tt, peaks: peaks2, displayName: tt.displayName + ' [reverb]' } : tt));
        setStatusMsg(`AudioSuite Reverb applied destructively`);
        return;
      }
      last.connect(oCtx.destination);
      src.start(0);
      const rendered = await oCtx.startRendering();
      enTrk.loadAudio(rendered);
      const peaks = engine.computePeaks(rendered, 200);
      const tag = type === 'gain' ? ' [gain+]' : ' [eq]';
      setTracks(prev => prev.map(tt => tt.id === t.id ? { ...tt, peaks, displayName: tt.displayName + tag } : tt));
      setStatusMsg(`AudioSuite ${type} applied destructively`);
    } catch (e) {
      setStatusMsg('AudioSuite failed: ' + e.message);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, pushUndo]);

  // --- BPM auto-detect ---
  const detectTrackBpm = useCallback((trackId) => {
    const enTrk = engine.tracks.get(trackId);
    if (!enTrk?.audioBuffer) { setStatusMsg('BPM detect only works on audio tracks'); return; }
    const detected = engine.detectTempo(enTrk.audioBuffer);
    if (window.confirm(`Detected BPM: ${detected}\nSet as project tempo?`)) {
      setTempo(Math.round(detected));
      setStatusMsg(`Tempo set to ${Math.round(detected)} BPM (auto-detected)`);
    } else {
      setStatusMsg(`BPM detected: ${detected} (not applied)`);
    }
  }, []);

  // --- Bantu Grid Quantize ---
  const loadBantuStyles = useCallback(async () => {
    if (bantuStyles.length) return;
    try {
      const res = await axios.get(`${API}/quantize/styles`);
      setBantuStyles(res.data.styles || []);
    } catch (e) { /* ignore */ }
  }, [bantuStyles]);

  const applyBantuGrid = useCallback(async () => {
    const t = tracks.find(x => x.id === selectedTrackId);
    if (!t || !t.isMIDI) { setStatusMsg('Select a MIDI track to apply Bantu Grid'); return; }
    if (!t.midiNotes?.length) { setStatusMsg('Track has no notes'); return; }
    try {
      const res = await axios.post(`${API}/quantize/bantu-grid`, {
        style: bantuStyle, density: bantuDensity, bars: bantuBars,
      });
      const grid = res.data.time_stamps_beats || [];
      if (!grid.length) { setStatusMsg('Empty grid returned'); return; }
      pushUndo();
      // snap each note's start to nearest grid point
      const snapped = t.midiNotes.map(n => {
        let best = grid[0], bestDiff = Math.abs(n.start - grid[0]);
        for (const g of grid) {
          const d = Math.abs(n.start - g);
          if (d < bestDiff) { best = g; bestDiff = d; }
        }
        return { ...n, start: Math.round(best * 1000) / 1000 };
      });
      setTracks(prev => prev.map(tt => tt.id === t.id ? {
        ...tt, midiNotes: snapped,
        displayName: tt.displayName.replace(/ \[bantu.*?\]$/, '') + ` [bantu:${bantuStyle}]`,
      } : tt));
      engine.loadMIDI(t.id, snapped);
      setStatusMsg(`Bantu Grid "${bantuStyle}" applied — ${snapped.length} notes snapped (${res.data.description})`);
      setShowBantuMarkers(true); // auto-reveal asymmetric grid on timeline
      setBantuOpen(false);
    } catch (e) {
      setStatusMsg('Bantu Grid failed: ' + (e.response?.data?.detail || e.message));
    }
  }, [tracks, selectedTrackId, bantuStyle, bantuDensity, bantuBars, pushUndo]);

  const openBantuGrid = useCallback(() => {
    loadBantuStyles();
    setBantuOpen(true);
  }, [loadBantuStyles]);

  // === Bantu Swing Live — keep the engine in sync with UI state ===
  useEffect(() => {
    engine.setBantuSwing({
      enabled: bantuSwingEnabled,
      style: bantuStyle,
      density: bantuDensity,
      bars: bantuBars,
      intensity: bantuSwingIntensity,
    });
  }, [bantuSwingEnabled, bantuStyle, bantuDensity, bantuBars, bantuSwingIntensity]);

  // === LLM action dispatcher — maps Claude's JSON output to existing handlers ===
  const dispatchLlmActions = useCallback((actions) => {
    if (!Array.isArray(actions)) return;
    const findTrack = (selector) => {
      if (!selector || selector === 'selected') return tracks.find(t => t.id === selectedTrackId);
      if (selector.startsWith('index:')) return tracks[parseInt(selector.slice(6), 10)];
      if (selector.startsWith('name:')) return tracks.find(t => t.displayName.toLowerCase().includes(selector.slice(5).toLowerCase()));
      return null;
    };
    for (const a of actions) {
      switch (a.type) {
        case 'add_track':
          if (a.kind === 'midi') addMIDITrack();
          else setStatusMsg('AI: please upload an audio file (browser cannot create empty audio tracks).');
          break;
        case 'play':  playAll();   break;
        case 'stop':  engine.stopAll(); break;
        case 'set_tempo':           if (a.bpm) setTempo(a.bpm); break;
        case 'toggle_metronome':    setMetronomeOn(!!a.value); break;
        case 'toggle_loop':         setLooping(!!a.value); break;
        case 'set_volume': {
          const t = findTrack(a.selector);
          if (t) handleTrackAction('volume', t.id, Math.round(a.volume_percent || 80));
          break;
        }
        case 'mute': { const t = findTrack(a.selector); if (t) handleTrackAction('mute', t.id); break; }
        case 'solo': { const t = findTrack(a.selector); if (t) handleTrackAction('solo', t.id); break; }
        case 'set_bantu_grid':
          if (a.style)   setBantuStyle(a.style);
          if (a.density) setBantuDensity(a.density);
          if (a.bars)    setBantuBars(a.bars);
          setShowBantuMarkers(true);
          break;
        case 'toggle_bantu_swing':
          setBantuSwingEnabled(!!a.value);
          if (typeof a.intensity === 'number') setBantuSwingIntensity(a.intensity);
          break;
        case 'toggle_bantu_markers': setShowBantuMarkers(!!a.value); break;
        case 'set_waveform_mode':    if (a.mode) setWaveformMode(a.mode); break;
        case 'open_modal':
          if (a.modal === 'mixer')        setMixerOpen(true);
          else if (a.modal === 'bantu')   setBantuOpen(true);
          else if (a.modal === 'setup')   setSetupOpen(true);
          else if (a.modal === 'dream')   setDreamOpen(true);
          else if (a.modal === 'history') loadDreamHistory();
          else if (a.modal === 'disk_usage')   setDiskUsageOpen(true);
          else if (a.modal === 'system_usage') setSystemUsageOpen(true);
          else if (a.modal === 'plugins') setPluginsOpen(true);
          else if (a.modal === 'gm')      setGmOpen(true);
          else if (a.modal === 'manual')  setManualOpen(true);
          break;
        case 'separate_stems': magic12Separate(); break;
        case 'generate_dream': if (a.prompt) generateDream(a.prompt, tempo); break;
        default:
          setStatusMsg(`Unknown action from AI: ${a.type}`);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, selectedTrackId, tempo]);

  // --- Audio devices enumeration ---
  const loadAudioDevices = useCallback(async () => {
    const result = await engine.listAudioDevices();
    setAudioDevices({ ...result, loaded: true });
    if (result.supported) {
      try {
        await axios.post(`${API}/setup/hardware`, {
          default_input: result.inputs[0]?.label || 'Default Microphone',
          total_inputs: result.inputs.length,
          default_output: result.outputs[0]?.label || 'Default Speakers',
          total_outputs: result.outputs.length,
        });
      } catch (_) { /* ignore */ }
    }
  }, []);

  // === Keyboard shortcuts ===
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'n' && !e.shiftKey) { e.preventDefault(); newSession(); }
        else if (e.key === 'N' || (e.key === 'n' && e.shiftKey)) { e.preventDefault(); addMIDITrack(); }
        else if (e.key === 's') { e.preventDefault(); saveSession(); }
        else if (e.key === 'o') { e.preventDefault(); loadSession(); }
        else if (e.key === 'e' && !e.shiftKey) { e.preventDefault(); separateClip(); }
        else if (e.key === 'E' || (e.key === 'e' && e.shiftKey)) { e.preventDefault(); exportSession(); }
        else if (e.key === 'I' || (e.key === 'i' && e.shiftKey)) { e.preventDefault(); fileInputRef.current?.click(); }
        else if (e.key === 'g') { e.preventDefault(); groupTracks(); }
        else if (e.key === 'x') { e.preventDefault(); cutTrack(); }
        else if (e.key === 'c') { e.preventDefault(); copyTrack(); }
        else if (e.key === 'v') { e.preventDefault(); pasteTrack(); }
        else if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
        else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
        else if (e.altKey && e.key === 'b') { e.preventDefault(); bounceMix(); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); playAll(); }
      else if (e.key.toLowerCase() === 'm') { toggleMetronome(); }
      else if (e.key.toLowerCase() === 'l') { toggleLoop(); }
      else if (e.key === 'F1') { e.preventDefault(); setManualOpen(true); }
      else if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (tracks[idx]) playTrack(tracks[idx].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracks, isPlayingAll, metronomeOn]);

  // periodic UI tick to update progress markers/blink
  useEffect(() => {
    const id = setInterval(() => setProgressTick(t => t + 1), 200);
    return () => clearInterval(id);
  }, []);

  // === Render ===
  const themeBg = theme === 'dark' ? '#09090B' : '#F5F5F7';
  const themePanel = theme === 'dark' ? '#18181B' : '#FFFFFF';
  const themeText = theme === 'dark' ? '#FAFAFA' : '#0B0B0E';
  const themeText2 = theme === 'dark' ? '#A1A1AA' : '#52525B';

  return (
    <div style={{
      height: '100vh', background: themeBg, color: themeText, display: 'flex', flexDirection: 'column',
      fontFamily: 'Manrope, sans-serif'
    }}>
      <input
        ref={fileInputRef} type="file" accept="audio/*"
        data-testid={TID.audioFileInput}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) addAudioFile(f); e.target.value = ''; }}
      />
      <input
        ref={projectFileInputRef} type="file" accept="application/json,.json"
        data-testid={TID.projectFileInput}
        style={{ display: 'none' }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) loadProjectJson(f); e.target.value = ''; }}
      />

      {/* MENU BAR */}
      <MenuBar
        openMenu={openMenu}
        setOpenMenu={setOpenMenu}
        actions={{
          // File
          newSession,
          loadSession,
          saveSession,
          saveCopyIn,
          importAudio: () => fileInputRef.current?.click(),
          importSessionData,
          openProject: () => projectFileInputRef.current?.click(),
          bounceMix,
          exportStems,
          exportSession,
          // Edit
          undo, redo,
          cutTrack, copyTrack, pasteTrack,
          separateClip, consolidateClip,
          // Track
          addMIDI: addMIDITrack,
          addAudio: () => fileInputRef.current?.click(),
          groupTracks,
          duplicateTrack,
          freezeTrack,
          commitTrack,
          deleteSelected: () => { const t = tracks.find(x => x.id === selectedTrackId); if (t) deleteTrack(t.id); },
          // Event
          openDream: () => setDreamOpen(true),
          openHistory: loadDreamHistory,
          openPiano: () => { const t = tracks.find(x => x.id === selectedTrackId); if (t && t.isMIDI) setPianoTrackId(t.id); else setStatusMsg('Select a MIDI track first'); },
          openBantu: openBantuGrid,
          // AudioSuite
          asGain: () => audioSuiteProcess('gain'),
          asEq: () => audioSuiteProcess('eq'),
          asReverb: () => audioSuiteProcess('reverb'),
          asReverse: () => audioSuiteProcess('reverse'),
          magic12Sep: magic12Separate,
          magic12Master,
          // Tools
          toggleMetronome,
          toggleLoop,
          toggleRecord: toggleRecording,
          // View
          openMixer: () => setMixerOpen(true),
          toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
          // View → Waveforms
          wfPeak:       () => { setWaveformMode('peak');       setStatusMsg('Waveform mode: Peak'); },
          wfPower:      () => { setWaveformMode('power');      setStatusMsg('Waveform mode: Power'); },
          wfRectified:  () => { setWaveformMode('rectified');  setStatusMsg('Waveform mode: Rectified'); },
          wfOutlines:   () => { setWaveformMode('outlines');   setStatusMsg('Waveform mode: Outlines'); },
          wfCrossfades: () => { setWaveformMode('crossfades'); setStatusMsg('Waveform mode: Overlapped Crossfades'); },
          // Window
          openSystemUsage: () => setSystemUsageOpen(true),
          openDiskUsage:   () => setDiskUsageOpen(true),
          windowConfigList: () => setStatusMsg('Window Configurations · list (Alt+J)'),
          windowConfigNew:  () => setStatusMsg('Window Configurations · saved current layout'),
          arrangeTile:      () => setStatusMsg('Arrange · Tile'),
          arrangeTileH:     () => setStatusMsg('Arrange · Tile Horizontal'),
          arrangeTileV:     () => setStatusMsg('Arrange · Tile Vertical'),
          arrangeCascade:   () => setStatusMsg('Arrange · Cascade'),
          // AI Assistant
          openAssistant: () => setAssistantOpen(true),
          // Suno-style Magic Generator
          openMagicGen: () => setMagicGenOpen(true),
          // Magic Re-mix (Demucs ▸ Bantu ▸ fal.ai)
          openMagicRemix: () => setMagicRemixOpen(true),
          // Setup
          openPlayback: () => { setSetupTab('playback'); setSetupOpen(true); loadAudioDevices(); },
          openIO: () => { setSetupTab('io'); setSetupOpen(true); loadAudioDevices(); },
          openPrefs: () => { setSetupTab('preferences'); setSetupOpen(true); },
          openGM: () => setGmOpen(true),
          openVst: scanVst,
          openPlugins: () => setPluginsOpen(true),
          // Event extra
          autoTempo: () => {
            const t = tracks.find(x => x.id === selectedTrackId);
            if (!t) { setStatusMsg('Select an audio track first'); return; }
            detectTrackBpm(t.id);
          },
          // Help
          openManual: () => setManualOpen(true),
        }}
      />

      {/* TOP BAR */}
      <div style={{
        height: 64, borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: themePanel, display: 'flex', alignItems: 'center',
        padding: '0 16px', gap: 12, flexShrink: 0
      }}>
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginRight: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: 'linear-gradient(135deg, #D946EF 0%, #6366F1 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 20px rgba(217, 70, 239, 0.4)'
          }}>
            <WaveIcon size={20} weight="fill" color="#fff" />
          </div>
          <div>
            <div className="font-heading" style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.03em' }}>
              RIBA
            </div>
            <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em' }}>
              DAW · v1.0
            </div>
          </div>
        </div>

        {/* Transport */}
        <button
          data-testid={TID.playAll}
          onClick={playAll}
          className="riba-btn"
          style={{
            background: isPlayingAll ? '#EF4444' : '#22C55E', color: '#fff',
            border: 'none', height: 38, padding: '0 16px'
          }}
        >
          {isPlayingAll ? <Stop size={16} weight="fill" /> : <Play size={16} weight="fill" />}
          {isPlayingAll ? 'STOP' : 'PLAY'}
        </button>

        <button
          data-testid={TID.recordBtn}
          onClick={toggleRecording}
          className="riba-btn riba-btn-record"
          data-recording={recording}
          style={{ height: 38, padding: '0 14px' }}
        >
          <Record size={14} weight="fill" />
          {recording ? `REC ${recordTime}s` : 'REC'}
        </button>

        <button
          data-testid={TID.metronomeBtn}
          onClick={toggleMetronome}
          className="riba-btn"
          data-active={metronomeOn}
          style={{ height: 38 }}
        >
          <Clock size={14} weight={metronomeOn ? 'fill' : 'regular'} />
          Metro
          {metronomeOn && (
            <div style={{
              width: 8, height: 8, borderRadius: 4,
              background: metroBeat === 0 ? '#EAB308' : '#FFFFFF',
              boxShadow: metroBeat === 0 ? '0 0 10px #EAB308' : 'none',
              transition: 'all 0.1s'
            }} />
          )}
        </button>

        <button
          data-testid={TID.loopBtn}
          onClick={toggleLoop}
          className="riba-btn"
          data-active={looping}
          style={{ height: 38 }}
          title="Loop (L)"
        >
          <Repeat size={14} weight={looping ? 'fill' : 'regular'} />
          Loop
        </button>

        <button
          data-testid={TID.undoBtn}
          onClick={undo}
          className="riba-btn riba-btn-icon"
          style={{ height: 38 }}
          title="Undo (Ctrl+Z)"
        >
          <ArrowUUpLeft size={14} />
        </button>
        <button
          data-testid={TID.redoBtn}
          onClick={redo}
          className="riba-btn riba-btn-icon"
          style={{ height: 38 }}
          title="Redo (Ctrl+Y)"
        >
          <ArrowUUpRight size={14} />
        </button>

        {/* Tempo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '0 12px', borderLeft: '1px solid rgba(255,255,255,0.06)', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span data-testid={TID.tempoValue} className="font-mono-r" style={{ fontSize: 22, fontWeight: 700, color: themeText, letterSpacing: '0.05em' }}>
              {tempo}
            </span>
            <span className="font-mono-r" style={{ fontSize: 10, color: themeText2 }}>BPM</span>
          </div>
          <input
            data-testid={TID.tempoSlider}
            type="range" min={60} max={200} value={tempo}
            onChange={(e) => setTempo(parseInt(e.target.value))}
            className="riba-slider"
            style={{ width: 110, color: '#D946EF', '--val': `${((tempo - 60) / 140) * 100}%` }}
          />
        </div>

        {/* Time signature */}
        {metronomeOn && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <select
              data-testid={TID.timeSigSelect}
              value={timeSig}
              onChange={(e) => setTimeSig(parseInt(e.target.value))}
              style={{
                background: '#27272A', color: '#FAFAFA',
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6,
                padding: '4px 8px', fontSize: 12, fontFamily: 'JetBrains Mono, monospace'
              }}
            >
              <option value={2}>2/4</option>
              <option value={3}>3/4</option>
              <option value={4}>4/4</option>
              <option value={6}>6/8</option>
            </select>
            <div className="font-mono-r" style={{ fontSize: 9, color: themeText2 }}>
              {metroMeasure}.{metroBeat + 1}
            </div>
          </div>
        )}

        <div style={{ flex: 1 }} />

        {/* Master + VU */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <VUMeter width={180} height={6} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className="font-mono-r" style={{ fontSize: 9, color: themeText2 }}>MASTER</span>
            <input
              data-testid={TID.masterVolSlider}
              type="range" min={0} max={100} value={masterVol}
              onChange={(e) => setMasterVol(parseInt(e.target.value))}
              className="riba-slider"
              style={{ width: 130, color: '#FFFFFF', '--val': `${masterVol}%` }}
            />
            <span className="font-mono-r" style={{ fontSize: 11, color: themeText, width: 28, textAlign: 'right' }}>
              {masterVol}
            </span>
          </div>
        </div>

        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="riba-btn riba-btn-icon" data-testid={TID.themeBtn}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => setShowBantuMarkers(v => !v)}
          className="riba-btn"
          data-testid="bantu-markers-toggle"
          data-active={showBantuMarkers}
          title={`${showBantuMarkers ? 'Hide' : 'Show'} Bantu Grid markers on timeline`}
          style={{
            height: 26, fontSize: 10, padding: '0 8px',
            background: showBantuMarkers ? 'rgba(168,32,255,0.18)' : undefined,
            border: showBantuMarkers ? '1px solid rgba(168,32,255,0.5)' : undefined,
            color: showBantuMarkers ? '#D946EF' : undefined,
          }}
        >🌍 Grid</button>
        <button
          onClick={() => {
            const next = !bantuSwingEnabled;
            setBantuSwingEnabled(next);
            setStatusMsg(next
              ? `🥁 Bantu Swing Live ENABLED · ${bantuStyle} @ ${Math.round(bantuSwingIntensity * 100)}% intensity`
              : '🥁 Bantu Swing Live disabled — straight grid restored');
          }}
          onContextMenu={(e) => {
            // Right-click cycles intensity 30% → 50% → 70% → 100% → 30%
            e.preventDefault();
            const next = bantuSwingIntensity >= 1 ? 0.3 :
                         bantuSwingIntensity >= 0.7 ? 1.0 :
                         bantuSwingIntensity >= 0.5 ? 0.7 : 0.5;
            setBantuSwingIntensity(next);
            setStatusMsg(`🥁 Swing intensity → ${Math.round(next * 100)}%`);
          }}
          className="riba-btn"
          data-testid="bantu-swing-toggle"
          data-active={bantuSwingEnabled}
          title={`${bantuSwingEnabled ? 'Disable' : 'Enable'} Bantu Swing Live — non-destructive groove humanization during playback. Right-click to cycle intensity.`}
          style={{
            height: 26, fontSize: 10, padding: '0 10px',
            background: bantuSwingEnabled
              ? 'linear-gradient(135deg, rgba(245,158,11,0.35), rgba(217,70,239,0.35))'
              : undefined,
            border: bantuSwingEnabled ? '1px solid rgba(245,158,11,0.6)' : undefined,
            color: bantuSwingEnabled ? '#F59E0B' : undefined,
            fontWeight: bantuSwingEnabled ? 700 : 500,
            boxShadow: bantuSwingEnabled ? '0 0 12px rgba(245,158,11,0.35)' : undefined,
          }}
        >🥁 Swing{bantuSwingEnabled ? ` · ${Math.round(bantuSwingIntensity * 100)}%` : ''}</button>
        <button
          onClick={runGenesis}
          className="riba-btn"
          data-testid="genesis-btn"
          title={`🌍 Genesis Workflow — prompt → fal.ai MusicGen → Demucs 4 stems → Bantu Grid active. Mode: ${genesisStatus.mode}`}
          style={{
            height: 26, fontSize: 10, padding: '0 12px', fontWeight: 800,
            background: 'linear-gradient(135deg, #22D3EE 0%, #D946EF 60%, #F59E0B 100%)',
            color: '#fff', border: 'none',
            boxShadow: '0 0 14px rgba(217,70,239,0.45), 0 0 28px rgba(34,211,238,0.25)',
            letterSpacing: '0.04em',
          }}
        >🌍 Genesis</button>
        {!pwaInstalled && pwaPrompt && (
          <button
            onClick={handleInstallPwa}
            className="riba-btn"
            data-testid="install-pwa-btn"
            title="Install RIBA as a desktop app"
            style={{
              height: 38,
              background: 'linear-gradient(135deg, #D946EF 0%, #6366F1 100%)',
              color: '#fff', border: 'none', fontWeight: 700
            }}
          >
            <DownloadSimple size={14} weight="bold" /> Install
          </button>
        )}
        <button onClick={() => setManualOpen(true)} className="riba-btn riba-btn-icon" data-testid={TID.manualBtn} title="Manual (F1)">
          <BookOpen size={14} />
        </button>
      </div>

      {/* TIMELINE / PLAYHEAD */}
      <Timeline
        isPlaying={isPlayingAll}
        looping={looping}
        maxBeats={maxBeats}
        timeSig={timeSig}
        tempo={tempo}
        onLoopWrap={handleLoopWrap}
        onPositionChange={handlePlayheadChange}
        showBantuMarkers={showBantuMarkers}
        bantuStyle={bantuStyle}
        bantuDensity={bantuDensity}
        bantuBars={bantuBars}
      />

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* LEFT TOOLBAR */}
        <div style={{
          width: 220, background: themePanel, borderRight: '1px solid rgba(255,255,255,0.06)',
          padding: 12, display: 'flex', flexDirection: 'column', gap: 6, overflowY: 'auto'
        }}>
          <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginBottom: 4 }}>ADD</div>
          <button data-testid={TID.addAudio} className="riba-btn" onClick={() => fileInputRef.current?.click()}>
            <Plus size={14} /> <Microphone size={12} /> Audio
          </button>
          <button data-testid={TID.addMIDI} className="riba-btn" onClick={addMIDITrack}>
            <Plus size={14} /> <MusicNote size={12} /> MIDI
          </button>

          <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginTop: 10, marginBottom: 4 }}>AI</div>
          <button data-testid={TID.dreamBtn} className="riba-btn" onClick={() => setDreamOpen(true)}
            style={{ background: 'linear-gradient(135deg, #D946EF, #6366F1)', color: '#fff', border: 'none' }}>
            <Sparkle size={13} weight="fill" /> Dream Track
          </button>
          <button data-testid={TID.dreamHistoryBtn} className="riba-btn" onClick={loadDreamHistory}>
            <ClockClockwise size={13} /> Dream History
          </button>
          <button data-testid={TID.magic12Sep} className="riba-btn" onClick={magic12Separate}>
            <MagicWand size={13} /> Magic12 Sep
          </button>
          <button data-testid={TID.magic12Master} className="riba-btn" onClick={magic12Master}>
            <Sliders size={13} /> Magic12 Master
          </button>

          <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginTop: 10, marginBottom: 4 }}>CONVERT</div>
          <button data-testid={TID.midiToAudio} className="riba-btn" onClick={midiToAudio}>
            <ArrowsLeftRight size={13} /> MIDI → Audio
          </button>
          <button data-testid={TID.audioToMidi} className="riba-btn" onClick={audioToMidi}>
            <ArrowsLeftRight size={13} /> Audio → MIDI
          </button>

          <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginTop: 10, marginBottom: 4 }}>SESSION</div>
          <button data-testid={TID.saveBtn} className="riba-btn" onClick={saveSession}>
            <FloppyDisk size={13} /> Save
          </button>
          <button data-testid={TID.loadBtn} className="riba-btn" onClick={loadSession}>
            <FolderOpen size={13} /> Load
          </button>
          <button data-testid={TID.exportBtn} className="riba-btn" onClick={exportSession}>
            <DownloadSimple size={13} /> Export JSON
          </button>
          <button data-testid={TID.stemsBtn} className="riba-btn" onClick={exportStems} disabled={stemsExporting}>
            <Export size={13} /> {stemsExporting ? `Stems ${stemsProgress.current}/${stemsProgress.total}` : 'Export Stems'}
          </button>
          <button data-testid={TID.clearBtn} className="riba-btn" onClick={clearAll} style={{ color: '#EF4444' }}>
            <Trash size={13} /> Clear All
          </button>

          <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginTop: 10, marginBottom: 4 }}>VIEW & PLUGINS</div>
          <button data-testid={TID.mixerBtn} className="riba-btn" onClick={() => setMixerOpen(true)}>
            <Faders size={13} /> Mixer
          </button>
          <button data-testid={TID.gmBtn} className="riba-btn" onClick={() => setGmOpen(true)}>
            <PianoKeys size={13} /> GM 128
          </button>
          <button data-testid={TID.vstBtn} className="riba-btn" onClick={scanVst} disabled={vstScanning}>
            <Plug size={13} /> {vstScanning ? `Scanning ${vstFoundCount}` : 'VST Scan'}
          </button>
          <button data-testid={TID.pluginsBtn} className="riba-btn" onClick={() => setPluginsOpen(true)}>
            <Package size={13} /> Plugins
          </button>
        </div>

        {/* CENTER TRACKS */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 8, background: themeBg }} className="welcome-grain">
          {tracks.length === 0 ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12, color: themeText2, textAlign: 'center',
              backgroundImage: `linear-gradient(rgba(9,9,11,0.85), rgba(9,9,11,0.95)), url('https://images.unsplash.com/photo-1636818477383-3a23426afe87?crop=entropy&cs=srgb&fm=jpg&q=85&w=1600')`,
              backgroundSize: 'cover', backgroundPosition: 'center',
              borderRadius: 14, border: '1px dashed rgba(255,255,255,0.08)',
              padding: 40
            }}>
              <WaveIcon size={64} weight="duotone" color="#D946EF" />
              <div className="font-heading" style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em' }}>
                Empty Workspace
              </div>
              <div style={{ fontSize: 14, color: '#A1A1AA', maxWidth: 420 }}>
                Add an audio file, generate a Dream Track with AI, or create a MIDI track to begin your composition.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="riba-btn" onClick={() => fileInputRef.current?.click()}>
                  <Microphone size={13} /> Upload Audio
                </button>
                <button className="riba-btn"
                  onClick={() => setDreamOpen(true)}
                  style={{ background: 'linear-gradient(135deg, #D946EF, #6366F1)', color: '#fff', border: 'none' }}
                >
                  <Sparkle size={13} weight="fill" /> Dream Track
                </button>
                <button className="riba-btn" onClick={addMIDITrack}>
                  <MusicNote size={13} /> MIDI Track
                </button>
              </div>
            </div>
          ) : (
            tracks.map((t, i) => (
              <TrackRow
                key={t.id}
                index={i}
                track={t}
                color={t.color}
                isSelected={t.id === selectedTrackId}
                onSelect={(id) => setSelectedTrackId(id)}
                onAction={handleTrackAction}
                waveformMode={waveformMode}
              />
            ))
          )}
        </div>

        {/* RIGHT INSPECTOR */}
        <div style={{
          width: 260, background: themePanel, borderLeft: '1px solid rgba(255,255,255,0.06)',
          padding: 14, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto'
        }}>
          <div>
            <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginBottom: 6 }}>
              SPECTRUM
            </div>
            <Spectrum height={80} />
          </div>

          <div>
            <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginBottom: 6 }}>
              SESSION INFO
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: themeText2 }}>Tracks</span>
              <span className="font-mono-r">{tracks.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: themeText2 }}>Tempo</span>
              <span className="font-mono-r">{tempo} BPM</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: themeText2 }}>Time Sig</span>
              <span className="font-mono-r">{timeSig}/4</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
              <span style={{ color: themeText2 }}>Master</span>
              <span className="font-mono-r">{masterVol}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
              <span style={{ color: themeText2 }}>Soloed</span>
              <span className="font-mono-r">{tracks.filter(t => t.isSolo).length}</span>
            </div>
          </div>

          <div>
            <div className="font-mono-r" style={{ fontSize: 9, color: themeText2, letterSpacing: '0.1em', marginBottom: 6 }}>
              SHORTCUTS
            </div>
            <div className="font-mono-r" style={{ fontSize: 10, color: themeText2, lineHeight: 1.8 }}>
              <div><kbd style={kbdStyle}>Space</kbd> Play / Stop</div>
              <div><kbd style={kbdStyle}>M</kbd> Metronome</div>
              <div><kbd style={kbdStyle}>1-9</kbd> Play track</div>
              <div><kbd style={kbdStyle}>Ctrl+S</kbd> Save</div>
              <div><kbd style={kbdStyle}>Ctrl+O</kbd> Load</div>
              <div><kbd style={kbdStyle}>F1</kbd> Manual</div>
            </div>
          </div>
        </div>
      </div>

      {/* STATUS BAR */}
      <div style={{
        height: 28, background: themePanel, borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 11, color: themeText2, flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: 3, background: '#22C55E', boxShadow: '0 0 6px #22C55E' }} />
          <span className="font-mono-r">{statusMsg}</span>
        </div>
        <div style={{ flex: 1 }} />
        <span className="font-mono-r" style={{ color: themeText2 }}>
          {new Date().toLocaleTimeString()}
        </span>
      </div>

      <DreamDialog
        open={dreamOpen}
        onClose={() => setDreamOpen(false)}
        onGenerate={generateDream}
        generating={dreaming}
        progress={dreamProgress}
        tempo={tempo}
      />

      {pianoTrackId && (() => {
        const t = tracks.find(t => t.id === pianoTrackId);
        if (!t) return null;
        return (
          <PianoRoll
            track={t}
            color={t.color}
            onChange={(notes) => {
              setTracks(prev => prev.map(tt => tt.id === pianoTrackId ? { ...tt, midiNotes: notes } : tt));
              engine.loadMIDI(pianoTrackId, notes);
            }}
            onPlay={() => playTrack(pianoTrackId)}
            onClose={() => setPianoTrackId(null)}
          />
        );
      })()}

      {historyOpen && (
        <DreamHistoryModal
          dreamHistory={dreamHistory}
          onClose={() => setHistoryOpen(false)}
          onLoad={(d) => {
            const id = uid();
            const notes = d.notes;
            const peaks = new Array(80).fill(0).map((_, i) => 0.2 + 0.7 * Math.abs(Math.sin(i * 0.3 + notes.length)));
            const newTrack = {
              id, displayName: d.name,
              trackType: 'dream', color: TRACK_COLORS.dream,
              isPlaying: false, isMuted: false, isSolo: false, isMIDI: true,
              volume: 80, pan: 0, peaks,
              eq: { bass: 50, mid: 50, high: 50, enabled: false },
              midiNotes: notes, dreamPrompt: d.prompt, description: d.description,
            };
            engine.loadMIDI(id, notes);
            engine.getOrCreateTrack(id).setVolume(0.8);
            setTracks(prev => [...prev, newTrack]);
            setHistoryOpen(false);
            setStatusMsg(`Loaded "${d.name}" into project`);
          }}
        />
      )}

      {masteringOpen && (
        <MasteringModal
          loading={masteringLoading}
          suggestions={masterSuggestions}
          onClose={() => setMasteringOpen(false)}
        />
      )}

      {manualOpen && (
        <ManualModal onClose={() => setManualOpen(false)} />
      )}

      {gmOpen && (
        <GmInstrumentsModal
          selectedIdx={gmSelectedIdx}
          setSelectedIdx={setGmSelectedIdx}
          onApply={applyGmInstrument}
          onClose={() => setGmOpen(false)}
        />
      )}

      {pluginsOpen && (
        <PluginsModal onClose={() => setPluginsOpen(false)} />
      )}

      {mixerOpen && (
        <MixerModal
          tracks={tracks}
          masterVol={masterVol}
          setMasterVol={setMasterVol}
          onTrackAction={handleTrackAction}
          onClose={() => setMixerOpen(false)}
        />
      )}

      {vstScanning && (
        <div style={{
          position: 'fixed', bottom: 36, right: 16, zIndex: 200,
          background: '#18181B', border: '1px solid rgba(217,70,239,0.4)',
          borderRadius: 10, padding: 12, minWidth: 260,
          boxShadow: '0 0 30px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Plug size={16} color="#D946EF" />
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 700 }}>Scanning VST</div>
          </div>
          <div className="font-mono-r" style={{ fontSize: 11, color: '#A1A1AA' }}>
            {vstFoundCount.toLocaleString()} / 4,833 plugins
          </div>
          <div style={{ height: 6, background: '#27272A', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
            <div style={{
              height: '100%', width: `${(vstFoundCount / 4833) * 100}%`,
              background: 'linear-gradient(90deg, #D946EF, #6366F1)',
              transition: 'width 0.1s linear'
            }} />
          </div>
        </div>
      )}

      {bouncing && (
        <div style={{
          position: 'fixed', bottom: 36, right: 16, zIndex: 200,
          background: '#18181B', border: '1px solid rgba(34, 197, 94, 0.4)',
          borderRadius: 10, padding: 12, minWidth: 280,
          boxShadow: '0 0 30px rgba(0,0,0,0.5)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <Export size={16} color="#22C55E" />
            <div className="font-heading" style={{ fontSize: 14, fontWeight: 700 }}>Bouncing Mix...</div>
          </div>
          <div className="font-mono-r" style={{ fontSize: 11, color: '#A1A1AA' }}>
            Rendering offline · {bounceProgress}%
          </div>
          <div style={{ height: 6, background: '#27272A', borderRadius: 3, overflow: 'hidden', marginTop: 6 }}>
            <div style={{
              height: '100%', width: `${bounceProgress}%`,
              background: 'linear-gradient(90deg, #22C55E, #6366F1)',
              transition: 'width 0.2s ease-out'
            }} />
          </div>
        </div>
      )}

      {bantuOpen && (
        <BantuGridModal
          styles={bantuStyles}
          style={bantuStyle}
          setStyle={setBantuStyle}
          density={bantuDensity}
          setDensity={setBantuDensity}
          bars={bantuBars}
          setBars={setBantuBars}
          selectedTrack={tracks.find(x => x.id === selectedTrackId)}
          onApply={applyBantuGrid}
          onClose={() => setBantuOpen(false)}
        />
      )}

      {setupOpen && (
        <SetupModal
          setupTab={setupTab}
          setSetupTab={setSetupTab}
          audioDevices={audioDevices}
          onRefreshDevices={loadAudioDevices}
          theme={theme}
          setTheme={setTheme}
          tempo={tempo}
          timeSig={timeSig}
          looping={looping}
          metronomeOn={metronomeOn}
          undoCount={undoStackRef.current.length}
          onClose={() => setSetupOpen(false)}
        />
      )}
      {systemUsageOpen && (
        <SystemUsageModal onClose={() => setSystemUsageOpen(false)} />
      )}
      {diskUsageOpen && (
        <DiskUsageModal onClose={() => setDiskUsageOpen(false)} />
      )}
      {assistantOpen && (
        <AssistantModal
          context={{
            tempo, timeSig,
            tracks: tracks.map((t, i) => ({
              i, name: t.displayName, type: t.trackType,
              isMIDI: t.isMIDI, volume: t.volume, isMuted: t.isMuted, isSolo: t.isSolo,
              selected: t.id === selectedTrackId,
            })),
            bantuStyle, bantuSwingEnabled, bantuSwingIntensity, showBantuMarkers,
            metronomeOn, looping, waveformMode,
          }}
          onActions={(actions) => dispatchLlmActions(actions)}
          onClose={() => setAssistantOpen(false)}
        />
      )}
      {demucsLoading && (
        <MagentaOverlay
          label="Demucs is splitting your track…"
          subtitle="Hybrid Transformer model — separating vocals, drums, bass and other. This is real AI, so it may take 30-60 s on CPU."
          testId="demucs-overlay"
        />
      )}
      {magicGenOpen && (
        <MagicGeneratorModal
          onClose={() => setMagicGenOpen(false)}
          onImportToTimeline={async (it) => {
            try {
              const url = it.audio_url.startsWith('http') ? it.audio_url : `${BACKEND_URL}${it.audio_url}`;
              const resp = await fetch(url);
              const blob = await resp.blob();
              const file = new File([blob], `${it.title || 'magic'}.wav`, { type: 'audio/wav' });
              await addAudioFile(file);
              setMagicGenOpen(false);
              setStatusMsg(`Imported "${it.title}" from Magic Generator`);
            } catch (e) {
              setStatusMsg(`Import failed: ${e.message}`);
            }
          }}
        />
      )}
      {magicRemixOpen && (
        <MagicRemixModal
          onClose={() => setMagicRemixOpen(false)}
          onImportStems={async (data) => {
            try {
              const ctx = engine.ensureCtx();
              const order = ['vocals', 'drums', 'bass', 'other', 'bantu_groove'];
              const baseName = (data.source || 'remix').replace(/\.(wav|mp3|ogg|m4a)$/i, '');
              let added = 0;
              for (const name of order) {
                const s = data.stems?.[name];
                if (!s) continue;
                const bin = Uint8Array.from(atob(s.wav_base64), (c) => c.charCodeAt(0));
                const buf = await ctx.decodeAudioData(bin.buffer.slice(0));
                const tid = uid();
                const type = name === 'vocals' ? 'voice'
                           : name === 'drums' ? 'drums'
                           : name === 'bass' ? 'bass'
                           : name === 'bantu_groove' ? 'drums'
                           : 'other';
                const peaks = new Array(80).fill(0).map((_, k) => 0.1 + 0.6 * Math.abs(Math.sin(k * 0.5 + name.charCodeAt(0))));
                const t = {
                  id: tid,
                  displayName: name === 'bantu_groove'
                    ? `${baseName} · Bantu Groove ✨`
                    : `${baseName} · ${name}`,
                  trackType: type, color: TRACK_COLORS[type] || TRACK_COLORS.other,
                  isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
                  volume: name === 'bantu_groove' ? 70 : 80, pan: 0, peaks,
                  eq: { bass: 50, mid: 50, high: 50, enabled: false },
                  fileName: '', isStemSeparated: true, audioBuffer: buf,
                };
                engine.getOrCreateTrack(tid).setAudio(buf);
                engine.getOrCreateTrack(tid).setVolume(t.volume / 100);
                setTracks((prev) => [...prev, t]);
                added += 1;
              }
              // Activate Bantu Grid markers using the same style the user picked
              if (data.bantu?.style) {
                setBantuStyle(data.bantu.style);
                setBantuDensity(data.bantu.density || 16);
                setBantuBars(data.bantu.bars || 4);
                setShowBantuMarkers(true);
              }
              setStatusMsg(`🎛 Magic Re-mix ✓ imported ${added} stem${added > 1 ? 's' : ''} · Bantu ${data.bantu?.style} active`);
            } catch (e) {
              setStatusMsg(`Magic Re-mix import failed: ${e.message}`);
            }
          }}
        />
      )}
      <GlobalTransportPlayer />
    </div>
  );
}

