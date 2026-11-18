// VICE HARBOR v6 — street traffic.
// Cars that loop the road grid: each one owns a lane (a road line plus a
// side offset), a cruising speed, and a next corner. At every corner it
// picks a new direction; near a junction it eases off so the flow reads
// as traffic, not a slot-car track. Traffic cars are plain Vehicle
// meshes with no driver — the streets system steers them by setting
// heading and speed directly, and they never leave the road lines.

import { CFG } from './settings.js';
import { Vehicle, PAINT } from './vehicles.js';

export function makeStreets(THREE, city, rng, count) {
  const cars = [];
  let onHonk = null;
  let playerCar = null;
  const kinds = ['sedan', 'taxi', 'pickup', 'van', 'bus', 'limo', 'convertible', 'foodtruck'];
  for (let i = 0; i < count; i += 1) {
    const kind = rng.pick(kinds);
    const vertical = rng.chance(0.5);
    const line = vertical
      ? city.roadXs[Math.floor(rng.next() * city.roadXs.length)]
      : city.roadZs[Math.floor(rng.next() * city.roadZs.length)];
    const side = rng.chance(0.5) ? 3.1 : -3.1;
    const along = -city.half + 10 + rng.next() * (city.half * 2 - 20);
    const x = vertical ? line + side : along;
    const z = vertical ? along : line + side;
    const heading = vertical ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
    const car = new Vehicle(THREE, city, kind, x, z, heading, rng.pick(PAINT));
    car.speed = 8 + rng.next() * 7;
    car.cruise = car.speed;
    car.vertical = vertical;
    car.line = line;
    car.side = side;
    car.target = along + (rng.next() - 0.5) * 60;
    city.group.add(car.mesh);
    cars.push(car);
  }

  function closestLine(value, lines) {
    let best = lines[0];
    let bestD = Math.abs(value - lines[0]);
    for (const l of lines) {
      const d = Math.abs(value - l);
      if (d < bestD) { bestD = d; best = l; }
    }
    return best;
  }

  const streets = {
    cars,

    // The player's car, so traffic can honk when it blocks the road.
    setPlayer(car) {
      playerCar = car || null;
      return streets;
    },

    // A hook for the honk sound: called with the car that honked.
    onHonk(fn) {
      onHonk = typeof fn === 'function' ? fn : null;
      return streets;
    },

    update(dt) {
      for (const car of cars) {
        // Ease off near a junction (within 10 m of a cross road).
        const along = car.vertical ? car.pos.z : car.pos.x;
        const crossLines = car.vertical ? city.roadZs : city.roadXs;
        let nearJunction = false;
        for (const cl of crossLines) {
          if (Math.abs(along - cl) < 10) { nearJunction = true; break; }
        }
        const want = car.cruise * (nearJunction ? CFG.JUNCTION_EASE : 1);
        car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
        // Drive along the lane; at the end of the stretch, turn a corner.
        const step = car.speed * dt;
        if (car.vertical) {
          car.pos.z += Math.cos(car.heading) * step;
          car.pos.x = car.line + car.side;
        } else {
          car.pos.x += Math.sin(car.heading) * step;
          car.pos.z = car.line + car.side;
        }
        const done = car.vertical
          ? (car.heading === 0 && car.pos.z > car.target) || (car.heading === Math.PI && car.pos.z < car.target)
          : (car.heading === Math.PI / 2 && car.pos.x > car.target) || (car.heading === -Math.PI / 2 && car.pos.x < car.target);
        if (done || Math.abs(along) > city.half - 6) {
          // Pick a new stretch on a nearby road line.
          const lines = car.vertical ? city.roadXs : city.roadZs;
          const nl = closestLine(car.vertical ? car.pos.x : car.pos.z, lines);
          const other = lines[Math.max(0, Math.min(lines.length - 1, lines.indexOf(nl) + (rng.next() < 0.5 ? -1 : 1)))];
          const newSide = rng.chance(0.5) ? 3.1 : -3.1;
          if (car.vertical) {
            car.line = other;
            car.side = newSide;
            car.heading = newSide > 0 ? Math.PI : 0;
            car.pos.x = other + newSide;
            car.target = car.heading === 0 ? city.half - 10 : -city.half + 10;
          } else {
            car.line = other;
            car.side = newSide;
            car.heading = newSide > 0 ? -Math.PI / 2 : Math.PI / 2;
            car.pos.z = other + newSide;
            car.target = car.heading === Math.PI / 2 ? city.half - 10 : -city.half + 10;
          }
        }
        car.sync();
        // Honk when the player's car sits in the road ahead and the
        // traffic behind it has slowed to a crawl for a couple of
        // seconds — the city's way of saying "move it".
        if (playerCar && playerCar.pos) {
          const dx = playerCar.pos.x - car.pos.x;
          const dz = playerCar.pos.z - car.pos.z;
          const ahead = car.vertical ? dz * Math.cos(car.heading) : dx * Math.sin(car.heading);
          const side = Math.abs(car.vertical ? dx : dz);
          if (ahead > 0 && ahead < 9 && side < 3 && car.speed < 4) {
            car.honkT = (car.honkT || 0) + dt;
            if (car.honkT > 2 && onHonk) {
              car.honkT = 0;
              onHonk(car);
            }
          } else {
            car.honkT = 0;
          }
        }
      }
      return streets;
    },

    // The closest traffic car to a point (for near-miss pay and collisions).
    nearestTo(x, z, maxD) {
      let best = null;
      let bestD = maxD;
      for (const car of cars) {
        const dx = car.pos.x - x;
        const dz = car.pos.z - z;
        const d = Math.hypot(dx, dz);
        if (d < bestD) { bestD = d; best = car; }
      }
      return best;
    },
  };
  return streets;
}
