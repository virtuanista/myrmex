// Audio procedural: efectos, música generativa y ambiente.
export const Settings = {
  master: 0.8, music: 0.55, sfx: 0.8, amb: 0.5, quality: 1, showFps: false, edgePan: true,
  load() { try { Object.assign(this, JSON.parse(localStorage.getItem('myrmex.settings') || '{}')); } catch { /* */ } },
  save() { try { const { master, music, sfx, amb, quality, showFps, edgePan } = this; localStorage.setItem('myrmex.settings', JSON.stringify({ master, music, sfx, amb, quality, showFps, edgePan })); } catch { /* */ } },
};
Settings.load();

let ac: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode, ambBus: GainNode, musicFilter: BiquadFilterNode, ambFilter: BiquadFilterNode;
let reverb: ConvolverNode, revSend: GainNode;
let analyser: AnalyserNode | null = null;
let noiseBuf: AudioBuffer;
const last = new Map<string, number>();

export function audioReady() { return !!ac; }
export function initAudio() {
  if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
  ac = new AudioContext();
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
  master = ac.createGain(); master.connect(comp); comp.connect(ac.destination);
  analyser = ac.createAnalyser(); analyser.fftSize = 8192; comp.connect(analyser);
  sfxBus = ac.createGain(); sfxBus.connect(master);
  musicFilter = ac.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000;
  musicBus = ac.createGain(); musicBus.connect(musicFilter); musicFilter.connect(master);
  ambFilter = ac.createBiquadFilter(); ambFilter.type = 'lowpass'; ambFilter.frequency.value = 16000;
  ambBus = ac.createGain(); ambBus.connect(ambFilter); ambFilter.connect(master);
  // reverb
  reverb = ac.createConvolver();
  const len = ac.sampleRate * 2.2;
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.8); }
  reverb.buffer = ir;
  revSend = ac.createGain(); revSend.gain.value = 0.28;
  revSend.connect(reverb); reverb.connect(master);
  noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  applyVolumes();
  startAmbience();
}
export function applyVolumes() {
  if (!ac) return;
  master.gain.value = Settings.master * 2.2;
  sfxBus.gain.value = Settings.sfx * 1.1;
  musicBus.gain.value = Settings.music * 1.6;
  ambBus.gain.value = Settings.amb * 0.9;
}
export function setUnderground(on: boolean) {
  if (!ac) return;
  const t = ac.currentTime;
  musicFilter.frequency.cancelScheduledValues(t);
  musicFilter.frequency.setTargetAtTime(on ? 1400 : 18000, t, 0.3);
  ambFilter.frequency.setTargetAtTime(on ? 500 : 16000, t, 0.3);
}

function throttle(name: string, ms: number) {
  const now = performance.now();
  if ((last.get(name) || 0) + ms > now) return false;
  last.set(name, now);
  return true;
}

