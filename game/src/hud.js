// HUD: DOM overlay — money + wanted stars, minimap (2D canvas, top-down),
// mission objective + distance + timer, speedometer, centre messages,
// and the start / paused / busted / mission-complete screens.
// All DOM/CSS lives here plus the <style> in index.html.
// v2: the speedometer and the objective bar only show while actually
// playing (v1 left a ghost speed on the mission-complete screen and the
// objective bar under the BUSTED overlay), the controls list names the
// camera (C), punch (F) and 1-4 mission picks, and the mission menu
// reports whether it is open so the keyboard can pick from it.

import { CONFIG } from './config.js';

const CONTROLS_HTML = `
  <div class="ctl"><b>W A S D</b> move / drive</div>
  <div class="ctl"><b>Shift</b> run &nbsp; <b>Space</b> handbrake</div>
  <div class="ctl"><b>E</b> enter / exit car &nbsp; <b>M</b> missions</div>
  <div class="ctl"><b>F</b> punch &nbsp; <b>C</b> camera &nbsp; <b>1-4</b> pick mission</div>
  <div class="ctl"><b>Mouse drag</b> orbit camera &nbsp; <b>Wheel</b> zoom</div>
  <div class="ctl"><b>P</b> pause &nbsp; <b>H</b> horn &nbsp; <b>Enter</b> start / continue</div>`;

export class HUD {
  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'hud';
    document.body.appendChild(this.root);

    // Top-left: money + wanted stars.
    this.moneyEl = document.createElement('div');
    this.moneyEl.id = 'hud-money';
    this.moneyEl.textContent = '$0';
    this.root.appendChild(this.moneyEl);

    this.starsEl = document.createElement('div');
    this.starsEl.id = 'hud-stars';
    this.root.appendChild(this.starsEl);

    // Top-right: minimap canvas.
    this.mapCanvas = document.createElement('canvas');
    this.mapCanvas.id = 'hud-minimap';
    this.mapCanvas.width = 180;
    this.mapCanvas.height = 180;
    this.root.appendChild(this.mapCanvas);
    this.mapCtx = this.mapCanvas.getContext('2d');

    // Bottom-centre: mission objective.
    this.objectiveEl = document.createElement('div');
    this.objectiveEl.id = 'hud-objective';
    this.root.appendChild(this.objectiveEl);

    // Bottom-right: speedometer.
    this.speedEl = document.createElement('div');
    this.speedEl.id = 'hud-speed';
    this.root.appendChild(this.speedEl);

    // Centre message toast.
    this.messageEl = document.createElement('div');
    this.messageEl.id = 'hud-message';
    this.root.appendChild(this.messageEl);
    this._messageTimer = 0;

    // Mission menu (M).
    this.menuEl = document.createElement('div');
    this.menuEl.id = 'hud-mission-menu';
    this.menuEl.style.display = 'none';
    this.root.appendChild(this.menuEl);

    // Full-screen overlays.
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

