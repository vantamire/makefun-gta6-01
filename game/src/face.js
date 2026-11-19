// face.js — the HUD of VICE HARBOR.
// The portrait and health bars top-left, money, stars and clock
// top-right, the big circular rotating minimap beneath them, the
// mission objective, the weapon and speed readouts, and every menu:
// start, job board, pause, busted and wasted. It owns its own CSS
// and DOM, injected here so index.html stays a thin shell.

import { TUNE } from './tune.js';

const CSS = `
#vh-hud{position:fixed;inset:0;pointer-events:none;z-index:10;color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
#vh-face{position:absolute;top:12px;left:16px;width:92px;height:92px;border:3px solid rgba(255,255,255,.92);border-radius:50%;overflow:hidden;background:linear-gradient(180deg,#8a2f3c,#3d1420 70%);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 6px 22px rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center}
#vh-face-letter{font-size:34px;font-weight:900;color:#ffd9a0;text-shadow:0 2px 0 rgba(0,0,0,.6),0 0 18px rgba(255,120,60,.5)}
#vh-vitals{position:absolute;top:112px;left:16px;width:92px}
#vh-vitals span{font-size:10px;font-weight:800;letter-spacing:1px;color:#e8eaf0;text-shadow:0 1px 2px rgba(0,0,0,.9)}
.vh-bar{height:10px;background:rgba(0,0,0,.65);border:1px solid rgba(255,255,255,.45);border-radius:5px;overflow:hidden;margin:2px 0 6px}
.vh-fill-health{height:100%;background:linear-gradient(180deg,#8dffab,#2fbf5a)}
.vh-fill-health.low{background:linear-gradient(180deg,#ff9a9a,#d21f1f)}
.vh-fill-armor{height:100%;background:linear-gradient(180deg,#bfe3ff,#4d8fd1)}
#vh-money{position:absolute;top:12px;right:16px;font-size:40px;font-weight:900;color:#7dff9e;letter-spacing:2px;text-align:right;font-variant-numeric:tabular-nums;text-shadow:0 0 2px #000,0 2px 0 rgba(0,0,0,.9),0 2px 8px rgba(0,0,0,.9)}
#vh-stars{position:absolute;top:64px;right:16px;font-size:28px;letter-spacing:4px;color:#ffd23c;text-align:right;text-shadow:0 2px 0 rgba(0,0,0,.9)}
#vh-clock{position:absolute;top:100px;right:16px;font-size:18px;font-weight:800;color:#fff;text-align:right;text-shadow:0 1px 3px rgba(0,0,0,.9);font-variant-numeric:tabular-nums}
#vh-map{position:absolute;top:132px;right:16px;width:200px;height:200px;border-radius:50%;border:3px solid rgba(255,255,255,.85);box-shadow:0 0 0 2px rgba(0,0,0,.55),0 6px 22px rgba(0,0,0,.65);background:#101018}
#vh-objective{position:absolute;left:50%;bottom:118px;transform:translateX(-50%);max-width:640px;text-align:center;font-size:17px;font-weight:700;color:#fff;text-shadow:0 1px 2px #000,0 2px 8px rgba(0,0,0,.9);background:rgba(0,0,0,.45);padding:8px 16px;border-radius:10px}
#vh-notice{position:absolute;left:50%;top:32%;transform:translate(-50%,-50%);text-align:center;font-size:44px;font-weight:900;letter-spacing:3px;color:#ffd23c;text-shadow:0 3px 0 rgba(0,0,0,.8),0 0 30px rgba(255,120,60,.6);opacity:0;transition:opacity .25s}
#vh-weapon{position:absolute;left:16px;bottom:16px;font-size:20px;font-weight:800;text-shadow:0 1px 3px rgba(0,0,0,.9)}
#vh-weapon small{font-size:13px;color:#cfd4de}
#vh-speed{position:absolute;right:16px;bottom:16px;font-size:34px;font-weight:900;text-align:right;text-shadow:0 2px 0 rgba(0,0,0,.9)}
#vh-speed small{font-size:13px;color:#cfd4de}
#vh-hint{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);font-size:13px;color:#e8eaf0;text-shadow:0 1px 2px #000;background:rgba(0,0,0,.4);padding:5px 12px;border-radius:8px}
#vh-bust{position:absolute;left:50%;top:38%;transform:translate(-50%,-50%);font-size:26px;font-weight:800;color:#9db8ff;text-shadow:0 2px 0 rgba(0,0,0,.9)}
.vh-menu{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;background:linear-gradient(180deg,rgba(20,8,32,.82),rgba(60,16,32,.88));color:#fff;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.vh-panel{max-width:660px;width:92%;background:rgba(10,8,20,.92);border:1px solid rgba(255,255,255,.25);border-radius:16px;padding:28px 32px;box-shadow:0 20px 60px rgba(0,0,0,.7)}
.vh-panel h1{margin:0 0 4px;font-size:44px;letter-spacing:2px;color:#ffd23c;text-shadow:0 3px 0 rgba(0,0,0,.6)}
.vh-panel h2{margin:0 0 14px;font-size:15px;font-weight:600;color:#ffb36b;letter-spacing:3px;text-transform:uppercase}
.vh-panel p{margin:8px 0;line-height:1.5;color:#e8eaf0}
.vh-panel .vh-keys{font-size:13px;color:#cfd4de;line-height:1.9}
.vh-panel .vh-keys b{color:#fff;background:rgba(255,255,255,.14);border-radius:4px;padding:1px 6px}
.vh-btn{display:inline-block;margin:14px 8px 0 0;padding:12px 22px;font-size:16px;font-weight:800;color:#14101f;background:#ffd23c;border:0;border-radius:10px;cursor:pointer}
.vh-btn.alt{background:transparent;color:#fff;border:2px solid rgba(255,255,255,.6)}
.vh-job{display:flex;justify-content:space-between;gap:12px;padding:9px 12px;margin:6px 0;background:rgba(255,255,255,.07);border-radius:8px;cursor:pointer;border:1px solid transparent}
.vh-job:hover{border-color:#ffd23c;background:rgba(255,210,60,.12)}
.vh-job b{font-size:15px}
.vh-job span{color:#7dff9e;font-weight:800}
.vh-job small{display:block;color:#cfd4de;font-weight:400}
`;

