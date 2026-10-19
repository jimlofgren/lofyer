const CHORDS = {
  'C min7': [0, 3, 7, 10],
  'C min9': [0, 3, 7, 10, 14],
  'C maj7': [0, 4, 7, 11],
  'C sus2': [0, 2, 7],
  'Ab maj7 / C': [0, 3, 7, 8, 12],
  'C min6': [0, 3, 7, 9],
};

const HALO_MODES = ['up', 'down', 'alternate', 'random', 'same'];
const TIDE_SPEEDS = ['-2', '-1', '-0.5', '0.5', '1', '2'];
const UNDERTOW_MODS = ['stepped speed', 'smooth speed', 'trim', 'dropper', 'stutter', 'filter'];
const KEY_ROW = 'awsedftgyhujk';
const NOTE_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const COLORS = { gold: '#fed43f', sea: '#2bb8b3', pink: '#e151af', baby: '#bed7d8', ink: '#1f2430', paper: '#f6efdc' };

const P = {};
let ctx, nodes, running = false;
let memoryPeaks = new Array(600).fill(0);
let memoryFilled = 0;
let lastScanBack = 0;
let tidePeaks = new Float32Array(400);
let tidePos = 0;
let haloAlternate = 1;
let keyOctave = 0;
let samples = [];
let inputStream = null;
let snippet = null;
let drone = null;
let droneRate = 1;
const playedNotes = [];
const heldKeys = new Set();
const levels = { sun: 0, haze: 0, tide: 0, under: 0 };
const flashes = {};
const pedals = {};
const leds = {};
const randomizable = [];
const NO_RANDOM = new Set(['volume', 'inputLevel', 'listen', 'inputDevice', 'tideRecord', 'source', 'snippet', 'auto', 'chord']);
const RANDOM_RANGE = { tideLen: [6, 40], delayFb: [0.1, 0.9], tideDecay: [0.75, 0.985], glow: [0, 0.7], wear: [0, 0.8], habitRepeats: [0, 0.8], duck: [0, 0.8], habitMix: [0.2, 0.8], tideMix: [0.5, 1] };

function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

function knob(parent, id, label, min, max, value, opts = {}) {
  const { step = 0.01, fmt = (v) => v, curve = 1, onChange } = opts;
  if (!NO_RANDOM.has(id)) {
    const [lo, hi] = RANDOM_RANGE[id] || [min, max];
    randomizable.push(() => api.set(Math.round((lo + Math.random() * (hi - lo)) / step) * step));
  }
  const api = {};
  const wrap = el('div', 'knob', parent);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 72 72');
  wrap.appendChild(svg);
  const mk = (tag, attrs) => {
    const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.entries(attrs).forEach(([k, v]) => n.setAttribute(k, v));
    svg.appendChild(n);
    return n;
  };
  mk('circle', { class: 'skirt', cx: 36, cy: 36, r: 33 });
  for (let i = 0; i <= 10; i++) {
    const a = (-135 + i * 27) * Math.PI / 180;
    const big = i % 5 === 0;
    mk('line', { class: big ? 'tick big' : 'tick', x1: 36 + Math.sin(a) * (big ? 25 : 27), y1: 36 - Math.cos(a) * (big ? 25 : 27), x2: 36 + Math.sin(a) * 31, y2: 36 - Math.cos(a) * 31 });
  }
  mk('circle', { class: 'shadow', cx: 37.5, cy: 38.5, r: 21 });
  mk('circle', { class: 'cap', cx: 36, cy: 36, r: 21, fill: 'url(#capGrad)' });
  mk('circle', { class: 'inner', cx: 36, cy: 36, r: 15 });
  mk('circle', { class: 'gloss', cx: 30, cy: 28, r: 8, fill: 'url(#glossGrad)' });
  const tip = mk('line', { class: 'tip' });
  const lab = el('label', null, wrap);
  lab.textContent = label;
  const out = el('span', 'val', wrap);

  const toT = (v) => Math.pow((v - min) / (max - min), 1 / curve);
  const fromT = (t) => Math.round((min + (max - min) * Math.pow(t, curve)) / step) * step;
  const render = () => {
    const ang = (-135 + toT(P[id]) * 270) * Math.PI / 180;
    tip.setAttribute('x1', 36 + Math.sin(ang) * 4);
    tip.setAttribute('y1', 36 - Math.cos(ang) * 4);
    tip.setAttribute('x2', 36 + Math.sin(ang) * 19);
    tip.setAttribute('y2', 36 - Math.cos(ang) * 19);
    out.textContent = fmt(P[id]);
  };
  const set = (v) => {
    v = Math.min(max, Math.max(min, v));
    if (v === P[id]) return;
    P[id] = v;
    render();
    if (onChange && nodes) onChange(v);
  };
  P[id] = value;
  render();

  let dragT = 0, dragY = 0, dragging = false;
  const move = (e) => {
    if (!dragging) return;
    const fine = e.shiftKey ? 0.2 : 1;
    set(fromT(Math.min(1, Math.max(0, dragT + (dragY - e.clientY) / 160 * fine))));
  };
  const stop = () => {
    dragging = false;
    wrap.classList.remove('dragging');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', stop);
    window.removeEventListener('pointercancel', stop);
  };
  svg.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dragT = toT(P[id]);
    dragY = e.clientY;
    dragging = true;
    wrap.classList.add('dragging');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  });
  svg.addEventListener('dblclick', () => set(value));
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    set(fromT(Math.min(1, Math.max(0, toT(P[id]) - e.deltaY / 800))));
  }, { passive: false });
  api.set = set;
  return api;
}

function select(parent, id, label, options, value, onChange) {
  const wrap = el('div', 'switch', parent);
  const sel = el('select', null, wrap);
  options.forEach((o) => {
    const opt = el('option', null, sel);
    opt.value = o;
    opt.textContent = o;
  });
  sel.value = value;
  const lab = el('label', null, wrap);
  lab.textContent = label;
  P[id] = value;
  sel.addEventListener('change', () => {
    P[id] = sel.value;
    if (onChange) onChange(P[id]);
  });
  if (!NO_RANDOM.has(id)) {
    randomizable.push(() => {
      sel.value = options[Math.floor(Math.random() * options.length)];
      P[id] = sel.value;
      if (onChange) onChange(P[id]);
    });
  }
  return { sel, wrap };
}

function toggle(parent, id, label, value, onChange) {
  const wrap = el('div', 'switch', parent);
  const btn = el('button', 'toggle', wrap);
  const lab = el('label', null, wrap);
  lab.textContent = label;
  P[id] = value;
  const show = () => btn.classList.toggle('active', P[id]);
  btn.addEventListener('click', () => {
    P[id] = !P[id];
    show();
    if (onChange) onChange(P[id]);
  });
  show();
  if (!NO_RANDOM.has(id)) {
    randomizable.push(() => {
      P[id] = Math.random() < 0.6;
      show();
      if (onChange) onChange(P[id]);
    });
  }
  return { btn, set: (v) => { P[id] = v; show(); } };
}

