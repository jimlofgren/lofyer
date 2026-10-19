const PROCESSOR_SOURCE = `
function fadeGain(i, len, fade) {
  if (i < fade) return 0.5 - 0.5 * Math.cos(Math.PI * i / fade);
  if (i > len - fade) return 0.5 - 0.5 * Math.cos(Math.PI * (len - i) / fade);
  return 1;
}

class TapeLoop extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.segments = 400;
    this.inRing = new Float32Array(this.sr * 6);
    this.inWrite = 0;
    this.setLength(20);
    this.pos = 0;
    this.rate = 1;
    this.decay = 0.92;
    this.tone = 0.6;
    this.record = true;
    this.crushHold = 1;
    this.crushLevels = 0;
    this.holdCount = 0;
    this.held = 0;
    this.lp = 0;
    this.segPeak = 0;
    this.lastSeg = 0;
    this.port.onmessage = (e) => this.handle(e.data);
  }

  setLength(seconds) {
    const len = Math.max(this.sr, Math.floor(seconds * this.sr));
    const next = new Float32Array(len);
    if (this.buf) next.set(this.buf.subarray(0, Math.min(len, this.buf.length)));
    this.buf = next;
    this.len = len;
    this.segLen = len / this.segments;
    if (this.pos >= len) this.pos = 0;
  }

  handle(m) {
    if (m.type === 'length') this.setLength(m.value);
    else if (m.type === 'rate') this.rate = m.value;
    else if (m.type === 'decay') this.decay = m.value;
    else if (m.type === 'tone') this.tone = m.value;
    else if (m.type === 'record') this.record = m.value;
    else if (m.type === 'crush') { this.crushHold = m.hold; this.crushLevels = m.levels; }
    else if (m.type === 'clear') this.buf.fill(0);
    else if (m.type === 'grab') this.grab(m.seconds);
  }

  grab(seconds) {
    const len = Math.min(this.inRing.length, Math.floor(seconds * this.sr));
    const out = new Float32Array(len);
    const R = this.inRing.length;
    let peak = 0;
    for (let i = 0; i < len; i++) {
      out[i] = this.inRing[(this.inWrite - len + i + R) % R];
      if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
    }
    let start = 0;
    while (start < len && Math.abs(out[start]) < peak * 0.05) start++;
    const trimmed = out.subarray(Math.max(0, start - Math.floor(this.sr * 0.01)));
    const fade = Math.min(Math.floor(this.sr * 0.02), trimmed.length >> 1);
    for (let i = 0; i < trimmed.length; i++) trimmed[i] *= fadeGain(i, trimmed.length, fade);
    const copy = new Float32Array(trimmed);
    this.port.postMessage({ type: 'snippet', data: copy, peak }, [copy.buffer]);
  }

  process(inputs, outputs) {
    const inp = inputs[0][0];
    const dry = outputs[0][0];
    const wet = outputs[1][0];
    const n = dry.length;
    const L = this.len;
    if (inp) {
      for (let i = 0; i < n; i++) {
        this.inRing[this.inWrite] = inp[i];
        this.inWrite = (this.inWrite + 1) % this.inRing.length;
      }
    }
    for (let i = 0; i < n; i++) {
      let x = inp ? inp[i] : 0;
      if (this.crushHold > 1 || this.crushLevels > 0) {
        if (this.holdCount <= 0) {
          this.held = this.crushLevels > 0 ? Math.round(x * this.crushLevels) / this.crushLevels : x;
          this.holdCount = this.crushHold;
        }
        this.holdCount--;
        x = this.held;
      }
      let p = this.pos;
      let pi = Math.floor(p);
      const f = p - pi;
      pi = ((pi % L) + L) % L;
      const pj = (pi + 1) % L;
      const y = this.buf[pi] * (1 - f) + this.buf[pj] * f;
      this.lp += (this.buf[pi] - this.lp) * this.tone;
      this.buf[pi] = this.lp * this.decay + (this.record ? x : 0);
      dry[i] = x;
      wet[i] = y;
      const a = Math.abs(this.buf[pi]);
      if (a > this.segPeak) this.segPeak = a;
      const seg = Math.floor(pi / this.segLen);
      if (seg !== this.lastSeg) {
        this.port.postMessage({ type: 'seg', seg: this.lastSeg, peak: this.segPeak, pos: pi / L });
        this.segPeak = 0;
        this.lastSeg = seg;
      }
      this.pos = p + this.rate;
      if (this.pos >= L) this.pos -= L;
      if (this.pos < 0) this.pos += L;
    }
    return true;
  }
}

class HabitMemory extends AudioWorkletProcessor {
  constructor() {
    super();
    this.sr = sampleRate;
    this.seconds = 60;
    this.ring = new Float32Array(this.sr * this.seconds);
    this.write = 0;
    this.filled = 0;
    this.grains = [];
    this.feed = 0;
    this.peakAcc = 0;
    this.peakCount = 0;
    this.peakEvery = Math.floor(this.sr * 0.1);
    this.port.onmessage = (e) => this.handle(e.data);
  }

  handle(m) {
    if (m.type === 'grain') {
      const start = (this.write - Math.floor(m.back * this.sr) + this.ring.length) % this.ring.length;
      this.spawn(start, m);
    } else if (m.type === 'feed') {
      this.feed = m.value;
    } else if (m.type === 'clear') {
      this.ring.fill(0);
      this.filled = 0;
      this.grains = [];
    }
  }

  spawn(start, m) {
    const len = Math.max(Math.floor(this.sr * 0.01), Math.floor(m.len * this.sr));
    this.grains.push({
      start,
      len,
      rate: m.rate,
      gain: m.gain,
      feedback: m.feedback,
      cutoff: m.cutoff,
      accumulate: m.accumulate,
      rateMul: m.rateMul || 1,
      trimMul: m.trimMul || 1,
      dropChance: m.dropChance || 0,
      idx: 0,
      lp: 0,
      fade: Math.min(Math.floor(this.sr * 0.015), len >> 1),
    });
    if (this.grains.length > 48) this.grains.shift();
  }

  process(inputs, outputs) {
    const inp = inputs[0][0];
    const dry = outputs[0][0];
    const wet = outputs[1][0];
    const n = dry.length;
    const L = this.ring.length;
    for (let i = 0; i < n; i++) {
      let y = 0;
      for (let g = this.grains.length - 1; g >= 0; g--) {
        const gr = this.grains[g];
        const p = gr.start + gr.idx * gr.rate;
        let pi = Math.floor(p);
        const f = p - pi;
        pi = ((pi % L) + L) % L;
        let s = this.ring[pi] * (1 - f) + this.ring[(pi + 1) % L] * f;
        if (gr.cutoff < 1) {
          gr.lp += (s - gr.lp) * gr.cutoff;
          s = gr.lp;
        }
        y += s * gr.gain * fadeGain(gr.idx, gr.len, gr.fade);
        gr.idx++;
        if (gr.idx >= gr.len) {
          this.grains.splice(g, 1);
          const nextGain = gr.gain * gr.feedback;
          if (nextGain > 0.005 && Math.random() >= gr.dropChance) {
            const next = {
              back: 0,
              len: gr.len / this.sr * (gr.accumulate ? gr.trimMul : 1),
              rate: gr.rate * (gr.accumulate ? gr.rateMul : 1),
              gain: nextGain,
              feedback: gr.feedback,
              cutoff: gr.accumulate ? gr.cutoff * gr.cutoff : gr.cutoff,
              accumulate: gr.accumulate,
              rateMul: gr.rateMul,
              trimMul: gr.trimMul,
              dropChance: gr.dropChance,
            };
            if (Math.abs(next.rate) > 0.1 && Math.abs(next.rate) < 8 && next.len > 0.01) this.spawn(gr.start, next);
          }
        }
      }
      const x = (inp ? inp[i] : 0) + y * this.feed;
      this.ring[this.write] = x;
      this.write = (this.write + 1) % L;
      if (this.filled < L) this.filled++;
      dry[i] = inp ? inp[i] : 0;
      wet[i] = y;
      const a = Math.abs(x);
      if (a > this.peakAcc) this.peakAcc = a;
      this.peakCount++;
      if (this.peakCount >= this.peakEvery) {
        this.port.postMessage({ type: 'peak', value: this.peakAcc, filled: this.filled / this.sr });
        this.peakAcc = 0;
        this.peakCount = 0;
      }
    }
    return true;
  }
}

registerProcessor('tape-loop', TapeLoop);
registerProcessor('habit-memory', HabitMemory);
`;
