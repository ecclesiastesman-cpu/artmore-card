// Рендер: тайлы, стены, спрайты-марионетки с экипировкой, свет, частицы, числа.
import { TILE } from './data.js';
import { T_WALL, T_EXIT, T_ENTRY, isWall } from './world.js';
import { clamp, lerp } from './core.js';

export class Renderer {
  constructor(canvas, assets) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.assets = assets;
    this.cam = { x: 0, y: 0, shake: 0 };
    this.particles = []; this.numbers = []; this.flashes = [];
    this.tintCache = new Map();
    this.lightCanvas = document.createElement('canvas');
    this.zoom = 1;
    this.reduceShake = false; this.reduceFlash = false;
  }
  resize(dprCap = 1.5) {
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    this.dpr = dpr;
    this.canvas.width = innerWidth * dpr; this.canvas.height = innerHeight * dpr;
    this.canvas.style.width = innerWidth + 'px'; this.canvas.style.height = innerHeight + 'px';
    this.lightCanvas.width = Math.ceil(innerWidth / 4); this.lightCanvas.height = Math.ceil(innerHeight / 4);
    this.zoom = clamp(Math.min(innerWidth, innerHeight) / 500, .85, 1.5);
  }
  // тонированный спрайт с кэшем
  tinted(img, tint, alpha = .55) {
    const key = img.__id + '|' + tint;
    let c = this.tintCache.get(key);
    if (!c) {
      c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d');
      x.drawImage(img, 0, 0);
      x.globalCompositeOperation = 'source-atop'; x.globalAlpha = alpha;
      x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height);
      this.tintCache.set(key, c);
    }
    return c;
  }
  worldToScreen(x, y) {
    return [(x - this.cam.x) * this.zoom + innerWidth / 2, (y - this.cam.y) * this.zoom + innerHeight / 2];
  }
  screenToWorld(x, y) {
    return [(x - innerWidth / 2) / this.zoom + this.cam.x, (y - innerHeight / 2) / this.zoom + this.cam.y];
  }

  drawFloor(g, timeS) {
    const { ctx } = this;
    const f = g.floor;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = g.actData.fog; ctx.fillRect(0, 0, innerWidth, innerHeight);
    const z = this.zoom;
    let shx = 0, shy = 0;
    if (this.cam.shake > 0 && !this.reduceShake) {
      shx = (Math.random() - .5) * this.cam.shake; shy = (Math.random() - .5) * this.cam.shake;
    }
    ctx.save();
    ctx.translate(innerWidth / 2 + shx, innerHeight / 2 + shy);
    ctx.scale(z, z);
    ctx.translate(-this.cam.x, -this.cam.y);
    const tileImg = this.assets[g.actData.tiles];
    const x0 = Math.floor((this.cam.x - innerWidth / 2 / z) / TILE) - 1, x1 = Math.ceil((this.cam.x + innerWidth / 2 / z) / TILE) + 1;
    const y0 = Math.floor((this.cam.y - innerHeight / 2 / z) / TILE) - 1, y1 = Math.ceil((this.cam.y + innerHeight / 2 / z) / TILE) + 1;
    for (let ty = Math.max(0, y0); ty <= Math.min(f.H - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(f.W - 1, x1); tx++) {
        const t = f.g[ty * f.W + tx];
        if (t === T_WALL) continue;
        if (tileImg) ctx.drawImage(tileImg, tx * TILE, ty * TILE, TILE + .5, TILE + .5);
        else { ctx.fillStyle = '#2b2b31'; ctx.fillRect(tx * TILE, ty * TILE, TILE, TILE); }
        if (t === T_EXIT || t === T_ENTRY) {
          const p = this.assets.dec_portal;
          const pul = 1 + Math.sin(timeS * 3) * .06;
          if (p) { ctx.globalAlpha = t === T_EXIT ? 1 : .45; ctx.drawImage(p, tx * TILE + TILE / 2 - 38 * pul, ty * TILE + TILE / 2 - 38 * pul, 76 * pul, 76 * pul); ctx.globalAlpha = 1; }
        }
      }
    }
    // стены: тёмные блоки с бликом сверху (процедурный ассет по формуле)
    for (let ty = Math.max(0, y0); ty <= Math.min(f.H - 1, y1); ty++) {
      for (let tx = Math.max(0, x0); tx <= Math.min(f.W - 1, x1); tx++) {
        if (f.g[ty * f.W + tx] !== T_WALL) continue;
        // рисуем только стены, граничащие с полом (скрытое не рисуем)
        if (isWall(f, tx - 1, ty) && isWall(f, tx + 1, ty) && isWall(f, tx, ty - 1) && isWall(f, tx, ty + 1)
          && isWall(f, tx - 1, ty - 1) && isWall(f, tx + 1, ty + 1) && isWall(f, tx - 1, ty + 1) && isWall(f, tx + 1, ty - 1)) continue;
        const x = tx * TILE, y = ty * TILE;
        ctx.fillStyle = g.actData.wall;
        ctx.fillRect(x, y - 14, TILE, TILE + 14);
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y - 14, TILE, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        if (!isWall(f, tx, ty + 1)) ctx.fillRect(x, y + TILE - 6, TILE, 6);
      }
    }
  }

  // марионетка героя: тело + доспех + шлем + оружие/щит, процедурная анимация
  drawHero(g, timeS) {
    const { ctx } = this;
    const h = g.hero;
    const spriteKey = h.form === 'wolf' ? 'form_wolf' : h.form === 'bear' ? 'form_bear' : g.cls.sprite;
    const img = this.assets[spriteKey];
    const size = (h.form === 'bear' ? 78 : 64) * 1.55;
    const bob = Math.sin(h.animT * 9) * (h.moving ? 3 : .8);
    const lunge = h.attackT > 0 ? Math.sin((0.22 - h.attackT) / 0.22 * Math.PI) * 9 : 0;
    ctx.save();
    ctx.translate(h.x + h.dir * lunge * .4, h.y + bob * .3);
    // тень
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, size * .38, size * .3, size * .11, 0, 0, 7); ctx.fill();
    if (h.hurtT > 0) { ctx.globalAlpha = .6 + Math.sin(timeS * 60) * .3; }
    ctx.scale(h.dir, 1);
    const tilt = h.moving ? Math.sin(h.animT * 9) * .05 : 0;
    ctx.rotate(tilt);
    if (img) ctx.drawImage(img, -size / 2, -size * .62 + bob, size, size);
    // экипировка поверх (только в человеческой форме)
    if (!h.form) {
      const chest = h.equip.chest, helm = h.equip.helm, off = h.equip.offhand, wpn = h.equip.weapon;
      if (chest) {
        const ci = this.assets[chest.icon];
        if (ci) { ctx.globalAlpha = .92; ctx.drawImage(ci, -size * .23, -size * .18 + bob, size * .46, size * .4); ctx.globalAlpha = 1; }
      }
      if (helm) {
        const hi = this.assets[helm.icon];
        if (hi) ctx.drawImage(hi, -size * .17, -size * .62 + bob, size * .34, size * .3);
      }
      if (off) {
        const oi = this.assets[off.icon];
        if (oi) ctx.drawImage(oi, -size * .52, -size * .18 + bob, size * .3, size * .38);
      }
      if (wpn) {
        const wi = this.assets[wpn.icon];
        if (wi) {
          ctx.save();
          ctx.translate(size * .3, -size * .1 + bob);
          const swing = h.attackT > 0 ? -(0.22 - h.attackT) / 0.22 * 1.8 + .9 : .35;
          ctx.rotate(swing);
          const glow = wpn.rarity === 'unique' ? '#ff9840' : wpn.rarity === 'set' ? '#61d97a' : wpn.rarity === 'rare' ? '#ffd75e' : null;
          if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = 14; }
          ctx.drawImage(wi, -size * .1, -size * .42, size * .48, size * .48);
          ctx.restore();
        }
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawMob(g, m, timeS) {
    const { ctx } = this;
    const img = this.assets[m.sprite];
    const size = m.r * 4.6;
    const bob = Math.sin(m.animT * 7) * (m.moving ? 2.5 : .6);
    ctx.save();
    ctx.translate(m.x, m.y);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(0, size * .34, size * .27, size * .1, 0, 0, 7); ctx.fill();
    if (m.elite) { // аура элитки
      ctx.strokeStyle = m.tint; ctx.globalAlpha = .5 + Math.sin(timeS * 5) * .2;
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, size * .3, size * .32, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.scale(m.dir * (m.scale || 1), (m.scale || 1));
    if (m.hitT > 0) ctx.globalAlpha = .55;
    if (m.freezeT > 0) { ctx.filter = 'saturate(0.3) brightness(1.3)'; }
    const src = (img && m.tint) ? this.tinted(img, m.tint, .4) : img;
    if (src) ctx.drawImage(src, -size / 2, -size * .58 + bob, size, size);
    else { ctx.fillStyle = m.tint || '#813'; ctx.fillRect(-m.r, -m.r, m.r * 2, m.r * 2); }
    ctx.restore();
    ctx.filter = 'none'; ctx.globalAlpha = 1;
    if (m.hp < m.maxHp && !m.boss) { // полоска HP
      const w = m.r * 2.4;
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(m.x - w / 2, m.y - size * .62, w, 4);
      ctx.fillStyle = m.elite ? '#ffd54f' : '#a3162e';
      ctx.fillRect(m.x - w / 2, m.y - size * .62, w * clamp(m.hp / m.maxHp, 0, 1), 4);
    }
  }

  drawDrops(g, timeS) {
    const { ctx } = this;
    for (const d of g.drops) {
      const bounce = Math.max(0, Math.sin(Math.min(d.t * 6, Math.PI))) * 14;
      const y = d.y - bounce;
      if (d.kind === 'gold') {
        ctx.fillStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(d.x, y, 5, 0, 7); ctx.fill();
        ctx.fillStyle = '#a67c00'; ctx.fillRect(d.x - 3, y - 1, 6, 2);
      } else if (d.kind === 'potion') {
        ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(d.x, y, 6, 0, 7); ctx.fill();
        ctx.fillStyle = '#8d6e63'; ctx.fillRect(d.x - 2, y - 10, 4, 5);
      } else {
        const col = ({ common: '#c8c2b8', magic: '#7aa9ff', rare: '#ffd75e', set: '#61d97a', unique: '#ff9840' })[d.item.rarity];
        ctx.save();
        ctx.shadowColor = col; ctx.shadowBlur = d.item.rarity === 'common' ? 4 : 12 + Math.sin(timeS * 4) * 4;
        const icon = this.assets[d.item.icon];
        if (icon) ctx.drawImage(icon, d.x - 15, y - 15, 30, 30);
        else { ctx.fillStyle = col; ctx.fillRect(d.x - 8, y - 8, 16, 16); }
        ctx.restore();
        // луч света для редких+
        if (d.item.rarity !== 'common' && d.item.rarity !== 'magic') {
          const grad = ctx.createLinearGradient(d.x, y - 70, d.x, y);
          grad.addColorStop(0, 'rgba(255,255,255,0)');
          grad.addColorStop(1, col + 'aa');
          ctx.fillStyle = grad; ctx.fillRect(d.x - 2, y - 70, 4, 70);
        }
      }
    }
  }

  drawEffects(g, dt, timeS) {
    const { ctx } = this;
    // зоны
    for (const z of g.zones) {
      ctx.globalAlpha = .16 + Math.sin(timeS * 8) * .05;
      ctx.fillStyle = z.color; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
      ctx.globalAlpha = .5; ctx.strokeStyle = z.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    for (const t of g.traps) {
      ctx.globalAlpha = t.armT > 0 ? .35 : .8;
      ctx.strokeStyle = t.elem === 'cold' ? '#4fc3f7' : '#ff7043'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(t.x, t.y, 9 + Math.sin(timeS * 6) * 2, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // снаряды
    for (const p of g.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(Math.atan2(p.vy, p.vx));
      if (p.arrow) { ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke(); }
      else { ctx.shadowColor = p.color; ctx.shadowBlur = 10; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, 7); ctx.fill(); }
      ctx.restore();
    }
    // частицы
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.t -= dt; if (p.t <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += (p.grav || 0) * dt;
      ctx.globalAlpha = Math.min(1, p.t * 2.5);
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    ctx.globalAlpha = 1;
    // числа урона
    for (let i = this.numbers.length - 1; i >= 0; i--) {
      const n = this.numbers[i];
      n.t -= dt; if (n.t <= 0) { this.numbers.splice(i, 1); continue; }
      n.y -= 34 * dt;
      ctx.globalAlpha = Math.min(1, n.t * 3);
      ctx.font = (n.big ? 'bold 17px' : 'bold 13px') + ' Georgia, serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)'; ctx.lineWidth = 3; ctx.strokeText(n.txt, n.x, n.y);
      ctx.fillStyle = n.c; ctx.fillText(n.txt, n.x, n.y);
    }
    ctx.globalAlpha = 1;
  }

  // Свет: тьма с вырезанными радиальными градиентами (низкое разрешение, растянуто)
  drawLight(g, timeS) {
    const lc = this.lightCanvas, lx = lc.getContext('2d');
    const z = this.zoom / 4 * this.dpr / this.dpr;
    lx.globalCompositeOperation = 'source-over';
    lx.fillStyle = 'rgba(0,0,0,0.93)';
    lx.fillRect(0, 0, lc.width, lc.height);
    lx.globalCompositeOperation = 'destination-out';
    const put = (wx, wy, r, a) => {
      const [sx, sy] = this.worldToScreen(wx, wy);
      const x = sx / 4, y = sy / 4, rr = r * this.zoom / 4;
      const grad = lx.createRadialGradient(x, y, rr * .15, x, y, rr);
      grad.addColorStop(0, `rgba(0,0,0,${a})`); grad.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = grad;
      lx.beginPath(); lx.arc(x, y, rr, 0, 7); lx.fill();
    };
    const flick = 1 + Math.sin(timeS * 11) * .04 + Math.sin(timeS * 23) * .02;
    put(g.hero.x, g.hero.y, g.stats.lightRadius * flick, 1);
    for (const t of g.floor.torches) {
      const wx = t.x * TILE + TILE / 2, wy = t.y * TILE + TILE / 2;
      if (Math.abs(wx - this.cam.x) > innerWidth || Math.abs(wy - this.cam.y) > innerHeight) continue;
      put(wx, wy, 110 * flick, .8);
    }
    for (const p of g.projectiles) if (p.color && !p.arrow) put(p.x, p.y, 60, .7);
    for (const z2 of g.zones) put(z2.x, z2.y, z2.r * 1.2, .5);
    const ctx = this.ctx;
    ctx.restore(); // выходим из мировых координат
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(lc, 0, 0, innerWidth, innerHeight);
  }

  // ---- fx API (вызывается геймплеем через g.fx) ----
  fxApi() {
    const self = this;
    return {
      number(x, y, v, c, big) { if (self.numbers.length < 60) self.numbers.push({ x, y, txt: String(v), c, t: .8, big }); },
      text(x, y, txt, c) { self.numbers.push({ x, y, txt, c, t: 1.2, big: true }); },
      burst(x, y, n, c) { for (let i = 0; i < n && self.particles.length < 300; i++) { const a = Math.random() * 7, sp = 40 + Math.random() * 120; self.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, t: .4 + Math.random() * .4, c, s: 2 + Math.random() * 3, grav: 300 }); } },
      explosion(x, y, r, c) { this.burst(x, y, 26, c); self.cam.shake = Math.max(self.cam.shake, 10); },
      slash(x, y, ang, r) { for (let i = 0; i < 6 && self.particles.length < 300; i++) { const a = ang + (Math.random() - .5) * 1; self.particles.push({ x: x + Math.cos(a) * r * .7, y: y + Math.sin(a) * r * .7, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, t: .18, c: '#e8dcc0', s: 2.5 }); } },
      nova(x, y, r, c) { for (let i = 0; i < 22 && self.particles.length < 300; i++) { const a = i / 22 * 7; self.particles.push({ x, y, vx: Math.cos(a) * r * 2.4, vy: Math.sin(a) * r * 2.4, t: .4, c, s: 3.5 }); } },
      lightning(x0, y0, x1, y1) { const n = 7; for (let i = 0; i <= n && self.particles.length < 298; i++) { const t = i / n; self.particles.push({ x: lerp(x0, x1, t) + (Math.random() - .5) * 14, y: lerp(y0, y1, t) + (Math.random() - .5) * 14, vx: 0, vy: 0, t: .15, c: '#c9b3ff', s: 3.5 }); } },
      dashTrail(x0, y0, x1, y1) { const n = 9; for (let i = 0; i <= n && self.particles.length < 298; i++) { const t = i / n; self.particles.push({ x: lerp(x0, x1, t), y: lerp(y0, y1, t), vx: 0, vy: 0, t: .25, c: '#9fb4c7', s: 4 }); } },
      buff(x, y) { this.burst(x, y, 14, '#ffd75e'); },
      levelUp(x, y) { this.burst(x, y, 40, '#ffd75e'); self.cam.shake = Math.max(self.cam.shake, 6); self.flashes.push({ t: .4, c: '255,215,94' }); },
      shake(v) { self.cam.shake = Math.max(self.cam.shake, v); },
    };
  }

  postFlash(dt) {
    const { ctx } = this;
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.t -= dt; if (f.t <= 0) { this.flashes.splice(i, 1); continue; }
      if (this.reduceFlash) continue;
      ctx.fillStyle = `rgba(${f.c},${f.t * .35})`;
      ctx.fillRect(0, 0, innerWidth, innerHeight);
    }
    if (this.cam.shake > 0) this.cam.shake = Math.max(0, this.cam.shake - dt * 46);
  }
}