function randomizeAll() {
  randomizable.forEach((fn) => fn());
  document.querySelectorAll('.pedal').forEach((p) => {
    p.classList.add('shake');
    setTimeout(() => p.classList.remove('shake'), 500);
  });
}

function footswitch(parent, label, onClick) {
  const wrap = el('div', 'footwrap', parent);
  const btn = el('button', 'foot', wrap);
  btn.addEventListener('click', onClick);
  const lab = el('label', null, wrap);
  lab.textContent = label;
  return btn;
}

const JACKS = {
  voice: { audioIn: false, ctrl: [['note', 'out'], ['reply', 'in']] },
  space: { audioIn: true, ctrl: [['sway', 'in']], extra: [['line in', 'in']] },
  tape: { audioIn: true, ctrl: [['loop', 'out'], ['duck', 'in'], ['pump', 'in']] },
  memory: { audioIn: true, ctrl: [['pull', 'out'], ['sync', 'in']] },
};
const jacks = {};

function jack(parent, key, label, cls, style) {
  const j = el('div', `jack ${cls}`, parent);
  Object.assign(j.style, style);
  const lab = el('span', null, j);
  lab.textContent = label;
  jacks[key] = j;
  return j;
}

function pedal(name, color, parent) {
  const s = el('section', `pedal ${color}`, parent);
  el('div', 'grain', s);
  ['tl', 'tr', 'bl', 'br'].forEach((pos) => {
    const sc = el('div', `screw ${pos}`, s);
    sc.style.setProperty('--rot', `${Math.floor(Math.random() * 180)}deg`);
  });
  const cfg = JACKS[name];
  if (cfg.audioIn) jack(s, `${name}:in`, 'in', 'audio left', { top: '58%' });
  jack(s, `${name}:out`, 'out', 'audio right', { top: '58%' });
  (cfg.extra || []).forEach(([label]) => jack(s, `${name}:${label}`, label, 'audio left extra', { top: '44%' }));
  cfg.ctrl.forEach(([label, dir], i) => {
    const left = `${(100 / (cfg.ctrl.length + 1)) * (i + 1)}%`;
    jack(s, `${name}:${label}`, label, `ctrl top ${dir}`, { left });
  });
  const knobs = el('div', 'knobs', s);
  const switches = el('div', 'switches', s);
  const badge = el('div', 'badge', s);
  const led = el('span', 'led', badge);
  const h = el('h2', null, badge);
  h.textContent = name;
  const foot = el('div', 'footer', s);
  pedals[name] = s;
  leds[name] = led;
  return { knobs, switches, foot, section: s };
}

const secs = (v) => (v < 10 ? v.toFixed(2) : v.toFixed(1)) + 's';
const pct = (v) => Math.round(v * 100) + '%';
const tgt = (param, v, tc = 0.05) => nodes && param.setTargetAtTime(v, ctx.currentTime, tc);

function buildUI() {
  const root = document.getElementById('board');
  knob(document.getElementById('headerKnobs'), 'volume', 'volume', 0, 1, 0.6, { fmt: pct, onChange: (v) => tgt(nodes.master.gain, v) });
  jack(document.getElementById('mainJack'), 'main:in', 'main in', 'audio main', {});

  const sun = pedal('voice', 'baby', root);
  knob(sun.knobs, 'shape', 'shape', 0, 1, 0.55, { fmt: pct });
  knob(sun.knobs, 'warmth', 'warmth', 0, 1, 0.4, { fmt: pct });
  knob(sun.knobs, 'drift', 'drift', 0, 1, 0.25, { fmt: pct });
  knob(sun.knobs, 'halo', 'octaves', 0, 1, 0.4, { fmt: pct });
  knob(sun.knobs, 'haloTime', 'echo time', 0.1, 3, 0.75, { fmt: secs, curve: 2 });
  knob(sun.knobs, 'haloColor', 'darken', 0, 1, 0.4, { fmt: pct });
  const pads = el('div', 'pads');
  const oct = el('div', 'octave');
  const down = el('button', 'octbtn', oct);
  down.textContent = '−';
  down.addEventListener('click', () => shiftOctave(-1));
  const octLabel = el('span', null, oct);
  octLabel.id = 'octLabel';
  const up = el('button', 'octbtn', oct);
  up.textContent = '+';
  up.addEventListener('click', () => shiftOctave(1));
  const octHint = el('small', null, oct);
  octHint.textContent = 'z / x';
  select(sun.switches, 'source', 'source', ['synth', 'samples'], 'synth');
  select(sun.switches, 'haloMode', 'direction', HALO_MODES, 'up');
  toggle(sun.switches, 'answer', 'reply', true);
  const chord = select(sun.switches, 'chord', 'auto chord', Object.keys(CHORDS), 'C min7');
  chord.wrap.classList.add('hidden');
  toggle(sun.switches, 'auto', 'auto', false, (v) => {
    chord.wrap.classList.toggle('hidden', !v);
    if (ctx) nextAutoTime = ctx.currentTime + 0.3;
  });
  sun.switches.appendChild(chord.wrap);
  sun.foot.appendChild(oct);
  sun.foot.appendChild(pads);
  rebuildPads(pads);
  showOctave();
  const drop = el('div', 'drop', sun.foot);
  drop.innerHTML = '<span>drop your own notes (<b>C4.wav</b>, <b>Eb3.aif</b>…) or</span>';
  const file = el('input', null, drop);
  file.type = 'file';
  file.multiple = true;
  file.accept = 'audio/*';
  file.addEventListener('change', () => loadSamples(file.files));
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); loadSamples(e.dataTransfer.files); });
  el('span', 'sampleInfo', drop).id = 'sampleInfo';

  const haze = pedal('space', 'pink', root);
  knob(haze.knobs, 'delayTime', 'time', 0.05, 2, 0.42, { fmt: secs, curve: 2, onChange: (v) => tgt(nodes.delay.delayTime, v, 0.2) });
  knob(haze.knobs, 'delayFb', 'feedback', 0, 0.98, 0.55, { fmt: pct, onChange: (v) => tgt(nodes.delayFb.gain, v) });
  knob(haze.knobs, 'wash', 'reverb', 0, 1, 0.5, { fmt: pct, onChange: applyWash });
  knob(haze.knobs, 'hazeTone', 'tone', 0, 1, 0.5, { fmt: pct, onChange: applyHazeTone });
  knob(haze.knobs, 'inputLevel', 'line in', 0, 2, 1, { fmt: pct, onChange: (v) => tgt(nodes.inputGain.gain, v) });
  select(haze.switches, 'hazeMode', 'mode', ['reverb', 'delay', 'both'], 'both', applyWash);
  toggle(haze.switches, 'breathe', 'sway', true);
  const listen = toggle(haze.switches, 'listen', 'line in', false, (v) => (v ? enableInput() : disableInput()));
  const device = select(haze.switches, 'inputDevice', 'device', ['default'], 'default', () => { if (P.listen) enableInput(); });
  device.wrap.classList.add('hidden');
  device.wrap.id = 'deviceWrap';
  listen.btn.id = 'listenBtn';

  const tide = pedal('tape', 'sea', root);
  knob(tide.knobs, 'tideLen', 'length', 2, 60, 20, { step: 1, fmt: secs, onChange: (v) => nodes.tide.port.postMessage({ type: 'length', value: v }) });
  knob(tide.knobs, 'tideDecay', 'decay', 0.5, 1, 0.9, { step: 0.005, fmt: pct, onChange: (v) => nodes.tide.port.postMessage({ type: 'decay', value: v }) });
  knob(tide.knobs, 'wear', 'wear', 0, 1, 0.35, { fmt: pct, onChange: applyWear });
  knob(tide.knobs, 'tideMix', 'level', 0, 1, 0.8, { fmt: pct, onChange: (v) => tgt(nodes.tideGain.gain, v) });
  knob(tide.knobs, 'duck', 'duck', 0, 1, 0.4, { fmt: pct });
  knob(tide.knobs, 'glow', 'drive', 0, 1, 0.3, { fmt: pct, onChange: applyGlow });
  select(tide.switches, 'tideSpeed', 'speed', TIDE_SPEEDS, '1', (v) => nodes && nodes.tide.port.postMessage({ type: 'rate', value: parseFloat(v) }));
  toggle(tide.switches, 'tideRecord', 'record', true, (v) => nodes && nodes.tide.port.postMessage({ type: 'record', value: v }));
  toggle(tide.switches, 'pulse', 'pump', true);
  select(tide.switches, 'snippet', 'snippet', ['off', 'keys', 'drone'], 'off', applySnippetMode);
  footswitch(tide.foot, 'erase', () => { if (nodes) nodes.tide.port.postMessage({ type: 'clear' }); tidePeaks.fill(0); });
  const grab = footswitch(tide.foot, 'grab', () => { if (nodes) nodes.tide.port.postMessage({ type: 'grab', seconds: 2 }); });
  grab.classList.add('grab');
  grab.parentElement.id = 'grabWrap';

  const under = pedal('memory', 'gold', root);
  knob(under.knobs, 'habitMix', 'level', 0, 1, 0.5, { fmt: pct, onChange: (v) => tgt(nodes.habitWet.gain, v) });
  knob(under.knobs, 'habitRepeats', 'repeats', 0, 0.95, 0.4, { fmt: pct });
  knob(under.knobs, 'habitSize', 'size', 0.05, 6, 1.0, { fmt: secs, curve: 2 });
  knob(under.knobs, 'habitModify', 'modify', 0, 1, 0.4, { fmt: pct });
  knob(under.knobs, 'habitSpread', 'spread', 0, 1, 0, { fmt: pct });
  knob(under.knobs, 'habitScan', 'scan', 0, 1, 0.3, { fmt: pct });
  select(under.switches, 'habitMod', 'modifier', UNDERTOW_MODS, 'stepped speed');
  select(under.switches, 'habitRoute', 'route', ['in', 'out', 'feed'], 'out', applyHabitRoute);
  select(under.switches, 'scanMode', 'scan mode', ['random', 'manual', 'follow tape'], 'random');
  footswitch(under.foot, 'clear', () => {
    if (nodes) nodes.habit.port.postMessage({ type: 'clear' });
    memoryPeaks.fill(0);
    memoryFilled = 0;
  });
}