function el(tag, id, parent, html) {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (html !== undefined) e.innerHTML = html;
  if (parent) parent.appendChild(e);
  return e;
}

export function makeHud(G) {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);

  const hud = el('div', 'vh-hud', document.body);
  const face = el('div', 'vh-face', hud);
  el('div', 'vh-face-letter', face, 'R');
  const vitals = el('div', 'vh-vitals', hud);
  el('span', null, vitals, 'HEALTH');
  const healthBar = el('div', 'vh-bar', vitals);
  const healthFill = el('div', 'vh-fill-health', healthBar);
  el('span', null, vitals, 'ARMOR');
  const armorBar = el('div', 'vh-bar', vitals);
  const armorFill = el('div', 'vh-fill-armor', armorBar);
  const money = el('div', 'vh-money', hud, '$000250');
  const stars = el('div', 'vh-stars', hud, '');
  const clock = el('div', 'vh-clock', hud, '18:30');
  const map = el('canvas', 'vh-map', hud);
  map.width = 200;
  map.height = 200;
  const objective = el('div', 'vh-objective', hud, '');
  const notice = el('div', 'vh-notice', hud, '');
  const weapon = el('div', 'vh-weapon', hud, '');
  const speed = el('div', 'vh-speed', hud, '');
  const hint = el('div', 'vh-hint', hud, '');
  const bust = el('div', 'vh-bust', hud, '');

  const mapCtx = map.getContext('2d');
  let noticeTimer = 0;
  let photoMode = false;

  function showNotice(text, color) {
    notice.textContent = text;
    notice.style.color = color || '#ffd23c';
    notice.style.opacity = '1';
    noticeTimer = 2.4;
  }

  function fmtMoney(n) {
    return '$' + String(Math.max(0, Math.round(n))).padStart(6, '0');
  }

  function fmtClock(minutes) {
    const m = Math.floor(minutes) % (24 * 60);
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  // The circular rotating minimap. North is the player's heading:
  // the world rotates under a fixed player arrow.
  function drawMap(hero, target, law, town) {
    const W = 200;
    const H = 200;
    const c = mapCtx;
    const R = 96;
    const scale = 200 / 560; // world units -> map px (560u across)
    c.save();
    c.clearRect(0, 0, W, H);
    c.beginPath();
    c.arc(100, 100, R, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = '#181824';
    c.fillRect(0, 0, W, H);
    // rotate so the hero's heading points up
    c.translate(100, 100);
    c.rotate(-hero.heading);
    c.translate(-hero.x * scale, -hero.z * scale);
    // water
    c.fillStyle = '#1d4a6b';
    c.fillRect(TUNE.waterX * scale, -300 * scale, 300 * scale, 600 * scale);
    // blocks
    c.fillStyle = '#3a3a48';
    const P = TUNE.pitch;
    for (let bx = -4; bx < 4; bx++) {
      for (let bz = -4; bz < 4; bz++) {
        c.fillRect((bx * P + 8) * scale, (bz * P + 8) * scale, (P - 16) * scale, (P - 16) * scale);
      }
    }
    // roads
    c.strokeStyle = '#8a8578';
    c.lineWidth = 7 * scale;
    for (let k = -4; k <= 4; k++) {
      c.beginPath(); c.moveTo(k * P * scale, -260 * scale); c.lineTo(k * P * scale, 260 * scale); c.stroke();
      c.beginPath(); c.moveTo(-260 * scale, k * P * scale); c.lineTo(260 * scale, k * P * scale); c.stroke();
    }
    // boardwalk + pier
    c.fillStyle = '#8a6a4a';
    c.fillRect((P * 3.5 - 8) * scale, -260 * scale, 34 * scale, 520 * scale);
    c.fillRect(TUNE.waterX * scale, (P * 0.5 - 5) * scale, 60 * scale, 10 * scale);
    // mission target
    if (target) {
      c.fillStyle = '#ffe14d';
      c.save();
      c.translate(target.x * scale, target.z * scale);
      c.rotate(Math.PI / 4);
      c.fillRect(-7, -7, 14, 14);
      c.restore();
      c.strokeStyle = '#ffe14d';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(target.x * scale, target.z * scale, 11 + Math.sin(G.timeSec * 4) * 3, 0, Math.PI * 2);
      c.stroke();
    }
    // cops
    c.fillStyle = '#2a6aff';
    for (const cop of law.cops) {
      c.beginPath();
      c.arc(cop.x * scale, cop.z * scale, 4, 0, Math.PI * 2);
      c.fill();
    }
    if (law.heli) {
      c.fillStyle = '#ff2a3c';
      c.beginPath();
      c.arc(law.heli.mesh.position.x * scale, law.heli.mesh.position.z * scale, 5, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
    // player arrow, fixed in the centre
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(100, 88);
    c.lineTo(94, 106);
    c.lineTo(100, 101);
    c.lineTo(106, 106);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.8)';
    c.lineWidth = 1.5;
    c.stroke();
    // north tick
    c.fillStyle = '#fff';
    c.font = 'bold 12px system-ui';
    c.textAlign = 'center';
    c.fillText('N', 100, 16);
  }

  function update(dt, state) {
    const hero = state.hero;
    const law = state.law;
    if (noticeTimer > 0) {
      noticeTimer -= dt;
      if (noticeTimer <= 0) notice.style.opacity = '0';
    }
    healthFill.style.width = `${hero.health}%`;
    healthFill.classList.toggle('low', hero.health < 30);
    armorFill.style.width = `${hero.armor}%`;
    money.textContent = fmtMoney(hero.money);
    stars.textContent = '★'.repeat(law.wanted) + '☆'.repeat(TUNE.maxStars - law.wanted);
    clock.textContent = fmtClock(state.clockMinutes);
    const spec = TUNE.weapons[hero.weapon];
    weapon.innerHTML = `${hero.weapon.toUpperCase()} <small>${hero.mag[hero.weapon]} / ${hero.ammo[hero.weapon]} — Q weapon · X swap · R reload</small>`;
    if (hero.car) {
      const kmh = Math.abs(hero.car.speed) * 3.6;
      speed.innerHTML = `${Math.round(kmh)} <small>km/h</small>`;
      hint.textContent = 'E exit car · H horn · V photo';
    } else {
      speed.textContent = '';
      hint.textContent = 'WASD move · Shift run · E enter car · F punch · Q weapon · M radio';
    }
    if (state.bustText) bust.textContent = state.bustText;
    else bust.textContent = '';
    if (!photoMode) drawMap(hero, state.target, law, state.town);
  }

  function setObjective(text) {
    objective.textContent = text || '';
    objective.style.display = text ? 'block' : 'none';
  }

  function setPhoto(on) {
    photoMode = on;
    hud.style.display = on ? 'none' : 'block';
  }

  function menu(html) {
    const m = el('div', null, document.body);
    m.className = 'vh-menu';
    m.innerHTML = `<div class="vh-panel">${html}</div>`;
    return m;
  }

  return {
    update, showNotice, setObjective, setPhoto, menu,
    fmtMoney, fmtClock,
  };
}