// ---------- primitivas ----------
function tone(freq: number, dur: number, type: OscillatorType, vol: number, opts: { at?: number; slide?: number; attack?: number; rev?: number; bus?: GainNode; detune?: number; filter?: number } = {}) {
  if (!ac) return;
  const t = ac.currentTime + (opts.at || 0);
  const o = ac.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (opts.detune) o.detune.value = opts.detune;
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
  const g = ac.createGain();
  const a = opts.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node: AudioNode = o;
  if (opts.filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.filter; o.connect(f); node = f; }
  node.connect(g);
  g.connect(opts.bus || sfxBus);
  if (opts.rev) { const s = ac.createGain(); s.gain.value = opts.rev; g.connect(s); s.connect(revSend); }
  o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'bandpass', opts: { at?: number; q?: number; rev?: number; bus?: GainNode; attack?: number } = {}) {
  if (!ac) return;
  const t = ac.currentTime + (opts.at || 0);
  const s = ac.createBufferSource();
  s.buffer = noiseBuf;
  s.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = ac.createBiquadFilter(); f.type = type; f.Q.value = opts.q ?? 1.2;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + (opts.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(opts.bus || sfxBus);
  if (opts.rev) { const r = ac.createGain(); r.gain.value = opts.rev; g.connect(r); r.connect(revSend); }
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

// ---------- efectos ----------
let combo = 0, comboT = 0;
export const SFX = {
  click() { if (throttle('click', 30)) { tone(900, 0.06, 'triangle', 0.12); tone(1400, 0.04, 'sine', 0.06, { at: 0.01 }); } },
  hover() { if (throttle('hover', 50)) tone(1800, 0.03, 'sine', 0.03); },
  open() { tone(520, 0.12, 'sine', 0.12, { slide: 1.6 }); tone(780, 0.14, 'triangle', 0.06, { at: 0.04, slide: 1.4 }); },
  close() { tone(700, 0.1, 'sine', 0.1, { slide: 0.6 }); },
  pick() { if (throttle('pick', 70)) tone(1200 + Math.random() * 300, 0.05, 'sine', 0.05, { slide: 1.5 }); },
  gain(k: string) {
    if (!throttle('gain', 55)) return;
    const now = performance.now();
    if (now - comboT > 1800) combo = 0;
    comboT = now; combo = Math.min(combo + 1, PENTA.length * 2 - 1);
    const step = PENTA[combo % PENTA.length] + (combo >= PENTA.length ? 12 : 0);
    const base = k === 'amber' ? 79 : k === 'leaves' ? 72 : k === 'science' ? 84 : 76;
    const f = midi(base + step * 0.5);
    tone(f, 0.22, 'triangle', 0.15, { rev: 0.2 });
    tone(f * 2, 0.12, 'sine', 0.05, { at: 0.02 });
    if (k === 'amber') tone(f * 3, 0.3, 'sine', 0.04, { at: 0.04, rev: 0.4 });
  },
  lost() { if (throttle('lost', 1500)) { tone(300, 0.2, 'sawtooth', 0.04, { slide: 0.6, filter: 900 }); } },
  dig() { if (throttle('dig', 90)) { noise(0.09, 0.08, 700 + Math.random() * 500, 200, 'bandpass', { q: 1.5 }); } },
  dug() { if (throttle('dug', 80)) { noise(0.07, 0.07, 1800, 400, 'bandpass'); tone(120 + Math.random() * 40, 0.08, 'sine', 0.06, { slide: 0.5 }); } },
  treasure() {
    [0, 4, 7, 12, 16, 19].forEach((n, i) => tone(midi(84 + n), 0.5, 'sine', 0.07, { at: i * 0.06, rev: 0.6 }));
    noise(0.5, 0.03, 6000, 9000, 'highpass', { rev: 0.5 });
  },
  place() { tone(160, 0.18, 'sine', 0.2, { slide: 0.5 }); noise(0.1, 0.08, 900, 300, 'lowpass'); tone(1200, 0.05, 'triangle', 0.05, { at: 0.05 }); },
  complete() {
    [0, 4, 7, 12].forEach((n, i) => { tone(midi(72 + n), 0.45, 'triangle', 0.11, { at: i * 0.08, rev: 0.4 }); tone(midi(84 + n), 0.3, 'sine', 0.05, { at: i * 0.08 + 0.02 }); });
    noise(0.6, 0.03, 5000, 12000, 'highpass', { at: 0.3, rev: 0.6 });
  },
  hatch() { if (throttle('hatch', 120)) { tone(500, 0.08, 'sine', 0.1, { slide: 2.2 }); tone(900, 0.1, 'sine', 0.07, { at: 0.06, slide: 1.6 }); } },
  egg() { if (throttle('egg', 200)) tone(700, 0.06, 'sine', 0.05, { slide: 0.8 }); },
  hit() { if (throttle('hit', 45)) { noise(0.06, 0.22, 2000 + Math.random() * 2000, 800, 'bandpass', { q: 2 }); tone(180 + Math.random() * 60, 0.05, 'triangle', 0.08, { slide: 0.6 }); } },
  bite() { if (throttle('bite', 60)) { tone(260 + Math.random() * 80, 0.05, 'square', 0.08, { slide: 0.5, filter: 1800 }); noise(0.04, 0.1, 3000, 1200, 'bandpass', { q: 3 }); } },
  death() { if (throttle('death', 70)) { noise(0.18, 0.18, 1400, 150, 'lowpass'); tone(220, 0.14, 'triangle', 0.1, { slide: 0.4 }); } },
  bigDeath() { tone(90, 0.5, 'sine', 0.3, { slide: 0.4 }); noise(0.4, 0.15, 900, 80, 'lowpass', { rev: 0.3 }); [0, 7, 12].forEach((n, i) => tone(midi(67 + n), 0.4, 'triangle', 0.08, { at: 0.15 + i * 0.07, rev: 0.4 })); },
  shoot() { if (throttle('shoot', 60)) { noise(0.16, 0.18, 3000, 700, 'bandpass', { q: 3 }); tone(900, 0.08, 'sine', 0.05, { slide: 0.4 }); } },
  splash() { if (throttle('splash', 60)) noise(0.12, 0.05, 1500, 4000, 'bandpass', { q: 2 }); },
  levelup() {
    const ch = [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]];
    ch.forEach((c, i) => c.forEach(n => tone(midi(60 + n), 0.6, 'sawtooth', 0.035, { at: i * 0.14, filter: 2400, rev: 0.4 })));
    [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(midi(84 + n), 0.4, 'sine', 0.06, { at: 0.5 + i * 0.05, rev: 0.6 }));
    tone(65, 0.8, 'sine', 0.2, { slide: 1 });
  },
  quest() { [0, 7, 12, 16].forEach((n, i) => tone(midi(74 + n), 0.35, 'triangle', 0.1, { at: i * 0.1, rev: 0.5 })); },
  achievement() {
    [0, 4, 7, 11, 14].forEach((n, i) => tone(midi(79 + n), 0.5, 'sine', 0.08, { at: i * 0.07, rev: 0.7 }));
    [0, 4, 7].forEach(n => tone(midi(55 + n), 1.2, 'triangle', 0.06, { at: 0.35, rev: 0.5 }));
  },
  alarm() { for (let i = 0; i < 3; i++) { tone(330, 0.22, 'square', 0.1, { at: i * 0.5, filter: 1200 }); tone(247, 0.22, 'square', 0.1, { at: i * 0.5 + 0.24, filter: 1200 }); } },
  warn() { if (throttle('warn', 3000)) { tone(440, 0.15, 'square', 0.04, { filter: 1600 }); tone(330, 0.2, 'square', 0.04, { at: 0.16, filter: 1600 }); } },
  event() { [0, 5, 9].forEach((n, i) => tone(midi(76 + n), 0.5, 'sine', 0.08, { at: i * 0.12, rev: 0.6 })); },
  error() { if (throttle('err', 200)) { tone(180, 0.15, 'sawtooth', 0.06, { filter: 700 }); tone(140, 0.18, 'sawtooth', 0.05, { at: 0.08, filter: 700 }); } },
  thunder() { noise(2.4, 0.4, 300, 40, 'lowpass', { attack: 0.05, rev: 0.4 }); noise(0.3, 0.2, 3000, 400, 'lowpass'); },
  research() { [0, 3, 7, 10, 14].forEach((n, i) => tone(midi(72 + n), 0.25, 'square', 0.06, { at: i * 0.06, filter: 3000, rev: 0.4 })); },
  discover() { noise(0.8, 0.05, 400, 6000, 'bandpass', { rev: 0.5, attack: 0.3 }); [0, 7, 12, 19].forEach((n, i) => tone(midi(71 + n), 0.7, 'sine', 0.07, { at: 0.2 + i * 0.09, rev: 0.7 })); },
  bird() { for (let i = 0; i < 4; i++) tone(2200 + Math.random() * 900, 0.08, 'sine', 0.04, { at: i * 0.11, slide: 0.7, bus: ambBus }); noise(1.5, 0.08, 200, 600, 'bandpass', { at: 0.5, attack: 0.5 }); },
  whoosh() { noise(0.35, 0.06, 300, 2400, 'bandpass', { attack: 0.15 }); },
  coinBig() { [0, 4, 7, 12, 16].forEach((n, i) => tone(midi(80 + n), 0.3, 'triangle', 0.08, { at: i * 0.04, rev: 0.3 })); },
};

// ---------- ambiente ----------
let ambNodes: { wind: GainNode; rain: GainNode; windF: BiquadFilterNode } | null = null;
function startAmbience() {
  if (!ac) return;
  const mk = (type: BiquadFilterType, freq: number) => {
    const s = ac!.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ac!.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.6;
    const g = ac!.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(ambBus); s.start();
    return { g, f };
  };
  const w = mk('lowpass', 400), r = mk('highpass', 1200);
  ambNodes = { wind: w.g, rain: r.g, windF: w.f };
}
let chirpT = 0, cricketT = 0;
export function updateAmbience(dt: number, night: boolean, weather: string, under: boolean) {
  if (!ac || !ambNodes) return;
  const t = ac.currentTime;
  const rain = weather === 'rain' ? 0.35 : weather === 'storm' ? 0.6 : 0;
  ambNodes.rain.gain.setTargetAtTime(rain, t, 1.5);
  const wind = 0.08 + (weather === 'storm' ? 0.25 : 0) + Math.sin(t * 0.13) * 0.04;
  ambNodes.wind.gain.setTargetAtTime(wind, t, 2);
  ambNodes.windF.frequency.setTargetAtTime(300 + Math.sin(t * 0.21) * 150, t, 1);
  if (under) return;
  chirpT -= dt; cricketT -= dt;
  if (!night && chirpT <= 0 && rain === 0) {
    chirpT = 2 + Math.random() * 6;
    const base = 2000 + Math.random() * 2000, n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) tone(base * (1 + Math.random() * 0.2), 0.07, 'sine', 0.025, { at: i * 0.09, slide: Math.random() < 0.5 ? 1.3 : 0.8, bus: ambBus, rev: 0.3 });
  }
  if (night && cricketT <= 0) {
    cricketT = 0.5 + Math.random() * 1.5;
    const f = 4200 + Math.random() * 600;
    for (let i = 0; i < 6; i++) tone(f, 0.02, 'sine', 0.018, { at: i * 0.035, bus: ambBus });
  }
}