function padNotes() {
  return KEY_ROW.split('').map((_, i) => i);
}

function rebuildPads(container) {
  container.innerHTML = '';
  padNotes().forEach((iv, i) => {
    const b = el('button', 'pad' + (NOTE_NAMES[iv % 12].length > 1 ? ' black' : ''), container);
    const octave = Math.floor((48 + iv + keyOctave * 12) / 12) - 1;
    b.innerHTML = `${NOTE_NAMES[iv % 12]}${octave}<small>${KEY_ROW[i]}</small>`;
    b.addEventListener('pointerdown', () => playPad(i));
  });
}

function showOctave() {
  const base = 3 + keyOctave;
  document.getElementById('octLabel').textContent = `C${base} – C${base + 1}`;
  rebuildPads(document.querySelector('.pads'));
}

function shiftOctave(dir) {
  keyOctave = Math.max(-2, Math.min(2, keyOctave + dir));
  showOctave();
}

function playPad(i) {
  if (!nodes) return;
  const midi = 48 + padNotes()[i] + keyOctave * 12;
  playedNotes.push(midi);
  if (playedNotes.length > 16) playedNotes.shift();
  triggerWithHalo(midi, 0.8, ctx.currentTime + 0.01);
  flashPad(i);
}

function flashPad(i) {
  const pad = document.querySelectorAll('.pad')[i];
  if (!pad) return;
  pad.classList.add('lit');
  setTimeout(() => pad.classList.remove('lit'), 150);
}

function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

