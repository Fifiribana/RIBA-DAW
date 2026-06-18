// Riba DAW Web Audio Engine
// Provides per-track playback (audio + MIDI), EQ, panning, volume, master meter, metronome and recording.

import { GM_INSTRUMENTS } from './instruments';

// Create a synthetic impulse response for reverb
function buildImpulseResponse(ctx, duration = 1.8, decay = 2.5) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * duration);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

class TrackNode {
  constructor(ctx, master) {
    this.ctx = ctx;
    this.master = master;
    this.audioBuffer = null;       // for audio tracks
    this.source = null;            // AudioBufferSourceNode while playing
    this.midiNotes = [];           // [{pitch,velocity,start,duration}] (beats)
    this.midiOscillators = [];     // currently scheduled
    this.isMIDI = false;
    this.instrumentIndex = 0;      // GM instrument index for MIDI tracks

    this.gain = ctx.createGain();
    this.gain.gain.value = 1.0;

    this.pan = ctx.createStereoPanner();
    this.pan.pan.value = 0;

    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 200;
    this.eqLow.gain.value = 0;

    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1.0;
    this.eqMid.gain.value = 0;

    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 5000;
    this.eqHigh.gain.value = 0;

    // FX bus: eqHigh -> fxIn -> {dry, delay, reverb} -> fxOut -> pan
    this.fxIn = ctx.createGain();
    this.fxOut = ctx.createGain();
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1.0;

    this.delayNode = ctx.createDelay(2.0);
    this.delayNode.delayTime.value = 0.28;
    this.delayFeedback = ctx.createGain();
    this.delayFeedback.gain.value = 0.32;
    this.delayWet = ctx.createGain();
    this.delayWet.gain.value = 0; // off by default

    this.reverbNode = ctx.createConvolver();
    this.reverbNode.buffer = buildImpulseResponse(ctx, 2.0, 3.0);
    this.reverbWet = ctx.createGain();
    this.reverbWet.gain.value = 0; // off by default

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;

    // wire
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.fxIn);
    this.fxIn.connect(this.dryGain);
    this.dryGain.connect(this.fxOut);
    // delay branch (with feedback)
    this.fxIn.connect(this.delayNode);
    this.delayNode.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delayNode);
    this.delayNode.connect(this.delayWet);
    this.delayWet.connect(this.fxOut);
    // reverb branch
    this.fxIn.connect(this.reverbNode);
    this.reverbNode.connect(this.reverbWet);
    this.reverbWet.connect(this.fxOut);
    // out
    this.fxOut.connect(this.pan);
    this.pan.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(master);

    this.effects = { reverb: false, delay: false };
    this.eqEnabled = false;
    this.muted = false;
    this.userGain = 1.0;
    this.isPlaying = false;
    this.startedAt = 0;
    this.offset = 0;
    this.loop = true;
    this.duration = 0; // seconds, for audio tracks
  }
  setVolume(v) {
    this.userGain = v;
    this._applyGain();
  }
  setMuted(m) {
    this.muted = m;
    this._applyGain();
  }
  _applyGain() {
    this.gain.gain.setTargetAtTime(this.muted ? 0 : this.userGain, this.ctx.currentTime, 0.01);
  }
  setPan(p) { this.pan.pan.setTargetAtTime(p, this.ctx.currentTime, 0.01); }
  setEQ(low, mid, high, enabled) {
    this.eqEnabled = enabled;
    const scale = (v) => (v - 50) * 0.24; // -12..+12 dB
    this.eqLow.gain.setTargetAtTime(enabled ? scale(low) : 0, this.ctx.currentTime, 0.05);
    this.eqMid.gain.setTargetAtTime(enabled ? scale(mid) : 0, this.ctx.currentTime, 0.05);
    this.eqHigh.gain.setTargetAtTime(enabled ? scale(high) : 0, this.ctx.currentTime, 0.05);
  }
  setReverb(on) {
    this.effects.reverb = on;
    this.reverbWet.gain.setTargetAtTime(on ? 0.35 : 0, this.ctx.currentTime, 0.05);
  }
  setDelay(on) {
    this.effects.delay = on;
    this.delayWet.gain.setTargetAtTime(on ? 0.4 : 0, this.ctx.currentTime, 0.05);
  }
  setInstrument(idx) {
    this.instrumentIndex = Math.max(0, Math.min(127, idx | 0));
  }
  loadAudio(buffer) {
    this.audioBuffer = buffer;
    this.duration = buffer.duration;
    this.isMIDI = false;
  }
  setMIDI(notes) {
    this.midiNotes = notes;
    this.isMIDI = true;
    // duration as last note end
    let max = 0;
    for (const n of notes) max = Math.max(max, n.start + n.duration);
    this.duration = Math.max(max, 1);
  }
  playAudio(loop = true) {
    if (!this.audioBuffer) return;
    this.stop();
    const src = this.ctx.createBufferSource();
    src.buffer = this.audioBuffer;
    src.loop = loop;
    src.connect(this.eqLow);
    src.start(0, this.offset % this.audioBuffer.duration);
    this.source = src;
    this.startedAt = this.ctx.currentTime;
    this.isPlaying = true;
    src.onended = () => { if (this.source === src) { this.isPlaying = false; } };
  }
  playMIDI(bpm, swingFn = null) {
    if (!this.midiNotes.length) return;
    this.stop();
    const beatSec = 60 / bpm;
    const tNow = this.ctx.currentTime + 0.05;
    const preset = GM_INSTRUMENTS[this.instrumentIndex] || GM_INSTRUMENTS[0];
    const s = preset.synth;
    for (const n of this.midiNotes) {
      const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
      const v = Math.max(0.05, Math.min(0.9, n.velocity / 127));
      // Apply Bantu Swing Live (non-destructive: only schedule offset)
      const swungStart = swingFn ? swingFn(n.start) : n.start;
      const startT = tNow + swungStart * beatSec;
      const stopT = startT + n.duration * beatSec;

      // primary oscillator
      const osc = this.ctx.createOscillator();
      osc.type = s.type;
      osc.frequency.value = freq;

      // optional secondary oscillator for fatter timbre
      let osc2 = null;
      if (s.type2 && s.mix > 0) {
        osc2 = this.ctx.createOscillator();
        osc2.type = s.type2;
        osc2.frequency.value = freq;
      }

      // optional vibrato
      let lfo = null, lfoGain = null;
      if (s.vibrato > 0) {
        lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = s.vibrato;
        lfoGain = this.ctx.createGain();
        lfoGain.gain.value = freq * 0.01; // ~1% pitch mod
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        if (osc2) lfoGain.connect(osc2.frequency);
        lfo.start(startT);
        lfo.stop(stopT + 0.05);
      }

      // filter for tone
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.value = s.cutoff || 4000;
      filt.Q.value = 0.7;

      // ADSR envelope
      const env = this.ctx.createGain();
      const noteDur = Math.max(0.02, stopT - startT);
      const attack = Math.min(s.attack, noteDur * 0.4);
      const decay = Math.min(s.decay, noteDur * 0.4);
      const sustain = s.sustain;
      const release = s.release;
      env.gain.setValueAtTime(0, startT);
      env.gain.linearRampToValueAtTime(v, startT + attack);
      env.gain.linearRampToValueAtTime(v * sustain, startT + attack + decay);
      env.gain.setValueAtTime(v * sustain, stopT);
      env.gain.linearRampToValueAtTime(0, stopT + release);

      // wiring
      osc.connect(filt);
      if (osc2) {
        const mixGain = this.ctx.createGain();
        mixGain.gain.value = s.mix;
        osc2.connect(mixGain);
        mixGain.connect(filt);
        osc2.start(startT);
        osc2.stop(stopT + release + 0.05);
        this.midiOscillators.push(osc2);
      }
      filt.connect(env);
      env.connect(this.eqLow);

      osc.start(startT);
      osc.stop(stopT + release + 0.05);
      this.midiOscillators.push(osc);
      if (lfo) this.midiOscillators.push(lfo);
    }
    this.isPlaying = true;
    this.startedAt = this.ctx.currentTime + 0.05;
    const total = (this.duration || 1) * beatSec;
    setTimeout(() => { this.isPlaying = false; this.midiOscillators = []; }, total * 1000 + 500);
  }
  stop() {
    if (this.source) {
      try { this.source.stop(); } catch(_) { /* ignore */ }
      try { this.source.disconnect(); } catch(_) { /* ignore */ }
      this.source = null;
    }
    for (const o of this.midiOscillators) {
      try { o.stop(); } catch(_) { /* ignore */ }
      try { o.disconnect(); } catch(_) { /* ignore */ }
    }
    this.midiOscillators = [];
    this.isPlaying = false;
  }
  dispose() {
    this.stop();
    try {
      this.gain.disconnect();
      this.pan.disconnect();
      this.eqLow.disconnect();
      this.eqMid.disconnect();
      this.eqHigh.disconnect();
      this.analyser.disconnect();
    } catch(_) { /* ignore */ }
  }
}