// ---------- música generativa ----------
let musicOn = false, nextNote = 0, step = 0, tension = 0, tensionTarget = 0, timer: number | null = null;
let melodyIdx = 4;
const PROG_PEACE = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];   // Am F C G
const PROG_TENSE = [[57, 60, 64], [58, 62, 65], [55, 58, 62], [52, 56, 59]];   // Am Bb Gm E
const PROG_NIGHT = [[57, 60, 64], [52, 55, 59], [53, 57, 60], [50, 53, 57]];
let night = false;
export function setMusicMood(t: number, isNight: boolean) { tensionTarget = t; night = isNight; }
export function startMusic() {
  if (!ac || musicOn) return;
  musicOn = true; nextNote = ac.currentTime + 0.2; step = 0;
  timer = window.setInterval(schedule, 90);
}
export function stopMusic() { musicOn = false; if (timer) clearInterval(timer); timer = null; }

function schedule() {
  if (!ac || !musicOn) return;
  tension += (tensionTarget - tension) * 0.05;
  const bpm = 82 + tension * 26;
  const eighth = 60 / bpm / 2;
  while (nextNote < ac.currentTime + 0.35) {
    playStep(step, nextNote, eighth);
    nextNote += eighth; step++;
  }
}
function mtone(freq: number, at: number, dur: number, type: OscillatorType, vol: number, filter?: number, rev = 0.3, attack = 0.01) {
  if (!ac) return;
  const o = ac.createOscillator(); o.type = type; o.frequency.value = freq;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let n: AudioNode = o;
  if (filter) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter; o.connect(f); n = f; }
  n.connect(g); g.connect(musicBus);
  if (rev) { const s = ac.createGain(); s.gain.value = rev; g.connect(s); s.connect(revSend); }
  o.start(at); o.stop(at + dur + 0.05);
}
function playStep(s: number, at: number, e: number) {
  const bar = Math.floor(s / 8) % 4;
  const beat = s % 8;
  const tense = tension > 0.5;
  const prog = tense ? PROG_TENSE : night ? PROG_NIGHT : PROG_PEACE;
  const chord = prog[bar];
  // pad al inicio de compás
  if (beat === 0) {
    for (const n of chord) {
      mtone(midi(n), at, e * 8.5, 'sawtooth', 0.018, tense ? 900 : 1300, 0.5, 0.6);
      mtone(midi(n) * 1.003, at, e * 8.5, 'triangle', 0.025, undefined, 0.5, 0.6);
    }
    mtone(midi(chord[0] - 24), at, e * 3.5, 'sine', 0.12, undefined, 0, 0.02);
  }
  if (beat === 4) mtone(midi(chord[0] - 24 + (tense ? 0 : 7)), at, e * 3, 'sine', 0.09, undefined, 0, 0.02);
  // melodía
  const p = tense ? 0.55 : 0.42;
  if (Math.random() < p && !(beat === 7 && Math.random() < 0.5)) {
    melodyIdx = Math.max(0, Math.min(PENTA.length - 1, melodyIdx + Math.floor(Math.random() * 5) - 2));
    const root = 69;
    const n = root + PENTA[melodyIdx] - (night ? 0 : 0);
    const type: OscillatorType = night ? 'sine' : 'triangle';
    mtone(midi(n), at, e * (Math.random() < 0.3 ? 3 : 1.6), type, night ? 0.05 : 0.06, undefined, 0.45);
    if (night) mtone(midi(n + 12), at, e * 2, 'sine', 0.018, undefined, 0.7);
  }
  // percusión suave
  if (ac && (tense || beat % 2 === 1)) {
    const t0 = at;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000;
    const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(tense ? 0.035 : 0.018, t0 + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
    src.connect(f); f.connect(g); g.connect(musicBus); src.start(t0, Math.random()); src.stop(t0 + 0.08);
  }
  if (tense && (beat === 0 || beat === 3 || beat === 6)) {
    mtone(80, at, 0.3, 'sine', 0.22, undefined, 0.1, 0.003);
    mtone(160, at, 0.08, 'triangle', 0.06, 1200, 0, 0.002);
  } else if (!tense && beat === 0 && tension < 0.2) {
    mtone(60, at, 0.25, 'sine', 0.08, undefined, 0, 0.004);
  }
}

/** Nivel de salida actual (RMS y pico) para diagnóstico */
export function audioLevel(): { rms: number; peak: number; state: string } {
  if (!ac || !analyser) return { rms: 0, peak: 0, state: 'none' };
  const d = new Float32Array(analyser.fftSize);
  analyser.getFloatTimeDomainData(d);
  let s = 0, p = 0;
  for (const v of d) { s += v * v; p = Math.max(p, Math.abs(v)); }
  return { rms: Math.sqrt(s / d.length), peak: p, state: ac.state };
}

/** Diagnóstico: espectro actual y grabación de la salida */
export function audioSpectrum(): Float32Array | null {
  if (!analyser) return null;
  const d = new Float32Array(analyser.frequencyBinCount);
  analyser.getFloatFrequencyData(d);
  return d;
}
export function audioSampleRate() { return ac ? ac.sampleRate : 0; }
export function tapStream(): MediaStream | null {
  if (!ac || !analyser) return null;
  const dest = ac.createMediaStreamDestination();
  analyser.connect(dest);
  return dest.stream;
}