async function loadSamples(files) {
  if (!ctx) ctx = new AudioContext();
  const loaded = [];
  for (const f of files) {
    try {
      const buffer = await ctx.decodeAudioData(await f.arrayBuffer());
      const m = f.name.match(/([A-Ga-g])([#b]?)(-?\d)/);
      let midi = 60;
      if (m) {
        const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1].toLowerCase()];
        midi = 12 * (parseInt(m[3], 10) + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
      }
      loaded.push({ midi, buffer, name: f.name });
    } catch (err) {
      console.warn('could not decode', f.name, err);
    }
  }
  if (!loaded.length) return;
  samples = loaded.sort((a, b) => a.midi - b.midi);
  P.source = 'samples';
  document.querySelectorAll('select').forEach((s) => { if ([...s.options].some((o) => o.value === 'samples')) s.value = 'samples'; });
  document.getElementById('sampleInfo').textContent = `${samples.length} loaded: ${samples.map((s) => s.name).join(', ')}`;
}

async function enableInput() {
  if (!running) await start();
  disableInput();
  const constraints = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };
  if (P.inputDevice && P.inputDevice !== 'default') constraints.deviceId = { exact: P.inputDevice };
  try {
    inputStream = await navigator.mediaDevices.getUserMedia({ audio: constraints });
  } catch (err) {
    console.warn('input denied', err);
    document.getElementById('listenBtn').classList.remove('active');
    P.listen = false;
    return;
  }
  nodes.inputSource = new MediaStreamAudioSourceNode(ctx, { mediaStream: inputStream });
  nodes.inputSource.connect(nodes.inputGain);
  const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput');
  const sel = document.querySelector('#deviceWrap select');
  const current = P.inputDevice;
  sel.innerHTML = '';
  devices.forEach((d) => {
    const opt = el('option', null, sel);
    opt.value = d.deviceId;
    opt.textContent = (d.label || 'input').replace(/\s*\(.*\)$/, '').slice(0, 22);
  });
  if ([...sel.options].some((o) => o.value === current)) sel.value = current;
  else if (devices.length) { sel.value = devices[0].deviceId; P.inputDevice = devices[0].deviceId; }
  document.getElementById('deviceWrap').classList.remove('hidden');
}

function disableInput() {
  if (nodes && nodes.inputSource) {
    nodes.inputSource.disconnect();
    nodes.inputSource = null;
  }
  if (inputStream) {
    inputStream.getTracks().forEach((t) => t.stop());
    inputStream = null;
  }
}

async function start() {
  if (running) return;
  if (!ctx) ctx = new AudioContext();
  await ctx.resume();
  const blob = new Blob([PROCESSOR_SOURCE], { type: 'application/javascript' });
  await ctx.audioWorklet.addModule(URL.createObjectURL(blob));
  nodes = buildGraph();
  running = true;
  nextGrainTime = ctx.currentTime + 2;
  setInterval(tick, 40);
  document.getElementById('start').textContent = 'pause';
}

function buildGraph() {
  const n = {};
  n.voiceBus = new GainNode(ctx, { gain: 0.5 });
  n.inputGain = new GainNode(ctx, { gain: P.inputLevel });
  n.hazeIn = new GainNode(ctx, { gain: 1 });
  n.voiceBus.connect(n.hazeIn);
  n.inputGain.connect(n.hazeIn);

  n.delay = new DelayNode(ctx, { delayTime: P.delayTime, maxDelayTime: 3 });
  n.delayFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 2200, Q: 0.5 });
  n.delayFb = new GainNode(ctx, { gain: P.delayFb });
  n.delayOut = new GainNode(ctx, { gain: 0 });
  n.hazeIn.connect(n.delay);
  n.delay.connect(n.delayFilter);
  n.delayFilter.connect(n.delayFb);
  n.delayFb.connect(n.delay);
  n.delayFilter.connect(n.delayOut);

  n.reverb = new ConvolverNode(ctx);
  n.reverbFilter = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 3000, Q: 0.3 });
  n.reverbOut = new GainNode(ctx, { gain: 0 });
  n.hazeIn.connect(n.reverb);
  n.reverb.connect(n.reverbFilter).connect(n.reverbOut);

  n.dryOut = new GainNode(ctx, { gain: 1 });
  n.hazeIn.connect(n.dryOut);

  n.hazeWet = new GainNode(ctx, { gain: 1 });
  n.delayOut.connect(n.hazeWet);
  n.reverbOut.connect(n.hazeWet);
  n.hazeSum = new GainNode(ctx, { gain: 1 });
  n.hazeWet.connect(n.hazeSum);
  n.dryOut.connect(n.hazeSum);

  n.tide = new AudioWorkletNode(ctx, 'tape-loop', { numberOfInputs: 1, numberOfOutputs: 2, outputChannelCount: [1, 1] });
  n.hazeSum.connect(n.tide);
  n.tideGain = new GainNode(ctx, { gain: P.tideMix });
  n.tideSend = new GainNode(ctx, { gain: 0.15 });
  n.tide.connect(n.tideGain, 1);
  n.tideGain.connect(n.tideSend);
  n.tideSend.connect(n.hazeIn);
  n.tide.port.onmessage = (e) => {
    if (e.data.type === 'seg') {
      tidePeaks[e.data.seg] = e.data.peak;
      tidePos = e.data.pos;
    } else if (e.data.type === 'snippet') {
      receiveSnippet(e.data.data, e.data.peak);
    }
  };
  n.tide.port.postMessage({ type: 'length', value: P.tideLen });
  n.tide.port.postMessage({ type: 'decay', value: P.tideDecay });
  n.tide.port.postMessage({ type: 'rate', value: parseFloat(P.tideSpeed) });
  n.tide.port.postMessage({ type: 'record', value: P.tideRecord });

  n.habitIn = new GainNode(ctx, { gain: 1 });
  n.tide.connect(n.habitIn, 0);
  n.tideGain.connect(n.habitIn);

  n.habit = new AudioWorkletNode(ctx, 'habit-memory', { numberOfInputs: 1, numberOfOutputs: 2, outputChannelCount: [1, 1] });
  n.habitIn.connect(n.habit);
  n.habitWet = new GainNode(ctx, { gain: P.habitMix });
  n.masterIn = new GainNode(ctx, { gain: 1 });
  n.habit.connect(n.masterIn, 0);
  n.habit.connect(n.habitWet, 1);
  n.habitWet.connect(n.masterIn);
  n.habit.port.onmessage = (e) => {
    if (e.data.type === 'peak') {
      memoryPeaks.push(e.data.value);
      memoryPeaks.shift();
      memoryFilled = e.data.filled;
    }
  };

  n.wowDelay = new DelayNode(ctx, { delayTime: 0.02, maxDelayTime: 0.1 });
  n.wowLfo = new OscillatorNode(ctx, { type: 'sine', frequency: 0.4 });
  n.wowDepth = new GainNode(ctx, { gain: 0 });
  n.flutterLfo = new OscillatorNode(ctx, { type: 'sine', frequency: 7.3 });
  n.flutterDepth = new GainNode(ctx, { gain: 0 });
  n.wowLfo.connect(n.wowDepth).connect(n.wowDelay.delayTime);
  n.flutterLfo.connect(n.flutterDepth).connect(n.wowDelay.delayTime);
  n.wowLfo.start();
  n.flutterLfo.start();
  n.masterIn.connect(n.wowDelay);

  n.tone = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 8000, Q: 0.3 });
  n.preDrive = new GainNode(ctx, { gain: 1 });
  n.shaper = new WaveShaperNode(ctx, { oversample: '2x' });
  n.comp = new DynamicsCompressorNode(ctx, { threshold: -18, ratio: 3, attack: 0.01, release: 0.4 });
  n.master = new GainNode(ctx, { gain: P.volume });
  n.analyser = new AnalyserNode(ctx, { fftSize: 2048 });
  n.wowDelay.connect(n.tone).connect(n.preDrive).connect(n.shaper).connect(n.comp).connect(n.master).connect(n.analyser).connect(ctx.destination);

  n.meters = {};
  const meter = (src, key) => {
    const a = new AnalyserNode(ctx, { fftSize: 2048 });
    src.connect(a);
    n.meters[key] = a;
  };
  meter(n.hazeIn, 'sun');
  meter(n.hazeWet, 'haze');
  meter(n.tideGain, 'tide');
  meter(n.habitWet, 'under');

  n.crackle = new GainNode(ctx, { gain: 0 });
  buildCrackle(n);
  n.crackle.connect(n.comp);

  nodes = n;
  applyGlow();
  applyWash();
  applyHazeTone();
  applyWear();
  applyHabitRoute();
  return n;
}

