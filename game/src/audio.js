// VICE HARBOR — audio.js
// Pure WebAudio synth, no audio files: a two-oscillator engine hum that
// follows the car's speed, a two-tone siren while the heat is on, and small
// blips for crashes, pickups and mission success — plus a low thud for a
// punch landing. Everything no-ops safely before ensure() (first user
// gesture) and whenever audio is unavailable.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.sirenOsc = null;
    this.sirenLfo = null;
    this.sirenGain = null;
    this.sirenOn = false;
    this.muted = false;
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
      // Master gain stays low: this is a game hum, not a concert.
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.15;
      this.master.connect(this.ctx.destination);

      // Engine: two detuned sawtooths through a lowpass, started once and
      // steered by engine(speed01) afterwards. Gain starts at 0 (silent).
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 420;
      this.engineFilter.Q.value = 1.2;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0;
      this.engineOsc1 = this.ctx.createOscillator();
      this.engineOsc1.type = 'sawtooth';
      this.engineOsc1.frequency.value = 58;
      this.engineOsc2 = this.ctx.createOscillator();
      this.engineOsc2.type = 'sawtooth';
      this.engineOsc2.frequency.value = 61;
      this.engineOsc1.connect(this.engineFilter);
      this.engineOsc2.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc1.start();
      this.engineOsc2.start();

      // Siren: a triangle tone whose pitch wobbles between two notes on a
      // square-wave LFO — the classic two-tone wail, gated by sirenGain.
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 820;
      this.sirenLfo = this.ctx.createOscillator();
      this.sirenLfo.type = 'square';
      this.sirenLfo.frequency.value = 0.55; // one wail cycle ~1.8 s
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 140; // ±140 Hz around 820 Hz
      this.sirenLfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenLfo.start();
      return this.ctx;
    } catch {
      // No audio in this environment (headless, blocked, old browser):
      // the game plays on silently.
      this.ctx = null;
      return null;
    }
  }

  /** Mute or unmute everything (master gain to 0, keeps the graph alive). */
  setMuted(muted) {
    this.muted = !!muted;
    if (this.ctx && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.15, this.ctx.currentTime, 0.05);
    }
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

  /** Short square blip (UI confirm / menu move). */
  blip() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(620, now + 0.07);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.1);
    } catch { /* see above */ }
  }

  /** Noise burst for a crash (filtered noise, quick decay). */
  crash() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const dur = 0.28;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
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
    } catch { /* see above */ }
  }

  /** Little major arpeggio for mission success. */
  success() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
      notes.forEach((freq, i) => {
        const start = now + i * 0.11;
        const osc = this.ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.32);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start(start);
        osc.stop(start + 0.35);
      });
    } catch { /* see above */ }
  }

  /** Low thump for a punch landing: a fast-decaying sine drop. */
  thud() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.12);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.18);
    } catch { /* see above */ }
  }

  /** Coin-style pickup blip (checkpoint / package / passenger). */
  pickup() {
    if (!this.ctx) return;
    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(988, now);
      osc.frequency.setValueAtTime(1319, now + 0.07);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.16, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch { /* see above */ }
  }
}