    this._lastMoney = -1;
    this._lastWanted = -1;
    this._pulse = 0;
    // Latest mission objective line, fed by missions.js as
    // update(objectiveText, distance, timeLeft).
    this._missionObjective = null;
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
    html += '<p class="hint">Click a mission or press 1-4 to start it. Press M to close.</p>';
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
  // 1-4 keyboard picks).
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
    if (state.money !== this._lastMoney) {
      this._lastMoney = state.money;
      this.moneyEl.textContent = '$' + Math.floor(state.money).toLocaleString('en-US');
    }
    const wanted = Math.max(0, Math.min(CONFIG.WANTED_MAX, Math.floor(state.wanted || 0)));
    if (wanted !== this._lastWanted) {
      this._lastWanted = wanted;
      let stars = '';
      for (let i = 0; i < CONFIG.WANTED_MAX; i++) stars += i < wanted ? '★' : '☆';
      this.starsEl.textContent = stars;
      this.starsEl.classList.toggle('hot', wanted >= 3);
    }
    if (this._messageTimer > 0) {
      this._messageTimer -= 0.016;
      if (this._messageTimer <= 0) this.messageEl.style.opacity = '0';
    }
    this._drawMinimap(state);
    this._drawObjective(state);
    this._drawSpeed(state);
  }

  _drawMinimap(state) {
    const ctx = this.mapCtx;
    const S = 180;
    const world = state.world;
    if (!world || !world.bounds) return;
    const b = world.bounds;
    const spanX = b.maxX - b.minX;
    const spanZ = b.maxZ - b.minZ;
    const scale = S / Math.max(spanX, spanZ);
    const toX = (x) => (x - b.minX) * scale;
    const toY = (z) => (z - b.minZ) * scale;

    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(10,14,24,0.82)';
    ctx.fillRect(0, 0, S, S);
    // Water (east edge).
    ctx.fillStyle = '#1d6f8e';
    const beachX = toX(world.bounds.maxX - CONFIG.WATER_WIDTH - CONFIG.BEACH_WIDTH);
    ctx.fillRect(beachX, 0, S - beachX, S);
    ctx.fillStyle = '#d9c08a';
    ctx.fillRect(beachX - CONFIG.BEACH_WIDTH * scale, 0, CONFIG.BEACH_WIDTH * scale, S);
    // Roads.
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = Math.max(2, CONFIG.ROAD_WIDTH * scale);
    const roads = world.roads || [];
    for (const r of roads) {
      ctx.beginPath();
      if (r.vertical) {
        ctx.moveTo(toX(r.x), 0);
        ctx.lineTo(toX(r.x), S);
      } else {
        ctx.moveTo(0, toY(r.z));
        ctx.lineTo(S, toY(r.z));
      }
      ctx.stroke();
    }
    // Mission marker (pulsing diamond).
    const missionPos = this._missionTarget(state);
    if (missionPos) {
      const pulse = 4 + Math.sin(this._pulse * 5) * 2;
      ctx.fillStyle = '#ffd23c';
      ctx.beginPath();
      ctx.moveTo(toX(missionPos[0]), toY(missionPos[1]) - pulse - 3);
      ctx.lineTo(toX(missionPos[0]) + pulse + 3, toY(missionPos[1]));
      ctx.lineTo(toX(missionPos[0]), toY(missionPos[1]) + pulse + 3);
      ctx.lineTo(toX(missionPos[0]) - pulse - 3, toY(missionPos[1]));
      ctx.closePath();
      ctx.fill();
    }
    // Traffic dots.
    if (state.traffic && state.traffic.cars) {
      ctx.fillStyle = '#e8e8e8';
      for (const c of state.traffic.cars) {
        ctx.fillRect(toX(c.pos.x) - 1.5, toY(c.pos.z) - 1.5, 3, 3);
      }
    }
    // Parked / player cars.
    if (state.vehicles) {
      ctx.fillStyle = '#9fd8ff';
      for (const v of state.vehicles) {
        if (v === state.playerVehicle) continue;
        ctx.fillRect(toX(v.pos.x) - 1.5, toY(v.pos.z) - 1.5, 3, 3);
      }
    }
    // Cop dots.
    if (state.police && state.police.copCars) {
      ctx.fillStyle = '#ff4d4d';
      for (const c of state.police.copCars) {
        ctx.beginPath();
        ctx.arc(toX(c.pos.x), toY(c.pos.z), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Player arrow.
    const p = state.player ? state.player.pos : null;
    if (p) {
      const heading = state.player.heading || 0;
      ctx.save();
      ctx.translate(toX(p.x), toY(p.z));
      ctx.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI / 2);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4.5, 5);
      ctx.lineTo(0, 2.5);
      ctx.lineTo(-4.5, 5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // Border.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, S - 1, S - 1);
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
    // v2: the objective bar is a playing-state element only. v1 left it
    // showing under the BUSTED overlay (and its "Press M" line behind the
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
    // v2: the speedometer only shows while playing. v1 kept the last
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
}
