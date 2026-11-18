// v4 — hud.js
// HUD: DOM overlay — money + wanted stars + clock + health/armor, a big
// GTA-style circular rotating minimap (bottom-left), mission objective +
// distance + timer, weapon + speedometer, centre messages, and the start /
// paused / busted / mission-complete screens.
// All DOM/CSS lives here plus the <style> in index.html.
//
// The minimap is a LARGE circle (240 px) bottom-left, rotating so the
// player always faces up, zoomed to the nearby streets with building
// footprints, mission blips and police blips — impossible to miss. Money
// is top-right, big green "$00000000" in the San Andreas style, with the
// wanted stars, an in-game clock and health + armor bars under it. The
// HUD elements sit ABOVE the full-screen overlays (z-index), so the money
// and minimap stay readable even on the menu screen. The speedometer and
// the objective bar only show while actually playing, the controls list
// names the camera (C), punch (F), weapon (Q) and reload (R), and the
// mission menu lists all 7 jobs with 1-7 picks.
//
// New in v4: the weapon slot shows the pistol with its ammo ("PISTOL
// 12/12", "RELOADING…") instead of always saying FISTS; the minimap also
// draws the race rival (purple), the vigilante fleeing cars (orange) and
// the police helicopter (red ring) so the new systems are visible on it.

import { CONFIG } from './config.js';

const CONTROLS_HTML = `
  <div class="ctl"><b>W A S D</b> move / drive</div>
  <div class="ctl"><b>Shift</b> run &nbsp; <b>Space</b> handbrake</div>
  <div class="ctl"><b>E</b> enter / exit car &nbsp; <b>M</b> missions</div>
  <div class="ctl"><b>F</b> punch / fire &nbsp; <b>Q</b> weapon &nbsp; <b>R</b> reload</div>
  <div class="ctl"><b>C</b> camera &nbsp; <b>1-7</b> pick mission</div>
  <div class="ctl"><b>Mouse drag</b> orbit camera &nbsp; <b>Wheel</b> zoom</div>
  <div class="ctl"><b>P</b> pause &nbsp; <b>H</b> horn &nbsp; <b>Enter</b> start / continue</div>
  <div class="ctl"><b>V</b> photo mode — hide the HUD for a clean shot</div>`;

