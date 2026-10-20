import test from 'node:test';
import assert from 'node:assert/strict';
import { Farm } from '../src/game/farm.js';

test('old save tiles under the new house are dropped, garden tiles survive', () => {
  const tiles = new Map();
  const key = (i, j) => `${i},${j}`;
  const stub = {
    st: { noGrass: (x, z) => x > -5 && x < 5 && z > -19 && z < -9 },
    dirty: false,
    till(i, j) { if (!tiles.has(key(i, j))) tiles.set(key(i, j), { i, j, wet: false, crop: null }); },
    get(i, j) { return tiles.get(key(i, j)); },
    stageOf(g) { return Math.min(4, Math.floor(g * 5)); },
  };
  Farm.prototype.load.call(stub, [[0, -18, 1, 'bokchoy', 1], [10, -12, 1, 'carrot', 1]]);
  assert.equal(tiles.has(key(0, -18)), false, 'tile under the house must be removed');
  assert.ok(tiles.has(key(10, -12)), 'tile in the garden must load');
  assert.equal(stub.dirty, true);
});