function buildCrackle(n) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let hiss = 0;
  for (let i = 0; i < len; i++) {
    hiss = hiss * 0.92 + (Math.random() * 2 - 1) * 0.08;
    let v = hiss * 0.6;
    if (Math.random() < 0.00012) v += (Math.random() * 2 - 1) * 6;
    d[i] = v;
  }
  const src = new AudioBufferSourceNode(ctx, { buffer: buf, loop: true });
  const hp = new BiquadFilterNode(ctx, { type: 'highpass', frequency: 1200 });
  src.connect(hp).connect(n.crackle);
  src.start();
}

function applyGlow() {
  const drive = P.glow;
  const k = 1 + drive * 6;
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * k) / Math.sqrt(k);
  }
  nodes.shaper.curve = curve;
  tgt(nodes.tone.frequency, 12000 - drive * 8500, 0.1);
}

let reverbTimer;
function applyWash() {
  if (!nodes) return;
  const mode = P.hazeMode;
  const mix = P.wash;
  const t = ctx.currentTime;
  nodes.delayOut.gain.setTargetAtTime(mode === 'reverb' ? 0 : mix, t, 0.1);
  nodes.reverbOut.gain.setTargetAtTime(mode === 'delay' ? 0 : mix * 1.6, t, 0.1);
  nodes.dryOut.gain.setTargetAtTime(1 - mix * 0.5, t, 0.1);
  clearTimeout(reverbTimer);
  reverbTimer = setTimeout(rebuildReverb, 150);
}

function applyHazeTone() {
  if (!nodes) return;
  const f = 400 * Math.pow(20, P.hazeTone);
  tgt(nodes.delayFilter.frequency, f, 0.1);
  tgt(nodes.reverbFilter.frequency, f * 1.5, 0.1);
}

function applyWear() {
  if (!nodes) return;
  const w = P.wear;
  nodes.tide.port.postMessage({ type: 'tone', value: 1 - w * 0.9 });
  nodes.tide.port.postMessage({ type: 'crush', hold: 1 + Math.floor(w * w * 6), levels: w > 0.3 ? Math.round(4096 * Math.pow(1 - w, 2.5)) : 0 });
  tgt(nodes.wowDepth.gain, w * 0.004, 0.1);
  tgt(nodes.flutterDepth.gain, w * w * 0.0008, 0.1);
  tgt(nodes.crackle.gain, w * 0.06, 0.1);
}

function rebuildReverb() {
  const seconds = 0.8 + P.wash * 7;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const env = Math.pow(1 - t, 2.2) * (i < 200 ? i / 200 : 1);
      lp += ((Math.random() * 2 - 1) - lp) * (0.35 - t * 0.3);
      d[i] = lp * env;
    }
  }
  nodes.reverb.buffer = buf;
}

function applyHabitRoute() {
  if (!nodes) return;
  nodes.habit.port.postMessage({ type: 'feed', value: P.habitRoute === 'feed' ? 0.5 : 0 });
}

function shapeParams() {
  const s = P.shape;
  return {
    a: 0.01 + s * s * 1.5,
    d: 0.1 + s * 3,
    sus: 0.15 + s * 0.75,
    hold: 0.2 + s * 4,
    r: 0.3 + s * 5,
  };
}

function envelope(amp, vel, t) {
  const { a, d, sus, hold, r } = shapeParams();
  amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(vel, t + a);
  amp.gain.setTargetAtTime(vel * sus, t + a, d / 3);
  const off = t + a + hold;
  amp.gain.setTargetAtTime(0, off, r / 4);
  return off + r * 1.5 + 0.1;
}

function driftCents() {
  return (Math.random() * 2 - 1) * P.drift * 30;
}

function wobble(param, baseCents, t, end) {
  if (P.drift <= 0) return;
  const lfo = new OscillatorNode(ctx, { type: 'sine', frequency: 0.2 + Math.random() * 0.5 });
  const depth = new GainNode(ctx, { gain: P.drift * 10 });
  lfo.connect(depth).connect(param);
  param.setValueAtTime(baseCents, t);
  lfo.start(t);
  lfo.stop(end);
}

function receiveSnippet(data, peak) {
  if (!data.length || peak < 0.002) {
    document.querySelector('#grabWrap label').textContent = 'grab (silent)';
    return;
  }
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
  buf.copyToChannel(data, 0);
  snippet = buf;
  document.querySelector('#grabWrap label').textContent = `grab · ${(data.length / ctx.sampleRate).toFixed(1)}s`;
  document.querySelector('#grabWrap button').classList.add('lit');
  if (P.snippet === 'off') {
    P.snippet = 'keys';
    document.querySelectorAll('select').forEach((sel) => { if ([...sel.options].some((o) => o.value === 'drone')) sel.value = 'keys'; });
  }
  applySnippetMode();
}

function snippetRate(midi) {
  return Math.pow(2, (midi - 48) / 12);
}

function playSnippet(midi, vel, t, color = 1) {
  const src = new AudioBufferSourceNode(ctx, { buffer: snippet, playbackRate: snippetRate(midi), loop: true });
  src.detune.value = driftCents();
  const filt = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: (800 + Math.pow(P.warmth, 1.5) * 12000) * color, Q: 0.5 });
  const amp = new GainNode(ctx, { gain: 0 });
  src.connect(filt).connect(amp).connect(nodes.voiceBus);
  const end = envelope(amp, vel * 0.8, t);
  src.start(t);
  src.stop(end);
  wobble(src.detune, src.detune.value, t, end);
}

function applySnippetMode() {
  if (!nodes) return;
  if (drone) {
    drone.amp.gain.setTargetAtTime(0, ctx.currentTime, 0.3);
    drone.src.stop(ctx.currentTime + 1.5);
    drone = null;
  }
  if (P.snippet === 'drone' && snippet) {
    const src = new AudioBufferSourceNode(ctx, { buffer: snippet, playbackRate: droneRate, loop: true });
    const amp = new GainNode(ctx, { gain: 0 });
    src.connect(amp).connect(nodes.voiceBus);
    amp.gain.setTargetAtTime(0.6, ctx.currentTime, 0.4);
    src.start();
    drone = { src, amp };
  }
}

