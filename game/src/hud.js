// VICE HARBOR v7 — the heads-up display.
// Builds the whole HUD once (portrait, health, money, stars, clock,
// vitals, the big circular minimap, objective line, weapon and speed,
// toasts, the mission picker and the start/pause/busted/done screens)
// and refreshes it every frame from one state object. The minimap is a
// canvas: it draws the road grid, the player arrow, police blips and the
// mission marker, rotated so the player's heading points up, San
// Andreas style. Nothing here knows about three.js or the game loop —
// main.js hands it a plain state object and it paints.

const STAR_ON = '★';
const STAR_OFF = '☆';

function el(tag, id, parent, text) {
  const node = document.createElement(tag);
  // Both the id and the class are set to the same 'vh-*' name, so the
  // stylesheet can target an element either way (#vh-face for the
  // one-offs, .vh-bar / .vh-job-row for the repeated rows).
  if (id) { node.id = id; node.className = id; }
  if (text !== undefined) node.textContent = text;
  if (parent) parent.appendChild(node);
  return node;
}

function moneyText(n) {
  const v = Math.max(0, Math.floor(n));
  return '$' + String(v).padStart(8, '0');
}

function clockText(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour - Math.floor(hour)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class Hud {
  constructor() {
    this.root = el('div', 'vh-hud', document.body);
    this.photo = false;
    this._menuOpen = false;
    this._msgT = 0;
    this._buildChrome();
    this._buildOverlays();
    this._buildMenu();
    this._buildPhotoHint();
  }

  _buildChrome() {
    const root = this.root;
    // Top-left: the hero portrait (a circle with the hero's initial)
    // and the health bar beneath it.
    const face = el('div', 'vh-face', root);
    el('div', 'vh-face-letter', face, 'V');
    const health = el('div', 'vh-health', root);
    el('span', null, health, 'HEALTH');
    const healthBar = el('div', 'vh-bar', health);
    this.healthFill = el('div', 'vh-fill-health', healthBar);
    // Top-right: money, wanted stars, clock, vitals.
    this.moneyEl = el('div', 'vh-money', root, '$00000000');
    this.starsEl = el('div', 'vh-stars', root, STAR_OFF.repeat(5));
    this.clockEl = el('div', 'vh-clock', root, '18:30');
    const vitals = el('div', 'vh-vitals', root);
    const hRow = el('div', 'vh-vital-row', vitals);
    el('span', null, hRow, 'HEALTH');
    const hBar = el('div', 'vh-bar', hRow);
    this.vitalHealth = el('div', 'vh-fill-health', hBar);
    const aRow = el('div', 'vh-vital-row', vitals);
    el('span', null, aRow, 'ARMOR');
    const aBar = el('div', 'vh-bar', aRow);
    this.vitalArmor = el('div', 'vh-fill-armor', aBar);
    const sRow = el('div', 'vh-vital-row', vitals);
    el('span', null, sRow, 'SPRINT');
    const sBar = el('div', 'vh-bar', sRow);
    this.vitalStamina = el('div', 'vh-fill-stamina', sBar);
    // Bottom-left: the big circular minimap.
    this.mapCanvas = el('canvas', 'vh-map', root);
    this.mapCanvas.width = 240;
    this.mapCanvas.height = 240;
    // Bottom-centre: the current objective. Bottom-right: weapon + speed.
    this.objectiveEl = el('div', 'vh-objective', root, '');
    this.weaponEl = el('div', 'vh-weapon', root, '');
    this.speedEl = el('div', 'vh-speed', root, '');
    // Centre toast for short messages.
    this.toastEl = el('div', 'vh-toast', root, '');
    this.toastEl.style.opacity = '0';
  }

  _buildOverlays() {
    // Start screen.
    const start = el('div', 'vh-screen', this.root);
    start.dataset.screen = 'start';
    el('h1', null, start, 'VICE HARBOR');
    el('p', 'vh-tag', start, 'A sun-soaked open-world crime story. Steal cars, outrun the law, run missions and make your name on the harbor.');
    const keys = el('div', 'vh-keys', start);
    const rows = [
      ['W A S D', 'move / drive'],
      ['Shift', 'run'],
      ['Space', 'handbrake'],
      ['E', 'enter / exit car'],
      ['M', 'missions'],
      ['F', 'punch / fire'],
      ['Q', 'weapon'],
      ['X', 'swap weapon'],
      ['R', 'reload'],
      ['N', 'radio'],
      ['C', 'camera'],
      ['H', 'horn'],
      ['V', 'photo mode'],
      ['P', 'pause'],
      ['Enter', 'start / continue'],
      ['1–0', 'pick a mission'],
    ];
    for (const [k, what] of rows) {
      const row = el('div', 'vh-key-row', keys);
      el('b', null, row, k);
      el('span', null, row, what);
    }
    this.startBtn = el('button', 'vh-start-btn', start, 'START ENGINE');
    el('p', 'vh-hint', start, 'Best played with keyboard + mouse. Click Start or press Enter to play.');
    // Pause screen.
    const pause = el('div', 'vh-screen', this.root);
    pause.dataset.screen = 'pause';
    pause.style.display = 'none';
    el('h1', null, pause, 'PAUSED');
    el('p', 'vh-tag', pause, 'The harbor waits. Your money is safe.');
    this.resumeBtn = el('button', null, pause, 'RESUME');
    // Busted screen.
    const busted = el('div', 'vh-screen', this.root);
    busted.dataset.screen = 'busted';
    busted.style.display = 'none';
    el('h1', null, busted, 'BUSTED');
    el('p', 'vh-tag', busted, 'Harbor PD caught you. The heat is gone, but the cash stays yours.');
    this.retryBtn = el('button', null, busted, 'TRY AGAIN');
    // Mission-complete screen.
    const done = el('div', 'vh-screen', this.root);
    done.dataset.screen = 'done';
    done.style.display = 'none';
    this.doneTitle = el('h1', null, done, 'MISSION COMPLETE');
    this.doneSub = el('p', 'vh-tag', done, '');
    this.continueBtn = el('button', null, done, 'KEEP DRIVING');
    this._screens = { start, pause, busted, done };
  }

  _buildMenu() {
    const menu = el('div', 'vh-menu', this.root);
    menu.style.display = 'none';
    el('h2', null, menu, 'MISSIONS');
    this.menuList = el('div', 'vh-menu-list', menu);
    this.menuEl = menu;
  }

  _buildPhotoHint() {
    this.photoHint = el('div', 'vh-photo-hint', this.root, 'PHOTO MODE — press V to bring the HUD back');
    this.photoHint.style.display = 'none';
  }

  bind(hooks) {
    const on = (node, fn) => node.addEventListener('click', fn);
    on(this.startBtn, () => hooks.onStart && hooks.onStart());
    on(this.resumeBtn, () => hooks.onResume && hooks.onResume());
    on(this.retryBtn, () => hooks.onRetry && hooks.onRetry());
    on(this.continueBtn, () => hooks.onContinue && hooks.onContinue());
    this._hooks = hooks;
  }

  _showOnly(name) {
    for (const [key, node] of Object.entries(this._screens)) {
      node.style.display = key === name ? 'flex' : 'none';
    }
  }

  showStart() { this._showOnly('start'); }
  hideStart() { this._screens.start.style.display = 'none'; }
  showPause() { this._showOnly('pause'); }
  hidePause() { this._screens.pause.style.display = 'none'; }
  showBusted() { this._showOnly('busted'); }
  hideBusted() { this._screens.busted.style.display = 'none'; }
  showDone(text) {
    this.doneSub.textContent = text;
    this._showOnly('done');
  }
  hideDone() { this._screens.done.style.display = 'none'; }

  showMissionMenu(list, activeId) {
    this.menuList.innerHTML = '';
    list.forEach((job, i) => {
      const row = document.createElement('button');
      row.className = 'vh-job-row' + (job.id === activeId ? ' active' : '');
      row.innerHTML = '';
      const title = document.createElement('b');
      title.textContent = `${i + 1}. ${job.name}`;
      const pay = document.createElement('span');
      pay.textContent = `$${job.pay}`;
      const blurb = document.createElement('em');
      blurb.textContent = job.blurb;
      row.appendChild(title);
      row.appendChild(pay);
      row.appendChild(blurb);
      row.addEventListener('click', () => {
        if (this._hooks && this._hooks.onMissionPick) this._hooks.onMissionPick(i);
      });
      this.menuList.appendChild(row);
    });
    this.menuEl.style.display = 'block';
    this._menuOpen = true;
  }

  hideMissionMenu() {
    this.menuEl.style.display = 'none';
    this._menuOpen = false;
  }

  menuOpen() { return this._menuOpen; }

  showMessage(text, secs) {
    this.toastEl.textContent = text;
    this.toastEl.style.opacity = '1';
    this._msgT = secs || 2.5;
  }

  tickMessage(dt) {
    if (this._msgT <= 0) return;
    this._msgT -= dt;
    if (this._msgT <= 0) this.toastEl.style.opacity = '0';
  }

  setPhoto(on) {
    this.photo = !!on;
    this.root.classList.toggle('photo', this.photo);
    this.photoHint.style.display = this.photo ? 'block' : 'none';
  }

  photoOn() { return this.photo; }

  // ---- per-frame refresh from one plain state object ----
  refresh(s, timeLeft) {
    this.moneyEl.textContent = moneyText(s.money);
    const hot = s.wanted >= 3;
    this.starsEl.textContent = STAR_ON.repeat(s.wanted) + STAR_OFF.repeat(5 - s.wanted);
    this.starsEl.classList.toggle('hot', hot);
    this.clockEl.textContent = clockText(s.hour);
    const hp = Math.max(0, Math.min(100, s.health));
    const ar = Math.max(0, Math.min(100, s.armor));
    const st = Math.max(0, Math.min(100, s.stamina ?? 100));
    this.healthFill.style.width = `${hp}%`;
    this.healthFill.classList.toggle('low', hp < 30);
    this.vitalHealth.style.width = `${hp}%`;
    this.vitalHealth.classList.toggle('low', hp < 30);
    this.vitalArmor.style.width = `${ar}%`;
    this.vitalStamina.style.width = `${st}%`;
    this.objectiveEl.textContent = s.objective || '';
    this.objectiveEl.style.display = s.objective ? 'block' : 'none';
    const w = s.weapon === 'none' ? 'FISTS' : s.weapon.toUpperCase();
    this.weaponEl.textContent = s.weapon === 'none' ? w : `${w}  ${s.ammo}`;
    this.weaponEl.classList.toggle('reloading', !!s.reloading);
    this.speedEl.textContent = s.onFoot ? '' : `${Math.round(Math.abs(s.speed) * 3.6)} km/h`;
    this._drawMap(s.map, timeLeft);
  }

  _drawMap(map, timeLeft) {
    if (!map || !map.city) return;
    const ctx = this.mapCanvas.getContext('2d');
    const W = 240;
    const H = 240;
    const C = W / 2;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Circular clip, so the map reads as a round GTA minimap.
    ctx.beginPath();
    ctx.arc(C, C, C - 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#1b1e26';
    ctx.fillRect(0, 0, W, H);
    // The view rotates so the player's heading points up.
    const scale = W / 520;
    ctx.translate(C, C);
    ctx.rotate(-map.heading);
    ctx.scale(scale, scale);
    ctx.translate(-map.x, -map.z);
    // City ground + road grid.
    const city = map.city;
    const half = city.half;
    ctx.fillStyle = '#23262f';
    ctx.fillRect(-half - 20, -half - 20, half * 2 + 40, half * 2 + 40);
    ctx.fillStyle = '#3f4a3a';
    ctx.fillRect(-half - 20, -half - 20, half * 2 + 40, half * 2 + 40);
    ctx.strokeStyle = '#4a4f5c';
    ctx.lineWidth = 10;
    for (const x of city.roadXs) {
      ctx.beginPath();
      ctx.moveTo(x, -half);
      ctx.lineTo(x, half);
      ctx.stroke();
    }
    for (const z of city.roadZs) {
      ctx.beginPath();
      ctx.moveTo(-half, z);
      ctx.lineTo(half, z);
      ctx.stroke();
    }
    // The sea, east of the city.
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(half, -half, 90, half * 2);
    // Mission target: a pulsing yellow diamond.
    if (map.target) {
      const pulse = 6 + Math.sin(performance.now() * 0.006) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(map.target.x, map.target.z - pulse);
      ctx.lineTo(map.target.x + pulse, map.target.z);
      ctx.lineTo(map.target.x, map.target.z + pulse);
      ctx.lineTo(map.target.x - pulse, map.target.z);
      ctx.closePath();
      ctx.fill();
    }
    // Police blips, red.
    ctx.fillStyle = '#ff3c3c';
    for (const b of map.blips || []) {
      ctx.beginPath();
      ctx.arc(b.x, b.z, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Player arrow, fixed at the centre, pointing up.
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(C, C - 12);
    ctx.lineTo(C + 8, C + 9);
    ctx.lineTo(C, C + 4);
    ctx.lineTo(C - 8, C + 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Mission timer, small, under the map's top edge.
    if (typeof timeLeft === 'number' && timeLeft > 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(C - 34, 8, 68, 22);
      ctx.fillStyle = '#ffd23c';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.textAlign = 'center';
      const t = Math.max(0, Math.ceil(timeLeft));
      ctx.fillText(`${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`, C, 24);
    }
  }
}

export function makeHud() {
  return new Hud();
}
