import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { occludeDist, blendPos } from '../src/game/camera.js';

test('occludeDist stops the orbit camera outside a wall', () => {
  const wall = [-1, -1, 0, 1, 10, 0.2];
  const target = new THREE.Vector3(0, 1.5, -5);
  const dir = new THREE.Vector3(0, 0, 1);
  const d = occludeDist(target, dir, 8, [wall]);
  const camZ = target.z + d;
  assert.ok(camZ <= 0, `camera should stay south of the wall, got z=${camZ}`);
  assert.ok(d >= 0.3 && d < 8);
});

test('blendPos routes the view change through the door point', () => {
  const from = new THREE.Vector3(0, 0, 0);
  const via = new THREE.Vector3(1, 0, 0);
  const to = new THREE.Vector3(2, 0, 0);
  const p = new THREE.Vector3();
  blendPos(p, from, via, to, 0); assert.deepEqual([p.x, p.y, p.z], [0, 0, 0]);
  blendPos(p, from, via, to, 0.5); assert.deepEqual([p.x, p.y, p.z], [1, 0, 0]);
  blendPos(p, from, via, to, 1); assert.deepEqual([p.x, p.y, p.z], [2, 0, 0]);
  blendPos(p, from, via, to, 0.25); assert.ok(p.x < 1);
});