function playVoice(midi, vel, t, color = 1) {
  if (P.snippet === 'drone' && drone) {
    droneRate = snippetRate(midi);
    drone.src.playbackRate.setTargetAtTime(droneRate, t, 0.05);
    return;
  }
  if (P.snippet === 'keys' && snippet) return playSnippet(midi, vel, t, color);
  if (P.source === 'samples' && samples.length) return playSample(midi, vel, t, color);
  const freq = midiToFreq(midi);
  const cents = driftCents();
  const { a } = shapeParams();
  const osc1 = new OscillatorNode(ctx, { type: 'triangle', frequency: freq, detune: cents });
  const osc2 = new OscillatorNode(ctx, { type: 'sine', frequency: freq * 0.5, detune: cents });
  const osc3 = new OscillatorNode(ctx, { type: 'triangle', frequency: freq, detune: cents + 6 });
  const subGain = new GainNode(ctx, { gain: 0.5 });
  const filt = new BiquadFilterNode(ctx, { type: 'lowpass', Q: 0.7 });
  const amp = new GainNode(ctx, { gain: 0 });
  osc1.connect(filt);
  osc3.connect(filt);
  osc2.connect(subGain).connect(filt);
  filt.connect(amp).connect(nodes.voiceBus);
  const base = (300 + Math.pow(P.warmth, 1.5) * 3500) * color;
  filt.frequency.setValueAtTime(base * 0.4, t);
  filt.frequency.linearRampToValueAtTime(base * 1.8, t + a);
  filt.frequency.setTargetAtTime(base, t + a, 0.5);
  const end = envelope(amp, vel * 0.35, t);
  [osc1, osc2, osc3].forEach((o) => { o.start(t); o.stop(end); wobble(o.detune, o.detune.value, t, end); });
}

function playSample(midi, vel, t, color) {
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
  const src = new AudioBufferSourceNode(ctx, { buffer: best.buffer, playbackRate: Math.pow(2, (midi - best.midi) / 12), loop: true });
  src.detune.value = driftCents();
  const filt = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: (800 + Math.pow(P.warmth, 1.5) * 12000) * color, Q: 0.5 });
  const amp = new GainNode(ctx, { gain: 0 });
  src.connect(filt).connect(amp).connect(nodes.voiceBus);
  const end = envelope(amp, vel * 0.6, t);
  src.start(t);
  src.stop(end);
  wobble(src.detune, src.detune.value, t, end);
}

function duckTide(t) {
  if (!P.duck) return;
  const g = nodes.tideGain.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(P.tideMix * (1 - P.duck * 0.85), t, 0.03);
  g.setTargetAtTime(P.tideMix, t + 0.25, 0.4 + P.duck * 0.6);
  flash('sun-tide');
}

function triggerWithHalo(midi, vel, t) {
  duckTide(t);
  const humanize = P.drift * 0.08 * Math.random();
  playVoice(midi, vel * (1 - P.drift * 0.3 * Math.random()), t + humanize);
  let m = midi;
  let g = vel;
  let when = t + humanize;
  let color = 1;
  const repeats = Math.round(P.halo * 6);
  const decay = 0.4 + P.halo * 0.5;
  const jitter = P.drift * 0.3;
  for (let i = 1; i <= repeats; i++) {
    const mode = P.haloMode;
    let shift = 0;
    if (mode === 'up') shift = 1;
    else if (mode === 'down') shift = -1;
    else if (mode === 'alternate') { shift = haloAlternate; haloAlternate = -haloAlternate; }
    else if (mode === 'random') shift = [-1, 0, 1][Math.floor(Math.random() * 3)];
    m += shift * 12;
    if (m > 96) m -= 24;
    if (m < 24) m += 24;
    g *= decay;
    color *= 1 - P.haloColor * 0.45;
    when += P.haloTime * (1 + (Math.random() * 2 - 1) * jitter * 0.5);
    playVoice(m, g, when, color);
  }
}

let nextGrainTime = 0;
let nextAutoTime = 0;
let scanWalk = 0.3;

function tick() {
  if (!running) return;
  const now = ctx.currentTime;
  if (P.auto) {
    while (nextAutoTime < now + 0.2) {
      const intervals = CHORDS[P.chord];
      const iv = intervals[Math.floor(Math.random() * intervals.length)];
      const oct = Math.floor(Math.random() * 3) - 1;
      const midi = 48 + iv + oct * 12;
      playedNotes.push(midi);
      if (playedNotes.length > 16) playedNotes.shift();
      triggerWithHalo(midi, 0.5 + Math.random() * 0.4, nextAutoTime);
      nextAutoTime += -Math.log(1 - Math.random()) * 3 + 0.3;
    }
  }
  if (nextGrainTime < now) {
    fireUndertow();
    nextGrainTime = now + P.habitSize * (0.8 + Math.random() * 1.2) + 0.1;
  }
}

function fireUndertow() {
  if (memoryFilled < 1) return;
  const size = Math.min(P.habitSize, memoryFilled * 0.8);
  if (P.scanMode === 'random') {
    scanWalk += (Math.random() - 0.5) * 0.25;
    if (Math.random() < 0.08) scanWalk = Math.random();
    scanWalk = Math.min(1, Math.max(0, scanWalk));
  } else if (P.scanMode === 'follow tape') {
    scanWalk = 1 - tidePos;
    flash('tide-under');
  } else {
    scanWalk = P.habitScan;
  }
  const maxBack = Math.max(0, memoryFilled - size - 0.05);
  const back = size + 0.05 + scanWalk * maxBack;
  lastScanBack = back;
  const taps = [back];
  if (P.habitSpread > 0) {
    taps.push(Math.min(memoryFilled - 0.05, back + P.habitSpread * Math.max(2, memoryFilled * 0.5)));
  }
  taps.forEach((b, i) => sendGrain(b, size, i === 0 ? 1 : 0.8));
  if (P.answer && playedNotes.length && Math.random() < 0.45) {
    const midi = playedNotes[Math.floor(Math.random() * playedNotes.length)];
    const oct = [-12, 0, 0, 12][Math.floor(Math.random() * 4)];
    triggerWithHalo(midi + oct, 0.3 + Math.random() * 0.2, ctx.currentTime + 0.05 + Math.random() * 0.3);
    flash('under-sun');
  }
  if (P.pulse) {
    const g = nodes.preDrive.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(1.5 + P.habitModify, t, 0.02);
    g.setTargetAtTime(1, t + 0.15, 0.35);
    flash('under-tide');
  }
}

