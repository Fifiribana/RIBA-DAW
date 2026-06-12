// Riba DAW Web Audio Engine
// Provides per-track playback (audio + MIDI), EQ, panning, volume, master meter, metronome and recording.

class TrackNode {
  constructor(ctx, master) {
    this.ctx = ctx;
    this.master = master;
    this.audioBuffer = null;       // for audio tracks
    this.source = null;            // AudioBufferSourceNode while playing
    this.midiNotes = [];           // [{pitch,velocity,start,duration}] (beats)
    this.midiOscillators = [];     // currently scheduled
    this.isMIDI = false;

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

    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 256;

    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.pan);
    this.pan.connect(this.gain);
    this.gain.connect(this.analyser);
    this.analyser.connect(master);

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
  playMIDI(bpm) {
    if (!this.midiNotes.length) return;
    this.stop();
    const beatSec = 60 / bpm;
    const tNow = this.ctx.currentTime + 0.05;
    for (const n of this.midiNotes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const freq = 440 * Math.pow(2, (n.pitch - 69) / 12);
      osc.frequency.value = freq;
      const env = this.ctx.createGain();
      const v = Math.max(0.05, Math.min(0.9, n.velocity / 127));
      const startT = tNow + n.start * beatSec;
      const stopT = startT + n.duration * beatSec;
      env.gain.setValueAtTime(0, startT);
      env.gain.linearRampToValueAtTime(v * 0.6, startT + 0.01);
      env.gain.linearRampToValueAtTime(v * 0.4, startT + 0.05);
      env.gain.linearRampToValueAtTime(0, stopT);
      osc.connect(env);
      env.connect(this.eqLow);
      osc.start(startT);
      osc.stop(stopT + 0.02);
      this.midiOscillators.push(osc);
    }
    this.isPlaying = true;
    this.startedAt = this.ctx.currentTime + 0.05;
    // schedule cleanup
    const total = this.duration * beatSec;
    setTimeout(() => { this.isPlaying = false; this.midiOscillators = []; }, total * 1000 + 200);
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
    if (t.isMIDI) t.playMIDI(this.tempo); else t.playAudio(true);
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
      if (t.isMIDI) t.playMIDI(this.tempo); else t.playAudio(true);
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
}

export const engine = new RibaEngine();