export class RibaEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.masterAnalyser = null;
    this.tracks = new Map(); // id -> TrackNode
    this.metronomeOn = false;
    this.metronomeTimer = null;
    this.metronomeCallback = null;
    this.tempo = 120;
    this.timeSig = 4;
    this.metroBeat = 0;
    this.metroMeasure = 1;

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.recordStream = null;

    // === Bantu Swing Live (non-destructive humanization) ===
    this.bantuSwing = {
      enabled: false,
      style: 'bikutsi_44',
      density: 16,
      bars: 4,
      intensity: 1.0,
      _cachedPositions: null,
      _cacheKey: null,
    };
  }

  /**
   * Configure live, non-destructive Bantu groove application during playback.
   * MIDI note data is NOT mutated — only schedule times are adjusted.
   */
  setBantuSwing(cfg) {
    this.bantuSwing = { ...this.bantuSwing, ...cfg };
    this.bantuSwing._cachedPositions = null;
    this.bantuSwing._cacheKey = null;
  }

  _swingPositions() {
    const sw = this.bantuSwing;
    const key = `${sw.style}|${sw.density}|${sw.bars}`;
    if (sw._cacheKey !== key) {
      sw._cachedPositions = computeBantuGrid(sw.style, sw.density, sw.bars);
      sw._cacheKey = key;
    }
    return sw._cachedPositions;
  }

  _swingBeat(beat) {
    const sw = this.bantuSwing;
    if (!sw.enabled) return beat;
    const positions = this._swingPositions();
    if (!positions || positions.length === 0) return beat;
    const cycle = sw.bars * 4;
    const cycleIdx = Math.floor(beat / cycle);
    const mod = beat - cycleIdx * cycle;
    let best = positions[0];
    let bestDist = Math.abs(mod - best);
    for (let i = 1; i < positions.length; i++) {
      const d = Math.abs(mod - positions[i]);
      if (d < bestDist) { bestDist = d; best = positions[i]; }
    }
    const delta = (best - mod) * sw.intensity;
    return beat + delta;
  }
  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 1024;
      this.master.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }
  // === stems export ===
  async renderTrackToWav(trackId, bpm = 120) {
    const t = this.tracks.get(trackId);
    if (!t) return null;
    if (t.isMIDI && t.midiNotes.length) {
      const beatSec = 60 / bpm;
      const totalSec = Math.max(2, (t.duration || 4) * beatSec + 1);
      const oCtx = new OfflineAudioContext(2, Math.ceil(totalSec * 48000), 48000);
      const masterOut = oCtx.createGain();
      masterOut.gain.value = 1.0;
      masterOut.connect(oCtx.destination);
      const preset = GM_INSTRUMENTS[t.instrumentIndex] || GM_INSTRUMENTS[0];
      const s = preset.synth;
      for (const n of t.midiNotes) {
        const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
        const v = Math.max(0.05, Math.min(0.9, n.velocity / 127));
        const startT = n.start * beatSec;
        const stopT = startT + n.duration * beatSec;
        const osc = oCtx.createOscillator();
        osc.type = s.type;
        osc.frequency.value = freq;
        const env = oCtx.createGain();
        env.gain.setValueAtTime(0, startT);
        env.gain.linearRampToValueAtTime(v, startT + s.attack);
        env.gain.linearRampToValueAtTime(v * s.sustain, startT + s.attack + s.decay);
        env.gain.setValueAtTime(v * s.sustain, stopT);
        env.gain.linearRampToValueAtTime(0, stopT + s.release);
        osc.connect(env);
        env.connect(masterOut);
        osc.start(startT);
        osc.stop(stopT + s.release + 0.05);
      }
      const rendered = await oCtx.startRendering();
      return audioBufferToWavBlob(rendered);
    } else if (t.audioBuffer) {
      return audioBufferToWavBlob(t.audioBuffer);
    }
    return null;
  }
  setMasterVolume(v) {
    this.ensureCtx();
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
  }
  getOrCreateTrack(id) {
    this.ensureCtx();
    let t = this.tracks.get(id);
    if (!t) {
      t = new TrackNode(this.ctx, this.master);
      this.tracks.set(id, t);
    }
    return t;
  }
  removeTrack(id) {
    const t = this.tracks.get(id);
    if (t) { t.dispose(); this.tracks.delete(id); }
  }
  async loadAudioBlob(id, blobOrFile) {
    const ctx = this.ensureCtx();
    const buf = await blobOrFile.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buf.slice(0));
    const t = this.getOrCreateTrack(id);
    t.loadAudio(decoded);
    return decoded;
  }
  loadMIDI(id, notes) {
    const t = this.getOrCreateTrack(id);
    t.setMIDI(notes);
  }
  play(id) {
    const t = this.tracks.get(id);
    if (!t) return;
    if (t.isMIDI) t.playMIDI(this.tempo, this._swingBeat.bind(this)); else t.playAudio(true);
  }
  stop(id) {
    const t = this.tracks.get(id);
    if (t) t.stop();
  }
  playAll(ids, solo) {
    for (const id of ids) {
      const t = this.tracks.get(id);
      if (!t) continue;
      // soloed
      if (solo.size > 0 && !solo.has(id)) { t.stop(); continue; }
      if (t.muted) { t.stop(); continue; }
      if (t.isMIDI) t.playMIDI(this.tempo, this._swingBeat.bind(this)); else t.playAudio(true);
    }
  }
  stopAll() {
    for (const t of this.tracks.values()) t.stop();
  }
  // ==== Metronome ====
  startMetronome(cb) {
    this.stopMetronome();
    this.ensureCtx();
    this.metronomeOn = true;
    this.metronomeCallback = cb;
    this.metroBeat = 0;
    this.metroMeasure = 1;
    const tick = () => {
      this.playClick(this.metroBeat === 0);
      if (this.metronomeCallback) this.metronomeCallback(this.metroBeat, this.metroMeasure);
      this.metroBeat = (this.metroBeat + 1) % this.timeSig;
      if (this.metroBeat === 0) this.metroMeasure = (this.metroMeasure % 8) + 1;
    };
    tick();
    const interval = (60 / this.tempo) * 1000;
    this.metronomeTimer = setInterval(tick, interval);
  }
  stopMetronome() {
    this.metronomeOn = false;
    if (this.metronomeTimer) clearInterval(this.metronomeTimer);
    this.metronomeTimer = null;
  }
  setTempo(b) {
    this.tempo = b;
    if (this.metronomeOn) { const cb = this.metronomeCallback; this.startMetronome(cb); }
  }
  setTimeSignature(n) { this.timeSig = n; }
  playClick(accent) {
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = 'square';
    osc.frequency.value = accent ? 1400 : 950;
    const t = ctx.currentTime;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.25, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    osc.connect(env);
    env.connect(this.master);
    osc.start(t);
    osc.stop(t + 0.1);
  }
  // ==== Mic recording ====
  async startRecording() {
    if (this.mediaRecorder) return;
    this.recordStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    this.mediaRecorder = new MediaRecorder(this.recordStream, mimeType ? { mimeType } : undefined);
    this.mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) this.recordedChunks.push(e.data); };
    this.mediaRecorder.start();
  }
  async stopRecording() {
    if (!this.mediaRecorder) return null;
    return await new Promise((resolve) => {
      this.mediaRecorder.onstop = () => {
        const blob = new Blob(this.recordedChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
        this.recordedChunks = [];
        this.mediaRecorder = null;
        if (this.recordStream) { this.recordStream.getTracks().forEach(t => t.stop()); this.recordStream = null; }
        resolve(blob);
      };
      this.mediaRecorder.stop();
    });
  }
  // ==== Analyzers ====
  getMasterLevel() {
    if (!this.masterAnalyser) return 0;
    const buf = new Uint8Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }
  getMasterSpectrum(bins = 64) {
    if (!this.masterAnalyser) return new Array(bins).fill(0);
    const data = new Uint8Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getByteFrequencyData(data);
    const step = Math.floor(data.length / bins);
    const out = new Array(bins);
    for (let i = 0; i < bins; i++) {
      let s = 0;
      for (let j = 0; j < step; j++) s += data[i * step + j];
      out[i] = (s / step) / 255;
    }
    return out;
  }
  getTrackLevel(id) {
    const t = this.tracks.get(id);
    if (!t) return 0;
    const buf = new Uint8Array(t.analyser.fftSize);
    t.analyser.getByteTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = (buf[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / buf.length);
  }
  // ==== Waveform peaks ====
  computePeaks(buffer, count = 200) {
    if (!buffer) return new Array(count).fill(0.1);
    const ch = buffer.getChannelData(0);
    const blockSize = Math.floor(ch.length / count);
    const peaks = new Array(count);
    for (let i = 0; i < count; i++) {
      let max = 0;
      const start = i * blockSize;
      for (let j = 0; j < blockSize; j++) {
        const v = Math.abs(ch[start + j] || 0);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return peaks;
  }

  // ==== BPM detection via onset energy ====
  detectTempo(audioBuffer) {
    if (!audioBuffer) return 120.0;
    const data = audioBuffer.getChannelData(0);
    const sr = audioBuffer.sampleRate;
    const hop = Math.round(sr * 0.02); // 20ms frames
    const energy = [];
    for (let i = 0; i < data.length; i += hop) {
      let s = 0;
      const end = Math.min(i + hop, data.length);
      for (let j = i; j < end; j++) s += data[j] * data[j];
      energy.push(Math.sqrt(s / (end - i)));
    }
    // dynamic threshold = avg * 1.5
    let avg = 0;
    for (const v of energy) avg += v;
    avg /= Math.max(1, energy.length);
    const threshold = Math.max(0.05, avg * 1.5);
    const peaks = [];
    for (let i = 1; i < energy.length - 1; i++) {
      if (energy[i] > energy[i - 1] && energy[i] > energy[i + 1] && energy[i] > threshold) {
        peaks.push(i * hop);
      }
    }
    if (peaks.length < 2) return 120.0;
    const intervals = [];
    for (let i = 1; i < peaks.length; i++) intervals.push(peaks[i] - peaks[i - 1]);
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    let bpm = 60 / (median / sr);
    while (bpm < 60) bpm *= 2;
    while (bpm > 180) bpm /= 2;
    return Math.round(bpm * 10) / 10;
  }

  async listAudioDevices() {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return { inputs: [], outputs: [], supported: false };
    }
    try {
      // request mic permission to unlock real device names
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (_) { /* permission denied -> partial info */ }
    const devices = await navigator.mediaDevices.enumerateDevices();
    return {
      inputs: devices.filter(d => d.kind === 'audioinput'),
      outputs: devices.filter(d => d.kind === 'audiooutput'),
      supported: true,
    };
  }
}

export const engine = new RibaEngine();

// === WAV encoder ===
export function audioBufferToWavBlob(buffer) {
  const numCh = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numCh * 2 + 44;
  const arrayBuffer = new ArrayBuffer(length);
  const view = new DataView(arrayBuffer);
  let offset = 0;
  const writeString = (s) => { for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i)); };
  writeString('RIFF');
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numCh, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * numCh * 2, true); offset += 4;
  view.setUint16(offset, numCh * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, buffer.length * numCh * 2, true); offset += 4;
  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      let s = Math.max(-1, Math.min(1, buffer.getChannelData(ch)[i]));
      s = s < 0 ? s * 0x8000 : s * 0x7FFF;
      view.setInt16(offset, s, true); offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