function sendGrain(back, size, gain) {
  const mod = P.habitMod;
  const amt = P.habitModify;
  const g = {
    type: 'grain',
    back,
    len: size,
    rate: 1,
    gain,
    feedback: P.habitRepeats,
    cutoff: 1,
    accumulate: P.habitRoute === 'in',
    rateMul: 1,
    trimMul: 1,
    dropChance: 0,
  };
  if (mod === 'stepped speed') {
    const steps = [0.5, 2, -1, 0.25, 1.5];
    if (Math.random() < amt) g.rate = steps[Math.floor(Math.random() * steps.length)];
    g.rateMul = g.rate === 1 ? (Math.random() < 0.5 ? 0.5 : 2) : g.rate;
  } else if (mod === 'smooth speed') {
    g.rate = 1 + (Math.random() * 2 - 1) * amt * 0.7;
    g.rateMul = 1 + (Math.random() * 2 - 1) * amt * 0.3;
  } else if (mod === 'trim') {
    g.len = size * (1 - amt * 0.85);
    g.trimMul = 1 - amt * 0.4;
  } else if (mod === 'dropper') {
    g.dropChance = amt;
    if (Math.random() < amt * 0.6) return;
  } else if (mod === 'stutter') {
    const k = 2 + Math.floor(amt * 10);
    const sub = size / k;
    for (let i = 0; i < k; i++) {
      setTimeout(() => nodes && nodes.habit.port.postMessage({ ...g, len: sub, back, feedback: P.habitRepeats * 0.5 }), i * sub * 1000);
    }
    return;
  } else if (mod === 'filter') {
    const fc = 200 + 9000 * Math.pow(1 - amt, 2);
    g.cutoff = 1 - Math.exp(-2 * Math.PI * fc / ctx.sampleRate);
  }
  nodes.habit.port.postMessage(g);
}

function flash(id) {
  flashes[id] = performance.now();
}

const scratch = new Float32Array(2048);
function readLevels() {
  if (!nodes) return;
  for (const key of Object.keys(nodes.meters)) {
    nodes.meters[key].getFloatTimeDomainData(scratch);
    let sum = 0;
    for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
    const rms = Math.sqrt(sum / scratch.length);
    levels[key] = Math.max(rms, levels[key] * 0.9);
  }
  const map = { voice: 'sun', space: 'haze', tape: 'tide', memory: 'under' };
  for (const [name, key] of Object.entries(map)) {
    const v = Math.min(1, levels[key] * 5);
    leds[name].style.setProperty('--lit', v.toFixed(2));
  }
}

function breathe() {
  if (!nodes || !P.breathe) return;
  const t = ctx.currentTime;
  const phase = Math.sin(tidePos * Math.PI * 2);
  nodes.delay.delayTime.setTargetAtTime(P.delayTime * (1 + phase * 0.12), t, 0.3);
  const swell = Math.min(1, levels.tide * 3);
  nodes.reverbOut.gain.setTargetAtTime(P.hazeMode === 'delay' ? 0 : P.wash * 1.6 * (1 + swell * 0.8), t, 0.3);
}

const AUDIO_CABLES = [
  { from: 'voice:out', to: 'space:in', level: 'sun' },
  { from: 'space:out', to: 'tape:in', level: 'haze' },
  { from: 'tape:out', to: 'memory:in', level: 'tide' },
  { from: 'memory:out', to: 'main:in', level: 'under', kind: 'main' },
];

const CONTROL_CABLES = [
  { from: 'voice:note', to: 'tape:duck', color: 'baby', label: 'each note ducks the tape', on: () => P.duck > 0, flashId: 'sun-tide' },
  { from: 'memory:pull', to: 'voice:reply', color: 'gold', label: 'memory pulls replay a note you played', on: () => P.answer, flashId: 'under-sun' },
  { from: 'memory:pull', to: 'tape:pump', color: 'gold', label: 'memory pulls pump the drive', on: () => P.pulse, flashId: 'under-tide' },
  { from: 'tape:loop', to: 'memory:sync', color: 'sea', label: 'loop position steers the scan', on: () => P.scanMode === 'follow tape', flashId: 'tide-under' },
  { from: 'tape:loop', to: 'space:sway', color: 'sea', label: 'loop position sways the delay', on: () => P.breathe, level: 'tide' },
];

function jackPoint(key) {
  const r = jacks[key].getBoundingClientRect();
  return [r.left + r.width / 2 + scrollX, r.top + r.height / 2 + scrollY];
}

function cablePath(p1, p2, kind) {
  if (kind === 'main') {
    const edge = document.documentElement.scrollWidth - 12;
    return `M${p1[0]},${p1[1]} C${p1[0] + 40},${p1[1] + 10} ${edge},${p1[1] + 20} ${edge},${p1[1] - 40} L${edge},${p2[1] + 50} C${edge},${p2[1] + 4} ${p2[0] + 30},${p2[1] + 2} ${p2[0]},${p2[1]}`;
  }
  if (kind === 'audio') {
    const dx = Math.abs(p2[0] - p1[0]);
    const dy = p2[1] - p1[1];
    const reach = Math.max(30, Math.min(90, dx * 0.5));
    const sag = dy < -40 ? 0 : 24 + dx * 0.08;
    return `M${p1[0]},${p1[1]} C${p1[0] + reach},${p1[1] + sag} ${p2[0] - reach},${p2[1] + sag} ${p2[0]},${p2[1]}`;
  }
  const dx = Math.abs(p2[0] - p1[0]);
  const lift = 28 + dx * 0.05;
  return `M${p1[0]},${p1[1]} C${p1[0]},${p1[1] - lift} ${p2[0]},${p2[1] - lift} ${p2[0]},${p2[1]}`;
}

