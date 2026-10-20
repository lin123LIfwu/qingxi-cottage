import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { House } from '../src/world/house.js';
import { Colliders } from '../src/world/colliders.js';
import { CABIN, HOME_H } from '../src/config.js';

function makeHouse() {
  const T = { decks: [] };
  const col = new Colliders();
  const st = { noGrassRects: [], interact: [], group: new THREE.Group(), lights: [] };
  const H = new House(T, {}, col, st);
  return { H, T, col, st };
}

test('house layout registers floors, bed, grass mask and the door', () => {
  const { H, T, st } = makeHouse();
  assert.equal(T.decks.length, 9);
  assert.ok(T.decks.filter(d => d.upper).length >= 3);
  assert.equal(st.interact.find(i => i.id === 'bed').lv, 1);
  assert.equal(st.interact.find(i => i.id === 'bed').r, 1.9);
  assert.ok(st.noGrassRects.length >= 5);
  assert.equal(H.doorCol.off, true);
  assert.ok(H.wake.y > HOME_H + 3);
  assert.equal(H.blockers.length, 3);
});

test('interior, floor and no-jump queries follow the layout', () => {
  const { H } = makeHouse();
  assert.equal(H.inside(CABIN.x, CABIN.z), true);
  assert.equal(H.inside(CABIN.x, CABIN.z + 5), false);
  assert.equal(H.covered(CABIN.x, CABIN.z), true);
  assert.equal(H.covered(CABIN.x, CABIN.z + 6), false);
  assert.equal(H.masked(CABIN.x, HOME_H + 1, CABIN.z), true);
  assert.equal(H.masked(CABIN.x, HOME_H + 9, CABIN.z), false);
  assert.equal(H.levelOf(CABIN.x, CABIN.z, HOME_H + 0.45), 0);
  assert.equal(H.levelOf(CABIN.x, CABIN.z, HOME_H + 3.3), 1);
  assert.equal(H.noJump(CABIN.x, CABIN.z), true);
  assert.equal(H.noJump(CABIN.x + 12, CABIN.z), false);
});
