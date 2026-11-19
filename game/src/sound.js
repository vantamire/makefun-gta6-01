// sound.js — every sound in VICE HARBOR, synthesized live.
// No audio files: WebAudio oscillators and filtered noise make the
// engine hum, the sirens, the gunshots, the explosions, the pickup
// chimes and the radio. Nothing plays until the player presses Start
// (browsers demand a gesture first).

export function makeSoundBoard() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let engineFilter = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenLfo = null;
  let radioOn = false;
  let radioTimer = 0;
  let radioStep = 0;
  let musicGain = null;
  let started = false;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
    // engine: a sawtooth through a low-pass, pitch follows speed
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineFilter = ctx.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
    // siren: a triangle that wails between two tones
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 720;
    sirenLfo = ctx.createOscillator();
    sirenLfo.type = 'square';
    sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    sirenLfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    sirenLfo.start();
    // radio bus
    musicGain = ctx.createGain();
    musicGain.gain.value = 0.16;
    musicGain.connect(master);
  }

  function start() {
    ensure();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    started = true;
  }

  function noiseBurst(dur, filterFreq, gainVal, type = 'lowpass') {
    if (!ctx || !started) return;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.value = gainVal;
    src.connect(filt);
    filt.connect(g);
    g.connect(master);
    src.start();
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo) {
    if (!ctx || !started) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gainVal, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g);
    g.connect(master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }

  function shot() {
    noiseBurst(0.14, 2600, 0.5, 'highpass');
    tone(160, 0.1, 0.25, 'square', 60);
  }

  function blast() {
    noiseBurst(0.9, 300, 0.9);
    tone(90, 0.7, 0.7, 'sine', 30);
  }

  function chime() {
    tone(660, 0.16, 0.25);
    setTimeout(() => tone(880, 0.2, 0.25), 90);
    setTimeout(() => tone(1320, 0.3, 0.2), 180);
  }

  function click() {
    tone(1200, 0.05, 0.2, 'square');
  }

  function thud() {
    noiseBurst(0.12, 500, 0.4);
  }

  function horn() {
    tone(370, 0.35, 0.3, 'sawtooth');
    tone(466, 0.35, 0.25, 'sawtooth');
  }

  function setSiren(on) {
    if (!ctx) return;
    sirenGain.gain.linearRampToValueAtTime(on ? 0.05 : 0, ctx.currentTime + 0.4);
  }

  function setRadio(on) {
    radioOn = on;
    if (on) chime();
  }

  function engine(speed01, inCar) {
    if (!ctx) return;
    const target = inCar ? 0.05 + speed01 * 0.1 : 0;
    engineGain.gain.linearRampToValueAtTime(target, ctx.currentTime + 0.1);
    engineOsc.frequency.value = 55 + speed01 * 130;
    engineFilter.frequency.value = 320 + speed01 * 900;
  }

  // A tiny synthwave loop: bass notes on a minor groove, hats on the off-beat.
  const BASS_LINE = [55, 0, 55, 65.4, 0, 55, 49, 58.3];
  function radioTick(dt) {
    if (!ctx || !radioOn || !started) return;
    radioTimer -= dt;
    if (radioTimer > 0) return;
    radioTimer = 0.21;
    const step = radioStep++ % 16;
    const bass = BASS_LINE[step % 8];
    if (bass) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = bass;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.5, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.19);
      o.connect(f); f.connect(g); g.connect(musicGain);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    }
    if (step % 2 === 1) {
      const len = Math.floor(ctx.sampleRate * 0.03);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 6000;
      const g = ctx.createGain();
      g.gain.value = 0.25;
      src.connect(f); f.connect(g); g.connect(musicGain);
      src.start();
    }
  }

  function tick(dt, speed01, inCar, wanted) {
    engine(speed01, inCar);
    setSiren(wanted > 0);
    radioTick(dt);
  }

  return { start, shot, blast, chime, click, thud, horn, setRadio, tick };
}