function drawCables() {
  const svg = document.getElementById('cables');
  svg.setAttribute('width', document.documentElement.scrollWidth);
  svg.setAttribute('height', document.documentElement.scrollHeight);
  const now = performance.now();
  const parts = [];
  const tags = [];
  AUDIO_CABLES.forEach((c) => {
    const p1 = jackPoint(c.from);
    const p2 = jackPoint(c.to);
    const d = cablePath(p1, p2, c.kind || 'audio');
    const glow = Math.min(1, (levels[c.level] || 0) * 4);
    parts.push(`<path d="${d}" stroke="${COLORS.ink}" stroke-width="7" fill="none" stroke-linecap="round"/>`);
    parts.push(`<path d="${d}" stroke="#4a5160" stroke-width="4" fill="none" stroke-linecap="round"/>`);
    if (glow > 0.03) parts.push(`<path d="${d}" stroke="${COLORS.paper}" stroke-width="1.5" fill="none" stroke-linecap="round" opacity="${glow}" stroke-dasharray="4 12"/>`);
    [p1, p2].forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="4" fill="${COLORS.ink}"/>`));
  });
  CONTROL_CABLES.forEach((c) => {
    const active = c.on();
    jacks[c.to].classList.toggle('connected', active);
    if (!active) return;
    jacks[c.from].classList.add('connected');
    const p1 = jackPoint(c.from);
    const p2 = jackPoint(c.to);
    const d = cablePath(p1, p2, 'ctrl');
    let glow = 0;
    if (c.flashId) glow = Math.max(0, 1 - (now - (flashes[c.flashId] || -1e9)) / 900);
    else glow = Math.min(1, (levels[c.level] || 0) * 4);
    const stroke = COLORS[c.color];
    parts.push(`<path d="${d}" stroke="${COLORS.ink}" stroke-width="5" fill="none" stroke-linecap="round"/>`);
    parts.push(`<path d="${d}" stroke="${stroke}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
    if (glow > 0.03) parts.push(`<path d="${d}" stroke="${COLORS.paper}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="${glow}" stroke-dasharray="4 10"/>`);
    [p1, p2].forEach(([x, y]) => parts.push(`<circle cx="${x}" cy="${y}" r="3" fill="${COLORS.ink}"/>`));
    const dx = Math.abs(p2[0] - p1[0]);
    const lift = 28 + dx * 0.05;
    const t = [0.5, 0.3, 0.68, 0.42, 0.58][CONTROL_CABLES.indexOf(c)] || 0.5;
    const u = 1 - t;
    const mx = u * u * u * p1[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p2[0];
    const my = u * u * u * p1[1] + 3 * u * u * t * (p1[1] - lift) + 3 * u * t * t * (p2[1] - lift) + t * t * t * p2[1];
    const tw = c.label.length * 6.2 + 16;
    tags.push(`<g transform="translate(${mx - tw / 2},${my - 9})"><rect width="${tw}" height="18" rx="4" fill="${COLORS.paper}" stroke="${COLORS.ink}" stroke-width="1.5"/><rect x="0" y="0" width="5" height="18" rx="2" fill="${stroke}"/><text x="${tw / 2 + 2}" y="12.5" text-anchor="middle" font-family="Space Mono, monospace" font-size="9" font-weight="700" fill="${COLORS.ink}">${c.label}</text></g>`);
  });
  const sources = new Set(CONTROL_CABLES.filter((c) => c.on()).map((c) => c.from));
  CONTROL_CABLES.forEach((c) => { if (!sources.has(c.from)) jacks[c.from].classList.remove('connected'); });
  if (jacks['space:line in']) jacks['space:line in'].classList.toggle('connected', !!P.listen);
  svg.innerHTML = parts.join('') + tags.join('');
}

function waveform(c, analyser, w, y0, bandH, color, fill) {
  analyser.getFloatTimeDomainData(scratch);
  c.beginPath();
  for (let i = 0; i < scratch.length; i++) {
    const x = (i / scratch.length) * w;
    const y = y0 + bandH * 0.5 - scratch[i] * bandH * 0.9;
    i === 0 ? c.moveTo(x, y) : c.lineTo(x, y);
  }
  if (fill) {
    c.lineTo(w, y0 + bandH * 0.5);
    c.lineTo(0, y0 + bandH * 0.5);
    c.closePath();
    c.fillStyle = color;
    c.globalAlpha = 0.55;
    c.fill();
    c.globalAlpha = 1;
  }
  c.strokeStyle = color;
  c.stroke();
}

function draw() {
  readLevels();
  breathe();
  drawCables();
  const canvas = document.getElementById('scope');
  const c = canvas.getContext('2d');
  const dpr = devicePixelRatio;
  const w = canvas.width = canvas.clientWidth * dpr;
  const h = canvas.height = canvas.clientHeight * dpr;
  c.fillStyle = COLORS.paper;
  c.fillRect(0, 0, w, h);
  const band = h / 3;
  c.strokeStyle = 'rgba(31,36,48,0.18)';
  c.lineWidth = dpr;
  c.setLineDash([2 * dpr, 4 * dpr]);
  for (let x = 0; x < w; x += w / 24) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, h); c.stroke(); }
  c.setLineDash([]);
  c.beginPath(); c.moveTo(0, band); c.lineTo(w, band); c.moveTo(0, band * 2); c.lineTo(w, band * 2); c.stroke();

  c.font = `bold ${10 * dpr}px "Space Mono", ui-monospace, Menlo, monospace`;
  c.textBaseline = 'top';

  const tn = tidePeaks.length;
  c.fillStyle = COLORS.sea;
  for (let i = 0; i < tn; i++) {
    const bh = Math.max(1.5 * dpr, Math.min(1, tidePeaks[i] * 1.6) * band * 0.85);
    c.fillRect((i / tn) * w, band / 2 - bh / 2, Math.max(dpr, (w / tn) * 0.45), bh);
  }
  c.fillStyle = COLORS.ink;
  c.fillRect(tidePos * w - 1.5 * dpr, 0, 3 * dpr, band);
  c.fillStyle = COLORS.sea;
  c.fillText('TAPE', 8 * dpr, 6 * dpr);

  const n = memoryPeaks.length;
  c.fillStyle = COLORS.gold;
  for (let i = 0; i < n; i++) {
    const bh = Math.max(1.5 * dpr, Math.min(1, memoryPeaks[i] * 1.4) * band * 0.85);
    c.fillRect((i / n) * w, band * 1.5 - bh / 2, Math.max(dpr, (w / n) * 0.45), bh);
  }
  if (memoryFilled > 0 && lastScanBack > 0) {
    const x = w - (lastScanBack / 60) * w;
    const sizeW = (Math.min(P.habitSize, memoryFilled) / 60) * w;
    c.fillStyle = 'rgba(31,36,48,0.18)';
    c.fillRect(x, band, sizeW, band);
    c.fillStyle = COLORS.ink;
    c.fillRect(x - 1.5 * dpr, band, 3 * dpr, band);
  }
  c.fillStyle = '#c9a21c';
  c.fillText('MEMORY', 8 * dpr, band + 6 * dpr);

  if (nodes) {
    c.lineWidth = dpr;
    waveform(c, nodes.meters.sun, w, band * 2, band, COLORS.baby, true);
    waveform(c, nodes.meters.haze, w, band * 2, band, COLORS.pink, false);
  }
  c.fillStyle = '#7fa9ab';
  c.fillText('VOICE', 8 * dpr, band * 2 + 6 * dpr);
  c.fillStyle = COLORS.pink;
  c.fillText('SPACE', 48 * dpr, band * 2 + 6 * dpr);
  requestAnimationFrame(draw);
}

window.addEventListener('keydown', (e) => {
  if (e.repeat || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  if (k === 'z') shiftOctave(-1);
  else if (k === 'x') shiftOctave(1);
  const idx = KEY_ROW.indexOf(k);
  if (idx >= 0 && !heldKeys.has(k)) {
    heldKeys.add(k);
    playPad(idx);
  }
});
window.addEventListener('keyup', (e) => heldKeys.delete(e.key.toLowerCase()));

buildUI();
document.getElementById('randomize').addEventListener('click', randomizeAll);
requestAnimationFrame(draw);
document.getElementById('start').addEventListener('click', async (e) => {
  if (running) {
    if (ctx.state === 'running') { ctx.suspend(); e.target.textContent = 'resume'; }
    else { ctx.resume(); e.target.textContent = 'pause'; }
    return;
  }
  e.target.textContent = 'loading…';
  await start();
});
