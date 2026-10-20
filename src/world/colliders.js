// 2D collision world: circles and oriented boxes in a spatial hash.
// Optional floor tag lv (0 = ground floor / outside, 1 = upper floor of the house): a collider with a
// tag only blocks queries made with the same level; untagged colliders (and untagged queries) see everything.
export class Colliders {
  constructor(cell = 4) { this.cell = cell; this.map = new Map(); this.all = []; this._stamp = 0; }
  _k(ix, iz) { return (ix + 512) * 4096 + (iz + 512); }
  _insert(c, x0, z0, x1, z1) {
    const s = this.cell;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++)
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this._k(ix, iz);
        let a = this.map.get(k); if (!a) { a = []; this.map.set(k, a); }
        a.push(c);
      }
    this.all.push(c);
    return c;
  }
  addCircle(x, z, r, tag = null, lv) { return this._insert({ t: 0, x, z, r, tag, m: 0, lv }, x - r, z - r, x + r, z + r); }
  addBox(cx, cz, hx, hz, rot = 0, tag = null, lv) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz, ez = Math.abs(s) * hx + Math.abs(c) * hz;
    return this._insert({ t: 1, x: cx, z: cz, hx, hz, c, s, tag, m: 0, lv }, cx - ex, cz - ez, cx + ex, cz + ez);
  }
  // segment as thin box
  addWall(ax, az, bx, bz, thick = 0.15, tag = null) {
    const cx = (ax + bx) / 2, cz = (az + bz) / 2, len = Math.hypot(bx - ax, bz - az);
    const rot = Math.atan2(bz - az, bx - ax);
    return this.addBox(cx, cz, len / 2, thick, -rot, tag);
  }
  query(x, z, r) {
    const s = this.cell, out = [];
    this._stamp++;
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++)
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const a = this.map.get(this._k(ix, iz));
        if (a) for (const c of a) if (c.m !== this._stamp) { c.m = this._stamp; out.push(c); }
      }
    return out;
  }
  // signed penetration; returns push vector or null
  _push(c, x, z, r) {
    if (c.t === 0) {
      const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d >= m) return null;
      if (d < 1e-5) return [m, 0];
      return [dx / d * (m - d), dz / d * (m - d)];
    }
    // to box local (rotation by -rot -> using stored c,s of +rot)
    const dx = x - c.x, dz = z - c.z;
    const lx = dx * c.c - dz * c.s, lz = dx * c.s + dz * c.c;
    const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let px = lx - qx, pz = lz - qz;
    const d = Math.hypot(px, pz);
    let ox, oz;
    if (d > 1e-5) {
      if (d >= r) return null;
      ox = px / d * (r - d); oz = pz / d * (r - d);
    } else {
      const penX = c.hx - Math.abs(lx), penZ = c.hz - Math.abs(lz);
      if (penX < penZ) { ox = Math.sign(lx || 1) * (penX + r); oz = 0; } else { ox = 0; oz = Math.sign(lz || 1) * (penZ + r); }
    }
    // back to world (rotate by +rot)
    return [ox * c.c + oz * c.s, -ox * c.s + oz * c.c];
  }
  _skip(c, lv) { return c.off || (lv !== undefined && c.lv !== undefined && c.lv !== lv); }
  resolve(p, r, lv) {
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (const c of this.query(p.x, p.z, r + 0.5)) {
        if (this._skip(c, lv)) continue;
        const pv = this._push(c, p.x, p.z, r);
        if (pv) { p.x += pv[0]; p.z += pv[1]; moved = true; }
      }
      if (!moved) break;
    }
    return p;
  }
  hit(x, z, r, lv) {
    for (const c of this.query(x, z, r + 0.5)) if (!this._skip(c, lv) && this._push(c, x, z, r)) return c;
    return null;
  }
}