export class HUD {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    document.body.appendChild(this.root);
    this._buildTopBar();
    this._buildMap();
    this._buildBottomBar();
    this._buildOverlays();
    this._lastMoney = -1;
    this._lastWanted = -1;
    this._lastHealth = -1;
    this._lastArmor = -1;
    this._lastClock = '';
    this._lastWeapon = '';
    this._pulse = 0;
    // Latest mission objective line, fed by missions.js as
    // update(objectiveText, distance, timeLeft).
    this._missionObjective = null;
  }

  // Top-right cluster: money, wanted stars, clock, health + armor.
  _buildTopBar() {
    this.moneyEl = document.createElement('div');
    this.moneyEl.id = 'hud-money';
    this.moneyEl.textContent = '$00000000';
    this.root.appendChild(this.moneyEl);

    this.starsEl = document.createElement('div');
    this.starsEl.id = 'hud-stars';
    this.root.appendChild(this.starsEl);

    this.clockEl = document.createElement('div');
    this.clockEl.id = 'hud-clock';
    this.clockEl.textContent = '18:30';
    this.root.appendChild(this.clockEl);

    // Health + armor bars (San Andreas style, under the clock).
    this.vitalsEl = document.createElement('div');
    this.vitalsEl.id = 'hud-vitals';
    this.vitalsEl.innerHTML = `
      <div class="vital-row"><span>HEALTH</span><div class="vital-bar"><div id="hud-health-fill" class="vital-fill health"></div></div></div>
      <div class="vital-row"><span>ARMOR</span><div class="vital-bar"><div id="hud-armor-fill" class="vital-fill armor"></div></div></div>`;
    this.root.appendChild(this.vitalsEl);
    this.healthFill = document.getElementById('hud-health-fill');
    this.armorFill = document.getElementById('hud-armor-fill');
  }

  // Bottom-left: the big circular minimap.
  _buildMap() {
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.id = 'hud-minimap';
    this.mapCanvas.width = 240;
    this.mapCanvas.height = 240;
    this.root.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');
  }

  // Bottom-centre objective, bottom-right weapon + speed, centre toast,
  // and the mission menu (M).
  _buildBottomBar() {
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.id = 'hud-objective';
    this.root.appendChild(this.objectiveEl);

    this.weaponEl = document.createElement('div');
    this.weaponEl.id = 'hud-weapon';
    this.root.appendChild(this.weaponEl);
    this.speedEl = document.createElement('div');
    this.speedEl.id = 'hud-speed';
    this.root.appendChild(this.speedEl);

    this.messageEl = document.createElement('div');
    this.messageEl.id = 'hud-message';
    this.root.appendChild(this.messageEl);
    this._messageTimer = 0;

    this.menuEl = document.createElement('div');
    this.menuEl.id = 'hud-mission-menu';
    this.menuEl.style.display = 'none';
    this.root.appendChild(this.menuEl);
  }

  // Full-screen overlays.
  _buildOverlays() {
    this.startEl = this._makeOverlay('hud-start', `
      <h1>VICE HARBOR</h1>
      <p class="tag">A sun-soaked open-world crime story. Steal cars, outrun the law,<br>run missions and make your name on the harbor.</p>
      <div class="controls">${CONTROLS_HTML}</div>
      <button id="hud-start-btn">START ENGINE</button>
      <p class="hint">Best played with keyboard + mouse. Click Start or press Enter to play.</p>`);
    this.pauseEl = this._makeOverlay('hud-pause', `
      <h1>PAUSED</h1><p class="tag">The city waits for you.</p>
      <button id="hud-resume-btn">RESUME</button>`);
    this.bustedEl = this._makeOverlay('hud-busted', `
      <h1>BUSTED</h1><p class="tag">The harbor police caught up with you.</p>
      <button id="hud-retry-btn">TRY AGAIN</button>`);
    this.completeEl = this._makeOverlay('hud-complete', `
      <h1>MISSION COMPLETE</h1><p class="tag" id="hud-complete-text"></p>
      <button id="hud-continue-btn">KEEP DRIVING</button>`);

    this.startEl.style.display = 'flex';
    this.pauseEl.style.display = 'none';
    this.bustedEl.style.display = 'none';
    this.completeEl.style.display = 'none';
  }

  _makeOverlay(id, inner) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'hud-overlay';
    el.innerHTML = inner;
    this.root.appendChild(el);
    return el;
  }

  // Wire overlay buttons to callbacks supplied by main.js.
  bind({ onStart, onResume, onRetry, onContinue, onMissionPick } = {}) {
    const startBtn = document.getElementById('hud-start-btn');
    if (startBtn && onStart) startBtn.addEventListener('click', onStart);
    const resumeBtn = document.getElementById('hud-resume-btn');
    if (resumeBtn && onResume) resumeBtn.addEventListener('click', onResume);
    const retryBtn = document.getElementById('hud-retry-btn');
    if (retryBtn && onRetry) retryBtn.addEventListener('click', onRetry);
    const contBtn = document.getElementById('hud-continue-btn');
    if (contBtn && onContinue) contBtn.addEventListener('click', onContinue);
    this._onMissionPick = onMissionPick || null;
  }

  showStart() {
    this.startEl.style.display = 'flex';
    this.pauseEl.style.display = 'none';
    this.bustedEl.style.display = 'none';
    this.completeEl.style.display = 'none';
  }

  hideStart() { this.startEl.style.display = 'none'; }
  showPause() { this.pauseEl.style.display = 'flex'; }
  hidePause() { this.pauseEl.style.display = 'none'; }
  showBusted() { this.bustedEl.style.display = 'flex'; }
  hideBusted() { this.bustedEl.style.display = 'none'; }

  showMissionComplete(text) {
    const t = document.getElementById('hud-complete-text');
    if (t) t.textContent = text || '';
    this.completeEl.style.display = 'flex';
  }
  hideMissionComplete() { this.completeEl.style.display = 'none'; }

  showMessage(text, seconds) {
    this.messageEl.textContent = text;
    this.messageEl.style.opacity = '1';
    this._messageTimer = seconds || 3;
  }

  // Clear the centre toast at once (the screenshot staging uses this so
  // a long mission briefing never covers the city in the photo).
  clearMessage() {
    this.messageEl.textContent = '';
    this.messageEl.style.opacity = '0';
    this._messageTimer = 0;
  }

  // Photo mode (V): hide every piece of in-game HUD chrome — money,
  // stars, clock, vitals, minimap, objective, weapon, speed and the
  // centre toast — so the player can take a clean screenshot of the
  // city, and show a tiny hint instead. The full-screen overlays (menu,
  // pause, busted, mission complete) are NOT hidden: they are screens,
  // not chrome, and the menu still needs its Start button. Pressing V
  // again brings the chrome back.
  setPhotoMode(on) {
    this.photoMode = !!on;
    const chrome = [this.moneyEl, this.starsEl, this.clockEl, this.vitalsEl,
      this.mapCanvas, this.objectiveEl, this.weaponEl, this.speedEl,
      this.messageEl, this.menuEl];
    for (const el of chrome) {
      if (el) el.style.display = this.photoMode ? 'none' : '';
    }
    if (!this.photoHintEl) {
      this.photoHintEl = document.createElement('div');
      this.photoHintEl.id = 'hud-photo-hint';
      this.photoHintEl.textContent = 'PHOTO MODE — press V to show the HUD';
      document.body.appendChild(this.photoHintEl);
    }
    this.photoHintEl.style.display = this.photoMode ? 'block' : 'none';
    return this.photoMode;
  }

  photoModeOn() {
    return !!this.photoMode;
  }

  // Mission menu: list of missions, click to start one.
  showMissionMenu(missions, activeId) {
    const list = missions && missions.list ? missions.list : missions;
    if (!list) return;
    let html = '<h2>MISSIONS</h2>';
    list.forEach((m, i) => {
      const active = activeId === m.id || activeId === i;
      html += `<button class="mission-row${active ? ' active' : ''}" data-i="${i}">
        <b>${i + 1}. ${m.title}</b><span>$${m.payout}</span><em>${m.brief || ''}</em></button>`;
    });
    html += '<p class="hint">Click a mission or press 1-7 to start it. Press M to close.</p>';
    this.menuEl.innerHTML = html;
    this.menuEl.style.display = 'block';
    this.menuEl.querySelectorAll('.mission-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this._onMissionPick) this._onMissionPick(Number(btn.dataset.i));
        this.hideMissionMenu();
      });
    });
  }

  hideMissionMenu() { this.menuEl.style.display = 'none'; }

  // True while the M menu is on screen (the main loop uses this for the
  // 1-7 keyboard picks).
  missionMenuOpen() {
    return this.menuEl.style.display === 'block';
  }

  toggleMissionMenu(missions, activeId) {
    if (this.menuEl.style.display === 'block') this.hideMissionMenu();
    else this.showMissionMenu(missions, activeId);
  }

  // Main per-frame update. `state` is the shared game state G.
  // Missions also call update(objectiveText, distance, timeLeft) to feed
  // the objective line; that call only stores the line, it never touches
  // money, stars or the minimap.
  update(state, distance, timeLeft) {
    if (typeof state === 'string') {
      this._missionObjective = state
        ? { text: state, distance: distance || 0, timeLeft: timeLeft || 0 }
        : null;
      return;
    }
    if (!state) return;
    this._pulse += 0.016;
    this._syncMoney(state);
    this._syncWanted(state);
    this._syncClock(state);
    this._syncVitals(state);
    if (this._messageTimer > 0) {
      this._messageTimer -= 0.016;
      if (this._messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
    this._drawMinimap(state);
    this._drawObjective(state);
    this._drawSpeed(state);
    this._drawWeapon(state);
  }

  // Money: San Andreas style, eight digits, zero-padded, always green.
  _syncMoney(state) {
    if (state.money === this._lastMoney) return;
    this._lastMoney = state.money;
    const n = Math.max(0, Math.floor(state.money));
    this.moneyEl.textContent = '$' + String(n).padStart(8, '0');
  }

  _syncWanted(state) {
    const wanted = Math.max(0, Math.min(CONFIG.WANTED_MAX, Math.floor(state.wanted || 0)));
    if (wanted === this._lastWanted) return;
    this._lastWanted = wanted;
    let stars = '';
    for (let i = 0; i < CONFIG.WANTED_MAX; i++) stars += i < wanted ? '★' : '☆';
    this.starsEl.textContent = stars;
    this.starsEl.classList.toggle('hot', wanted >= 3);
  }

  // In-game clock: the day/night cycle's hour (18.5 = 18:30 at boot),
  // falling back to the old "one game minute every 2 s" clock when the
  // hour is not published (a HUD-only update with no game state).
  _syncClock(state) {
    let totalMin;
    if (typeof state.hour === 'number') {
      totalMin = state.hour * 60;
    } else {
      totalMin = 18 * 60 + 30 + (state.time || 0) * 0.5;
    }
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const mm = String(Math.floor(totalMin % 60)).padStart(2, '0');
    const clock = hh + ':' + mm;
    if (clock === this._lastClock) return;
    this._lastClock = clock;
    this.clockEl.textContent = clock;
  }

  // Health + armor bars.
  _syncVitals(state) {
    const health = Math.max(0, Math.min(100, state.health !== undefined ? state.health : 100));
    const armor = Math.max(0, Math.min(100, state.armor !== undefined ? state.armor : 0));
    if (health !== this._lastHealth) {
      this._lastHealth = health;
      this.healthFill.style.width = health + '%';
      this.healthFill.classList.toggle('low', health < 30);
    }
    if (armor !== this._lastArmor) {
      this._lastArmor = armor;
      this.armorFill.style.width = armor + '%';
    }
  }

  // Big circular minimap, bottom-left: the world rotates around the
  // player so the player always faces up (San Andreas style), zoomed to
  // the nearby streets. The map draws the STREETS first — wide pale roads
  // on dark land, blocks as quiet dark slabs between them — so it reads
  // as a real street map with a player arrow and blips, not a schematic
  // of grey boxes.
  _drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 240;
    const R = S / 2;
    const world = state.world;
    if (!world || !world.bounds) return;
    const b = world.bounds;
    const p = state.player ? state.player.pos : { x: 0, z: 0 };
    const heading = state.player ? (state.player.heading || 0) : 0;
    // Zoom: show ~130 m around the player.
    const viewR = 130;
    const scale = R / viewR;
    const rx = (x) => (x - p.x) * scale;
    const rz = (z) => (z - p.z) * scale;

    ctx.clearRect(0, 0, S, S);
    ctx.save();
    ctx.beginPath();
    ctx.arc(R, R, R - 1, 0, Math.PI * 2);
    ctx.clip();
    // Dark land first — the whole disc is city ground, not void.
    ctx.fillStyle = '#141a26';
    ctx.fillRect(0, 0, S, S);
    ctx.translate(R, R);
    // Rotate so the player's forward points up the screen.
    ctx.rotate(heading + Math.PI);

    // Water (east edge) + beach strip, drawn wide enough to cover the
    // rotated view whatever the heading.
    const waterFrom = rx(b.maxX - CONFIG.WATER_WIDTH);
    const beachFrom = rx(b.maxX - CONFIG.WATER_WIDTH - CONFIG.BEACH_WIDTH);
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(waterFrom, -S * 2, S * 4, S * 4);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(beachFrom, -S * 2, waterFrom - beachFrom, S * 4);

    // City blocks: quiet dark slabs BETWEEN the roads — the roads are
    // the bright feature, the blocks just fill the gaps.
    const buildings = world.buildings || [];
    ctx.fillStyle = 'rgba(38,46,66,0.9)';
    for (const bd of buildings) {
      const w = (bd.scale ? bd.scale.x : 10) * scale;
      const d = (bd.scale ? bd.scale.z : 10) * scale;
      if (w < 1.5 || d < 1.5) continue;
      ctx.fillRect(rx(bd.position.x) - w / 2, rz(bd.position.z) - d / 2, w, d);
    }
    // Roads: wide, pale, the dominant feature — a real street map.
    const roads = world.roads || [];
    ctx.strokeStyle = '#aab0bd';
    ctx.lineWidth = Math.max(4, CONFIG.ROAD_WIDTH * scale);
    ctx.lineCap = 'round';
    for (const r of roads) {
      ctx.beginPath();
      if (r.vertical) {
        ctx.moveTo(rx(r.x), -S * 2);
        ctx.lineTo(rx(r.x), S * 2);
      } else {
        ctx.moveTo(-S * 2, rz(r.z));
        ctx.lineTo(S * 2, rz(r.z));
      }
      ctx.stroke();
    }
    // Road centre dashes (thin, bright yellow, so the grid pops).
    ctx.strokeStyle = 'rgba(232,195,60,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 9]);
    for (const r of roads) {
      ctx.beginPath();
      if (r.vertical) {
        ctx.moveTo(rx(r.x), -S * 2);
        ctx.lineTo(rx(r.x), S * 2);
      } else {
        ctx.moveTo(-S * 2, rz(r.z));
        ctx.lineTo(S * 2, rz(r.z));
      }
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Mission marker (pulsing yellow diamond, bigger now).
    const missionPos = this._missionTarget(state);
    if (missionPos) {
      const pulse = 8 + Math.sin(this._pulse * 5) * 3;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(rx(missionPos[0]), rz(missionPos[1]) - pulse - 4);
      ctx.lineTo(rx(missionPos[0]) + pulse + 4, rz(missionPos[1]));
      ctx.lineTo(rx(missionPos[0]), rz(missionPos[1]) + pulse + 4);
      ctx.lineTo(rx(missionPos[0]) - pulse - 4, rz(missionPos[1]));
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // Traffic dots (white).
    if (state.traffic && state.traffic.cars) {
      ctx.fillStyle = '#ffffff';
      for (const c of state.traffic.cars) {
        ctx.fillRect(rx(c.pos.x) - 2, rz(c.pos.z) - 2, 4, 4);
      }
    }
    // Parked / player cars (light blue dots).
    if (state.vehicles) {
      ctx.fillStyle = '#9fd8ff';
      for (const v of state.vehicles) {
        if (v === state.playerVehicle) continue;
        ctx.fillRect(rx(v.pos.x) - 2, rz(v.pos.z) - 2, 4, 4);
      }
    }
    // Pedestrians (tiny grey dots — the city is alive on the map too).
    if (state.pedestrians && state.pedestrians.people) {
      ctx.fillStyle = 'rgba(220,220,220,0.85)';
      for (const pp of state.pedestrians.people) {
        ctx.fillRect(rx(pp.pos.x) - 1, rz(pp.pos.z) - 1, 2, 2);
      }
    }
    // The race rival (purple dot) and the vigilante fleeing cars
    // (orange dots) — the new jobs are visible on the map.
    const m = state.missions;
    if (m) {
      if (m.rival && m.rival.pos) {
        ctx.fillStyle = '#b06cff';
        ctx.fillRect(rx(m.rival.pos.x) - 3, rz(m.rival.pos.z) - 3, 6, 6);
      }
      if (m.fleeing) {
        ctx.fillStyle = '#ff8c1a';
        for (const f of m.fleeing) {
          if (f.stopped) continue;
          ctx.fillRect(rx(f.pos.x) - 3, rz(f.pos.z) - 3, 6, 6);
        }
      }
    }
    // Cop blips (red circles with a white ring — unmissable).
    if (state.police && state.police.copCars) {
      for (const c of state.police.copCars) {
        ctx.beginPath();
        ctx.arc(rx(c.pos.x), rz(c.pos.z), 6, 0, Math.PI * 2);
        ctx.fillStyle = '#ff2e2e';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
    // The police helicopter (a red ring with a white centre dot).
    if (state.police && state.police.heli) {
      const hp = state.police.heli.position;
      ctx.beginPath();
      ctx.arc(rx(hp.x), rz(hp.z), 8, 0, Math.PI * 2);
      ctx.strokeStyle = '#ff2e2e';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(rx(hp.x), rz(hp.z), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();

    // Player arrow: fixed at the centre, always pointing up — bigger
    // now, white with a dark outline, so it cannot be missed.
    ctx.save();
    ctx.translate(R, R);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, -13);
    ctx.lineTo(9, 10);
    ctx.lineTo(0, 5);
    ctx.lineTo(-9, 10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Circular border + soft outer ring.
    ctx.beginPath();
    ctx.arc(R, R, R - 1.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(R, R, R - 5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _missionTarget(state) {
    const m = state.missions;
    if (!m || !m.active) return null;
    // The live objective marker missions.js publishes for the minimap.
    if (m.markerPos) return [m.markerPos.x, m.markerPos.z];
    if (typeof m.targetPos === 'function') return m.targetPos();
    if (m.active.target) return m.active.target;
    if (m.active.pos) return [m.active.pos.x, m.active.pos.z];
    return null;
  }

  _drawObjective(state) {
    // The objective bar is a playing-state element only. It used to show
    // under the BUSTED overlay (and its "Press M" line behind the
    // mission-complete screen); every non-playing state hides it now.
    if (state.state !== 'playing') {
      this.objectiveEl.style.display = 'none';
      return;
    }
    const m = state.missions;
    if (m && m.active) {
      const a = m.active;
      // The objective line missions.js feeds in each update wins when it
      // has one; otherwise build the line from the active mission.
      if (this._missionObjective && this._missionObjective.text) {
        const o = this._missionObjective;
        let text = '◆ ' + o.text;
        if (o.distance) text += '  ·  ' + Math.round(o.distance) + 'm';
        if (o.timeLeft) text += '  ·  ' + Math.max(0, Math.ceil(o.timeLeft)) + 's';
        this.objectiveEl.textContent = text;
        this.objectiveEl.style.display = 'block';
        return;
      }
      const dist = this._missionDistance(state);
      let text = '◆ ' + (a.title || 'Mission');
      if (a.objective) text += ' — ' + a.objective;
      if (dist !== null) text += '  ·  ' + Math.round(dist) + 'm';
      if (a.timeLeft !== undefined && a.timeLeft !== null) {
        text += '  ·  ' + Math.max(0, Math.ceil(a.timeLeft)) + 's';
      }
      this.objectiveEl.textContent = text;
      this.objectiveEl.style.display = 'block';
    } else {
      this.objectiveEl.textContent = 'Press M for missions — E to steal a car';
      this.objectiveEl.style.display = 'block';
    }
  }

  _missionDistance(state) {
    const target = this._missionTarget(state);
    const p = state.player ? state.player.pos : null;
    if (!target || !p) return null;
    return Math.hypot(target[0] - p.x, target[1] - p.z);
  }

  _drawSpeed(state) {
    // The speedometer only shows while playing. It used to keep the last
    // speed (a ghost "98 km/h") on the mission-complete screen.
    const v = state.playerVehicle;
    if (v && state.player && !state.player.onFoot && state.state === 'playing') {
      const kmh = Math.abs(v.speed || 0) * 3.6;
      this.speedEl.textContent = Math.round(kmh) + ' km/h';
      this.speedEl.style.display = 'block';
    } else {
      this.speedEl.style.display = 'none';
    }
  }

  _drawWeapon(state) {
    // Weapon slot (bottom-right, above the speedometer): the pistol with
    // its ammo when drawn, "RELOADING…" while the magazine is being
    // swapped, fists on foot otherwise, hidden while driving (GTA shows
    // the current weapon bottom-right; fists are all the fists build
    // carried before the pistol arrived).
    if (!state.player || !state.player.onFoot || state.state !== 'playing') {
      this.weaponEl.style.display = 'none';
      return;
    }
    const pl = state.player;
    let text;
    if (pl.weapon === 'pistol') {
      text = pl.reloadTimer > 0
        ? 'PISTOL  RELOADING…'
        : `PISTOL  ${pl.ammo}/${CONFIG.PISTOL_MAG}`;
    } else {
      text = 'FISTS  ∞';
    }
    if (text !== this._lastWeapon) {
      this._lastWeapon = text;
      this.weaponEl.textContent = text;
    }
    this.weaponEl.classList.toggle('reloading', pl.weapon === 'pistol' && pl.reloadTimer > 0);
    this.weaponEl.style.display = 'block';
  }
}
