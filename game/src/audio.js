// v4 — audio.js
// Pure WebAudio synth, no audio files: a two-oscillator engine hum that
// follows the car's speed, a two-tone siren while the heat is on, a
// helicopter rotor thrum at 3+ stars, and a table of one-shot sounds
// (blips, crashes, pickups, the mission fanfare, a punch thud, a car
// horn, a gunshot crack and a reload click) built from one small tone
// helper. Everything no-ops safely before ensure() (first user gesture)
// and whenever audio is unavailable, so a headless run stays silent.

// One-shot sounds, as lists of tone steps. A step is one oscillator:
// start at `from` Hz, slide to `to` (or hold), fade out over `dur`,
// at volume `vol`, starting `delay` seconds in. Adding a sound is a
// new row here, not a new oscillator setup.
const SOUND_BANK = {
  blip: [{ type: 'square', from: 880, to: 620, dur: 0.09, vol: 0.12 }],
  thud: [{ type: 'sine', from: 160, to: 55, dur: 0.16, vol: 0.35 }],
  pickup: [{ type: 'sine', from: 988, to: 1319, dur: 0.18, vol: 0.16 }],
  horn: [
    { type: 'sawtooth', from: 370, dur: 0.22, vol: 0.14 },
    { type: 'sawtooth', from: 466, dur: 0.22, vol: 0.14 },
  ],
  success: [523.25, 659.25, 783.99, 1046.5].map((freq, i) => (
    { type: 'triangle', from: freq, dur: 0.32, vol: 0.18, delay: i * 0.11 }
  )),
  // A gunshot crack: a fast noise burst plus a low square snap.
  gunshot: [
    { type: 'square', from: 220, to: 55, dur: 0.1, vol: 0.3 },
    { type: 'sawtooth', from: 1400, to: 300, dur: 0.07, vol: 0.18 },
  ],
  // Reload: two short metallic clicks, a beat apart.
  reload: [
    { type: 'square', from: 1200, to: 900, dur: 0.05, vol: 0.12 },
    { type: 'square', from: 900, to: 1400, dur: 0.05, vol: 0.12, delay: 0.22 },
  ],
  // Empty magazine: a dull click.
  dryfire: [{ type: 'square', from: 700, to: 500, dur: 0.05, vol: 0.1 }],
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    // Engine hum nodes (two detuned saws through a lowpass).
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    // Siren nodes (a triangle wobbling between two notes on an LFO).
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.sirenOn = false;
    // Rotor nodes (a low square chopping on an LFO — the heli thrum).
    this.rotorOsc = null;
    this.rotorLfo = null;
    this.rotorGain = null;
    this.rotorOn = false;
  }

  /**
   * Create (or resume) the AudioContext. Call from a user gesture — a
   * keypress, click or tap — because browsers block audio before one.
   * Safe to call repeatedly; safe to call when audio is unavailable.
   */
  ensure() {
    try {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') void this.ctx.resume();
        return this.ctx;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this._buildMaster();
      this._buildEngine();
      this._buildSiren();
      this._buildRotor();
      return this.ctx;
    } catch {
      // No audio in this environment (headless, blocked, old browser):
      // the game plays on silently.
      this.ctx = null;
      return null;
    }
  }

  // Master gain stays low: this is a game hum, not a concert.
  _buildMaster() {
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.15;
    this.master.connect(this.ctx.destination);
  }

  // Engine: two detuned sawtooths through a lowpass, started once and
  // steered by engine(speed01) afterwards. Gain starts at 0 (silent).
  _buildEngine() {
    const ctx = this.ctx;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineFilter.Q.value = 1.2;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    const mkOsc = (freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(this.engineFilter);
      return osc;
    };
    this.engineOsc1 = mkOsc(58);
    this.engineOsc2 = mkOsc(61);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  // Siren: a triangle tone whose pitch wobbles between two notes on a
  // square-wave LFO — the classic two-tone wail, gated by sirenGain.
  _buildSiren() {
    const ctx = this.ctx;
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 820;
    this.sirenLfo = ctx.createOscillator();
    this.sirenLfo.type = 'square';
    this.sirenLfo.frequency.value = 0.55; // one wail cycle ~1.8 s
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 140; // ±140 Hz around 820 Hz
    this.sirenLfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);
    this.sirenGain = ctx.createGain();
    this.sirenGain.gain.value = 0;
    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.master);
    this.sirenOsc.start();
    this.sirenLfo.start();
  }

  // Rotor: a low square wave chopped by a slow LFO — the helicopter's
  // whump-whump, gated by rotorGain. Quieter than the siren on purpose.
  _buildRotor() {
    const ctx = this.ctx;
    this.rotorOsc = ctx.createOscillator();
    this.rotorOsc.type = 'square';
    this.rotorOsc.frequency.value = 68;
    this.rotorLfo = ctx.createOscillator();
    this.rotorLfo.type = 'sine';
    this.rotorLfo.frequency.value = 11; // ~11 chops a second
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 30;
    this.rotorLfo.connect(lfoGain);
    lfoGain.connect(this.rotorOsc.frequency);
    this.rotorGain = ctx.createGain();
    this.rotorGain.gain.value = 0;
    this.rotorOsc.connect(this.rotorGain);
    this.rotorGain.connect(this.master);
    this.rotorOsc.start();
    this.rotorLfo.start();
  }

  /** Mute or unmute everything (master gain to 0, keeps the graph alive). */
  setMuted(muted) {
    this.muted = !!muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.15, this.ctx.currentTime, 0.05);
    }
  }

  // One short tone: an oscillator that starts at `from` Hz, slides to
  // `to` Hz, and fades out over `dur` seconds.
  _tone({ type = 'sine', from = 440, to = null, dur = 0.15, vol = 0.15, delay = 0 }) {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(from, now);
      if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + dur);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    } catch { /* a stray audio error must never break the frame */ }
  }

  // Play every step of a preset from SOUND_BANK.
  _play(name) {
    const steps = SOUND_BANK[name];
    if (!steps) return;
    for (const step of steps) this._tone(step);
  }

  /**
   * Engine hum: pitch, brightness and loudness follow speed01 (0 = parked,
   * 1 = flat out). Call every frame from the main loop; no-ops pre-ensure.
   */
  engine(speed01) {
    if (!this.ctx || !this.engineOsc1) return;
    try {
      const s = Math.max(0, Math.min(1, speed01 || 0));
      const now = this.ctx.currentTime;
      const base = 55 + s * 150;
      this.engineOsc1.frequency.setTargetAtTime(base, now, 0.06);
      this.engineOsc2.frequency.setTargetAtTime(base * 1.007 + 3, now, 0.06);
      this.engineFilter.frequency.setTargetAtTime(380 + s * 1900, now, 0.08);
      // Audible but quiet at idle, present at speed; silent when parked
      // with the engine effectively off (speed01 0 still idles faintly).
      this.engineGain.gain.setTargetAtTime(0.015 + s * 0.085, now, 0.09);
    } catch { /* a stray audio error must never break the frame */ }
  }

  /** Cut the engine hum (menu / paused / on foot). */
  engineOff() {
    if (!this.ctx || !this.engineGain) return;
    try {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.08);
    } catch { /* see above */ }
  }

  /** Two-tone siren on/off. The main loop calls siren(police.wanted > 0). */
  siren(on) {
    if (!this.ctx || !this.sirenGain) return;
    try {
      const want = !!on;
      if (want === this.sirenOn) return;
      this.sirenOn = want;
      this.sirenGain.gain.setTargetAtTime(want ? 0.05 : 0, this.ctx.currentTime, 0.15);
    } catch { /* see above */ }
  }

  /** Helicopter rotor on/off. The main loop calls rotor(heli is up). */
  rotor(on) {
    if (!this.ctx || !this.rotorGain) return;
    try {
      const want = !!on;
      if (want === this.rotorOn) return;
      this.rotorOn = want;
      this.rotorGain.gain.setTargetAtTime(want ? 0.04 : 0, this.ctx.currentTime, 0.2);
    } catch { /* see above */ }
  }

  /** Short square blip (UI confirm / menu move). */
  blip() {
    this._play('blip');
  }

  /** Noise burst for a crash (filtered noise, quick decay). */
  crash() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const dur = 0.28;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.5, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.master);
      src.start(now);
      src.stop(now + dur);
    } catch { /* a stray audio error must never break the frame */ }
  }

  /** Little major arpeggio for mission success. */
  success() {
    this._play('success');
  }

  /** Low thump for a punch landing: a fast-decaying sine drop. */
  thud() {
    this._play('thud');
  }

  /** Coin-style pickup blip (checkpoint / package / passenger). */
  pickup() {
    this._play('pickup');
  }

  /** Two-note car horn (H key while driving). */
  horn() {
    this._play('horn');
  }

  /** Gunshot crack (F with the pistol drawn). */
  gunshot() {
    this._play('gunshot');
  }

  /** Reload clicks (R with the pistol drawn). */
  reload() {
    this._play('reload');
  }

  /** Empty-magazine click (F with no rounds left). */
  dryfire() {
    this._play('dryfire');
  }
}
