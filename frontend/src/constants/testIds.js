// Test ID constants for the Riba DAW
export const TID = {
  // Transport
  playAll: 'transport-play-all',
  stopAll: 'transport-stop-all',
  recordBtn: 'transport-record',
  metronomeBtn: 'transport-metronome',
  loopBtn: 'transport-loop',
  themeBtn: 'transport-theme',
  manualBtn: 'transport-manual',
  exportBtn: 'transport-export',
  clearBtn: 'transport-clear',
  saveBtn: 'transport-save',
  loadBtn: 'transport-load',
  undoBtn: 'transport-undo',
  redoBtn: 'transport-redo',
  stemsBtn: 'transport-stems',
  mixerBtn: 'transport-mixer',
  gmBtn: 'transport-gm',
  vstBtn: 'transport-vst',
  pluginsBtn: 'transport-plugins',

  // Tempo
  tempoSlider: 'tempo-slider',
  tempoValue: 'tempo-value',
  timeSigSelect: 'timesig-select',
  masterVolSlider: 'master-volume-slider',
  masterProgress: 'master-progress',

  // Timeline / playhead
  timeline: 'timeline',
  playhead: 'playhead',

  // Add buttons
  addAudio: 'add-audio-track',
  addMIDI: 'add-midi-track',
  dreamBtn: 'dream-generate-btn',
  dreamHistoryBtn: 'dream-history-btn',
  magic12Sep: 'magic12-separate-btn',
  magic12Master: 'magic12-master-btn',
  midiToAudio: 'midi-to-audio-btn',
  audioToMidi: 'audio-to-midi-btn',

  // Menu bar
  menuFile: 'menu-file',
  menuEdit: 'menu-edit',
  menuTrack: 'menu-track',
  menuEvent: 'menu-event',
  menuAudioSuite: 'menu-audiosuite',
  menuTools: 'menu-tools',
  menuView: 'menu-view',
  menuOptions: 'menu-options',
  menuHelp: 'menu-help',

  // Dream dialog
  dreamPromptInput: 'dream-prompt-input',
  dreamGenerateConfirm: 'dream-generate-confirm',
  dreamCloseBtn: 'dream-close-btn',

  // Track row
  trackRow: (i) => `track-row-${i}`,
  trackPlay: (i) => `track-play-${i}`,
  trackStop: (i) => `track-stop-${i}`,
  trackMute: (i) => `track-mute-${i}`,
  trackSolo: (i) => `track-solo-${i}`,
  trackDelete: (i) => `track-delete-${i}`,
  trackPiano: (i) => `track-piano-${i}`,
  trackEqToggle: (i) => `track-eq-toggle-${i}`,
  trackVolume: (i) => `track-volume-${i}`,
  trackPan: (i) => `track-pan-${i}`,
  trackEqBass: (i) => `track-eq-bass-${i}`,
  trackEqMid: (i) => `track-eq-mid-${i}`,
  trackEqHigh: (i) => `track-eq-high-${i}`,
  trackReverb: (i) => `track-reverb-${i}`,
  trackDelay: (i) => `track-delay-${i}`,
  trackInstrument: (i) => `track-instrument-${i}`,

  // Piano roll
  pianoRollClose: 'pianoroll-close',
  pianoRollPlay: 'pianoroll-play',

  // GM / Plugins
  gmSelect: 'gm-instrument-select',
  gmApply: 'gm-apply-btn',

  // File input
  audioFileInput: 'audio-file-input',
  projectFileInput: 'project-file-input',
};
