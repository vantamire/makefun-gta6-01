// VICE HARBOR v7 — sound, all synthesized.
// One WebAudio board: engine hum that follows speed, the police siren,
// the helicopter rotor, gunshots, explosions, thuds, blips and a radio
// with three procedural stations (N cycles). No audio files, no network
// — every sound is an oscillator or a noise buffer built at runtime.
// The context is created on the first user gesture (ensure), so the
// page never tries to play before the browser allows it.

const STATIONS = [
  { name: 'Harbor FM', kind: 'arp' },
  { name: 'Vice Waves', kind: 'pad' },
  { name: 'Static', kind: 'static' },
];

function noiseBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  return buf;
}

export class SoundBoard {
  constructor() {
    this.ctx = null;
    this.master = null;
    this._engineOsc = null;
    this._engineGain = null;
    this._sirenOsc = null;
    this._sirenGain = null;
    this._sirenLfo = null;
    this._rotorOsc = null;
    this._rotorGain = null;
    this._radioOn = false;
    this._station = 0;
    this._radioTimer = null;
    this._radioNodes = [];
    this._noise = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    this._noise = noiseBuffer(this.ctx, 1);
    // Engine: a low sawtooth whose pitch follows speed.
    this._engineOsc = this.ctx.createOscillator();
    this._engineOsc.type = 'sawtooth';
    this._engineOsc.frequency.value = 55;
    this._engineGain = this.ctx.createGain();
    this._engineGain.gain.value = 0;
    const engineFilter = this.ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 320;
    this._engineOsc.connect(engineFilter);
    engineFilter.connect(this._engineGain);
    this._engineGain.connect(this.master);
    this._engineOsc.start();
    // Siren: two alternating tones via an LFO on a square wave.
    this._sirenOsc = this.ctx.createOscillator();
    this._sirenOsc.type = 'square';
    this._sirenOsc.frequency.value = 700;
    this._sirenGain = this.ctx.createGain();
    this._sirenGain.gain.value = 0;
    this._sirenLfo = this.ctx.createOscillator();
    this._sirenLfo.type = 'sine';
    this._sirenLfo.frequency.value = 0.8;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 220;
    this._sirenLfo.connect(lfoGain);
    lfoGain.connect(this._sirenOsc.frequency);
    this._sirenOsc.connect(this._sirenGain);
    this._sirenGain.connect(this.master);
    this._sirenOsc.start();
    this._sirenLfo.start();
    // Rotor: a slow chopping square wave.
    this._rotorOsc = this.ctx.createOscillator();
    this._rotorOsc.type = 'square';
    this._rotorOsc.frequency.value = 13;
    this._rotorGain = this.ctx.createGain();
    this._rotorGain.gain.value = 0;
    const rotorFilter = this.ctx.createBiquadFilter();
    rotorFilter.type = 'lowpass';
    rotorFilter.frequency.value = 240;
    this._rotorOsc.connect(rotorFilter);
    rotorFilter.connect(this._rotorGain);
    this._rotorGain.connect(this.master);
    this._rotorOsc.start();
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _burst(dur, vol, filterFreq) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noise;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq || 800;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol || 0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  engine(ratio) {
    if (!this.ctx) return;
    const r = Math.max(0, Math.min(1, ratio || 0));
    this._engineOsc.frequency.setTargetAtTime(55 + r * 130, this.ctx.currentTime, 0.08);
    this._engineGain.gain.setTargetAtTime(0.05 + r * 0.09, this.ctx.currentTime, 0.08);
  }

  engineOff() {
    if (!this.ctx) return;
    this._engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
  }

  siren(on) {
    if (!this.ctx) return;
    this._sirenGain.gain.setTargetAtTime(on ? 0.045 : 0, this.ctx.currentTime, 0.2);
  }

  rotor(on) {
    if (!this.ctx) return;
    this._rotorGain.gain.setTargetAtTime(on ? 0.06 : 0, this.ctx.currentTime, 0.2);
  }

  shot() {
    this._burst(0.14, 0.5, 2400);
    this._blip(180, 0.08, 'square', 0.25, 60);
  }

  boom() {
    this._burst(0.9, 0.7, 320);
    this._blip(70, 0.7, 'sine', 0.5, 30);
  }

  crash() {
    this._burst(0.35, 0.45, 500);
    this._blip(120, 0.2, 'sawtooth', 0.2, 50);
  }

  thud() {
    this._blip(90, 0.15, 'sine', 0.4, 45);
  }

  blip() {
    this._blip(660, 0.09, 'sine', 0.18, 880);
  }

  pickup() {
    this._blip(520, 0.1, 'sine', 0.2, 780);
    setTimeout(() => this._blip(780, 0.12, 'sine', 0.2, 1040), 90);
  }

  win() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'triangle', 0.22), i * 110));
  }

  dry() {
    this._blip(1400, 0.04, 'square', 0.12);
  }

  reload() {
    this._blip(300, 0.06, 'square', 0.15, 500);
    setTimeout(() => this._blip(500, 0.06, 'square', 0.15, 300), 140);
  }

  horn() {
    this._blip(370, 0.35, 'sawtooth', 0.16);
    this._blip(466, 0.35, 'sawtooth', 0.12);
  }

  // ---- radio: three procedural stations, N cycles ----
  radioNext() {
    if (!this.ctx) return STATIONS[this._station].name;
    this._station = (this._station + 1) % STATIONS.length;
    this._startStation();
    return STATIONS[this._station].name;
  }

  radioStation() {
    return STATIONS[this._station].name;
  }

  _stopRadio() {
    if (this._radioTimer) {
      clearInterval(this._radioTimer);
      this._radioTimer = null;
    }
    for (const n of this._radioNodes) {
      try { n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* already gone */ }
    }
    this._radioNodes = [];
  }

  _startStation() {
    this._stopRadio();
    const station = STATIONS[this._station];
    if (station.kind === 'static') {
      // Hiss only.
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.05;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start();
      this._radioNodes.push(src);
      return;
    }
    // A tiny step sequencer: one note every 220 ms.
    const scale = station.kind === 'arp'
      ? [262, 330, 392, 523, 392, 330]
      : [220, 262, 294, 330, 294, 262];
    let step = 0;
    const play = () => {
      if (!this.ctx) return;
      const f = scale[step % scale.length];
      step += 1;
      const osc = this.ctx.createOscillator();
      osc.type = station.kind === 'arp' ? 'square' : 'triangle';
      osc.frequency.value = f;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.06, this.ctx.currentTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.25);
    };
    play();
    this._radioTimer = setInterval(play, 220);
  }
}

export function makeSoundBoard() {
  return new SoundBoard();
}
