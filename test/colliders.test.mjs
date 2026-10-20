import test from 'node:test';
import assert from 'node:assert/strict';
import { Colliders } from '../src/world/colliders.js';

test('colliders are filtered by floor tag', () => {
  const c = new Colliders();
  c.addBox(0, 0, 1, 1, 0, 'ground', 0);
  c.addBox(5, 0, 1, 1, 0, 'upper', 1);
  c.addCircle(10, 0, 1, 'shared');
  assert.ok(c.hit(0, 0, 0.1, 0));
  assert.equal(c.hit(0, 0, 0.1, 1), null);
  assert.ok(c.hit(5, 0, 0.1, 1));
  assert.equal(c.hit(5, 0, 0.1, 0), null);
  assert.ok(c.hit(10, 0, 0.1, 0));
  assert.ok(c.hit(10, 0, 0.1, 1));
});

test('resolve pushes out of the matching floor and ignores the other one', () => {
  const c = new Colliders();
  c.addBox(0, 0, 1, 1, 0, 'upper', 1);
  const low = { x: 0, z: 0 };
  c.resolve(low, 0.3, 0);
  assert.deepEqual([+low.x.toFixed(3), +low.z.toFixed(3)], [0, 0]);
  const high = { x: 0, z: 0 };
  c.resolve(high, 0.3, 1);
  assert.ok(Math.hypot(high.x, high.z) > 1.29);
});
