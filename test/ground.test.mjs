import test from 'node:test';
import assert from 'node:assert/strict';
import { Terrain } from '../src/world/terrain.js';

// groundHeight only needs heightAt / decks, so a small stub is enough for the multi-floor rules
function stub(decks) { return { heightAt: () => 0, decks }; }
const gh = Terrain.prototype.groundHeight;

test('upper-floor decks only count when the feet can reach them', () => {
  const decks = [
    { cx: 0, cz: 0, ax: 1, az: 0, halfLen: 2, halfW: 2, heightFn: () => 3.3, upper: 1 },
    { cx: 0, cz: 0, ax: 1, az: 0, halfLen: 2, halfW: 2, heightFn: () => 0.45 },
  ];
  const T = stub(decks);
  assert.equal(gh.call(T, 0, 0, 0.45), 0.45);   // standing downstairs
  assert.equal(gh.call(T, 0, 0, 3.3), 3.3);     // standing upstairs
  assert.equal(gh.call(T, 0, 0), 0.45);         // no ref: keep the legacy ground floor
});

test('a stair ramp is continuous and docks keep their old behaviour', () => {
  const ramp = { cx: 0, cz: -2.85, ax: 1, az: 0, halfLen: 1.875, halfW: 0.475, heightFn: (u) => 0.45 + 2.85 * (u + 1.875) / 3.75 };
  const dock = { cx: 0, cz: 10, ax: 1, az: 0, halfLen: 2, halfW: 1, heightFn: () => 1.4 };
  const T = stub([ramp, dock]);
  let prev = gh.call(T, -1.875, -2.85, 0.45);
  for (let x = -1.825; x <= 1.875; x += 0.05) {
    const h = gh.call(T, x, -2.85, prev);
    assert.ok(Math.abs(h - prev) <= 0.05, `stair step at x=${x.toFixed(3)}: ${prev} -> ${h}`);
    prev = h;
  }
  assert.equal(gh.call(T, 0, 10, 0.62), 1.4);   // wading below the dock still sees the dock
  assert.equal(gh.call(T, 0, 10, 99), 1.4);
});
