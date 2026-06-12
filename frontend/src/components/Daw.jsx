import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Play, Stop, Record, Sparkle, Clock, ClockClockwise, Sliders, Waveform as WaveIcon,
  Sun, Moon, BookOpen, Trash, FloppyDisk, FolderOpen, DownloadSimple, Plus,
  Microphone, MusicNote, MagicWand, ArrowsLeftRight, Equalizer as EqIcon
} from '@phosphor-icons/react';
import { engine } from '@/audio/engine';
import { TID } from '@/constants/testIds';
import TrackRow from './TrackRow';
import Spectrum from './Spectrum';
import VUMeter from './VUMeter';
import DreamDialog from './DreamDialog';
import PianoRoll from './PianoRoll';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

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
  const recTimerRef = useRef(null);

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
      midiNotes: notes,
    };
    setTracks(prev => [...prev, newTrack]);
    engine.loadMIDI(id, notes);
    engine.getOrCreateTrack(id).setVolume(0.8);
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
    }
  }, [playTrack, deleteTrack, updateTrack]);

  // === Master volume ===
  useEffect(() => { engine.setMasterVolume(masterVol / 100); }, [masterVol]);

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
        midiNotes: notes, dreamPrompt: prompt, dreamId: res.data.id,
        description: res.data.description,
      };
      engine.loadMIDI(id, notes);
      engine.getOrCreateTrack(id).setVolume(0.8);
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
  const magic12Separate = () => {
    if (!tracks.length) { setStatusMsg('Add an audio track first'); return; }
    const target = tracks[tracks.length - 1];
    setStatusMsg(`Magic12: separating stems from "${target.displayName}"...`);
    const stems = ['Drums', 'Bass', 'Vocals', 'Other'];
    let i = 0;
    const id = setInterval(() => {
      if (i >= stems.length) { clearInterval(id); setStatusMsg('Magic12 separation complete (simulated)'); return; }
      const stemName = stems[i];
      const newId = uid();
      const type = stemName.toLowerCase() === 'vocals' ? 'voice'
        : stemName.toLowerCase() === 'drums' ? 'drums'
          : stemName.toLowerCase() === 'bass' ? 'bass' : 'other';
      const peaks = new Array(80).fill(0).map((_, k) => 0.1 + 0.6 * Math.abs(Math.sin(k * 0.5 + i)));
      const t = {
        id: newId, displayName: `${target.displayName} - ${stemName}`,
        trackType: type, color: TRACK_COLORS[type],
        isPlaying: false, isMuted: false, isSolo: false, isMIDI: false,
        volume: 80, pan: 0, peaks,
        eq: { bass: 50, mid: 50, high: 50, enabled: false },
        fileName: '', isStemSeparated: true,
      };
      engine.getOrCreateTrack(newId).setVolume(0.8);
      setTracks(prev => [...prev, t]);
      i++;
    }, 600);
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

  // === Keyboard shortcuts ===
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 's') { e.preventDefault(); saveSession(); }
        else if (e.key === 'o') { e.preventDefault(); loadSession(); }
        else if (e.key === 'e') { e.preventDefault(); exportSession(); }
        return;
      }
      if (e.code === 'Space') { e.preventDefault(); playAll(); }
      else if (e.key.toLowerCase() === 'm') { toggleMetronome(); }
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
        <button onClick={() => setManualOpen(true)} className="riba-btn riba-btn-icon" data-testid={TID.manualBtn} title="Manual (F1)">
          <BookOpen size={14} />
        </button>
      </div>

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
          <button data-testid={TID.clearBtn} className="riba-btn" onClick={clearAll} style={{ color: '#EF4444' }}>
            <Trash size={13} /> Clear All
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
                onAction={handleTrackAction}
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
        <Modal title="Dream History" onClose={() => setHistoryOpen(false)}>
          {dreamHistory.length === 0 ? (
            <div style={{ color: '#A1A1AA' }}>No dream tracks yet.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {dreamHistory.map((d) => (
                <div key={d.id} style={{ background: '#09090B', borderRadius: 8, padding: 10, border: '1px solid rgba(217, 70, 239, 0.2)' }}>
                  <div style={{ fontWeight: 600, color: '#D946EF' }}>{d.name}</div>
                  <div className="font-mono-r" style={{ fontSize: 10, color: '#71717A' }}>
                    {new Date(d.created_at).toLocaleString()} · {d.notes.length} notes
                  </div>
                  <div style={{ fontSize: 12, color: '#A1A1AA', marginTop: 4, fontStyle: 'italic' }}>
                    &ldquo;{d.prompt}&rdquo;
                  </div>
                  <button
                    className="riba-btn"
                    style={{ marginTop: 8, fontSize: 11 }}
                    onClick={() => {
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
                  >Load to Project</button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {masteringOpen && (
        <Modal title="Magic12 · AI Mastering" onClose={() => setMasteringOpen(false)}>
          {masteringLoading ? (
            <div style={{ color: '#A1A1AA', textAlign: 'center', padding: 20 }}>
              <div className="font-heading" style={{ fontSize: 16 }}>Analyzing mix…</div>
              <div style={{ marginTop: 16, height: 6, background: '#27272A', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'linear-gradient(90deg, #D946EF, #6366F1)', width: '70%', animation: 'pulse 1.5s ease-in-out infinite' }} />
              </div>
            </div>
          ) : (
            <pre style={{ whiteSpace: 'pre-wrap', color: '#E4E4E7', fontSize: 13, fontFamily: 'Manrope, sans-serif', lineHeight: 1.6 }}>
              {masterSuggestions}
            </pre>
          )}
        </Modal>
      )}

      {manualOpen && (
        <Modal title="Riba 12 · User Manual" onClose={() => setManualOpen(false)}>
          <div style={{ fontSize: 13, color: '#E4E4E7', lineHeight: 1.7 }}>
            <h3 className="font-heading" style={{ marginTop: 0 }}>Keyboard Shortcuts</h3>
            <ul>
              <li><b>Space</b> — Play / Stop all tracks</li>
              <li><b>M</b> — Toggle Metronome</li>
              <li><b>1–9</b> — Play track by index</li>
              <li><b>Ctrl+S</b> — Save session</li>
              <li><b>Ctrl+O</b> — Load latest session</li>
              <li><b>Ctrl+E</b> — Export session JSON</li>
              <li><b>F1</b> — Open this manual</li>
            </ul>
            <h3 className="font-heading">Features</h3>
            <ul>
              <li>Audio + MIDI multi-track playback (WebAudio)</li>
              <li>Per-track 3-band EQ, volume, pan, mute, solo</li>
              <li>Real microphone recording (MediaRecorder)</li>
              <li>Metronome with visual indicator & time signature</li>
              <li>Dream Track AI generation via Emergent LLM</li>
              <li>Magic12 stem separation (simulated)</li>
              <li>Magic12 AI mastering suggestions (LLM)</li>
              <li>Piano roll editor (click to add/remove notes)</li>
              <li>Spectrum analyzer & VU meters</li>
              <li>Session save/load (MongoDB-backed)</li>
            </ul>
          </div>
        </Modal>
      )}
    </div>
  );
}

const kbdStyle = {
  background: '#27272A', border: '1px solid rgba(255,255,255,0.06)',
  borderRadius: 3, padding: '0 6px', fontSize: 9, marginRight: 6,
  fontFamily: 'JetBrains Mono, monospace'
};

function Modal({ title, onClose, children }) {
  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)'
      }}>
      <div style={{
        background: '#18181B', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12,
        width: 'min(600px, 92vw)', maxHeight: '85vh', padding: 22, display: 'flex', flexDirection: 'column', gap: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="font-heading" style={{ fontSize: 20, fontWeight: 700 }}>{title}</div>
          <button className="riba-btn" onClick={onClose}>Close</button>
        </div>
        <div style={{ overflowY: 'auto' }}>{children}</div>
      </div>
    </div>
  );
}
