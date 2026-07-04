// UI: HUD на канвасе (джойстик, кнопки, орбы) + DOM-экраны (инвентарь, герой, таланты, лагерь).
import { STR } from './strings.js';
import { SKILLS, CLASSES, BASE_ITEMS, SETS, RARITY, GAMBLE_COST, RESPEC_COST, MAXLEVEL } from './data.js';
import { makeItem } from './items.js';
import { canUse } from './skills.js';
import { bus, clamp } from './core.js';

const RC = { common: '#c8c2b8', magic: '#7aa9ff', rare: '#ffd75e', set: '#61d97a', unique: '#ff9840' };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class UI {
  constructor(game) {
    this.g = game;
    this.root = document.getElementById('ui');
    this.screen = null; // 'inventory'|'character'|'talents'|'town'|'vendor'|'stash'|'death'|null
    this.statNames = { str: STR.stats.str, dex: STR.stats.dex, int: STR.stats.int, vit: STR.stats.vit };
    bus.on('levelUp', lvl => this.toast(`${STR.levelUp} ${lvl}`, '#ffd75e'));
    bus.on('pickupItem', (r, name) => { if (r !== 'common') this.toast(name, RC[r]); });
  }
  toast(txt, color = '#e0d9c8') {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = txt; el.style.color = color;
    this.root.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  // ---------- HUD на канвасе ----------
  drawHud(ctx, g, input) {
    const W = innerWidth, H = innerHeight;
    const h = g.hero, s = g.stats;
    const touch = g.isTouch;
    ctx.font = '13px Georgia, serif';
    // ОРБЫ
    const orbR = touch ? 34 : 40;
    const drawOrb = (x, y, frac, c1, c2, label) => {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, orbR, 0, 7); ctx.clip();
      ctx.fillStyle = '#0b0d12'; ctx.fillRect(x - orbR, y - orbR, orbR * 2, orbR * 2);
      const lvl = y + orbR - frac * orbR * 2;
      const grad = ctx.createLinearGradient(0, lvl, 0, y + orbR);
      grad.addColorStop(0, c1); grad.addColorStop(1, c2);
      ctx.fillStyle = grad; ctx.fillRect(x - orbR, lvl, orbR * 2, orbR * 2);
      ctx.restore();
      ctx.strokeStyle = '#3a3325'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, orbR, 0, 7); ctx.stroke();
      ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center';
      ctx.fillText(label, x, y + 4);
    };
    drawOrb(orbR + 12, H - orbR - 14, clamp(h.hp / s.maxHp, 0, 1), '#c62828', '#5e0a0a', Math.ceil(h.hp));
    const resCol = { fury: ['#e65100', '#7f2c00'], focus: ['#9e9d24', '#4a4a10'], mana: ['#1565c0', '#0a2e63'], souls: ['#6a1b9a', '#320d49'], wrath: ['#2e7d32', '#123615'] }[g.cls.resource];
    drawOrb(W - orbR - 12, H - orbR - 14, clamp(h.res / s.maxRes, 0, 1), resCol[0], resCol[1], Math.ceil(h.res));
    // XP полоса
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(W * .25, H - 8, W * .5, 5);
    ctx.fillStyle = '#b98c1f'; ctx.fillRect(W * .25, H - 8, W * .5 * clamp(h.xp / h.xpNext, 0, 1), 5);
    // Верх: акт/этаж, золото, уровень
    ctx.textAlign = 'left'; ctx.fillStyle = '#c9bf9f';
    const actName = g.progress.rift ? `${STR.rift} ${g.progress.riftLvl}` : `${STR.acts[g.progress.act].name} · ${STR.floor} ${g.progress.floor}`;
    ctx.fillText(actName, 12, 22);
    ctx.fillText(`${STR.level} ${h.level}`, 12, 40);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffd75e'; ctx.fillText(`${h.gold} ✦`, W - 12, 22);
    // зелья
    ctx.textAlign = 'left';
    ctx.fillStyle = '#c62828';
    for (let i = 0; i < s.potions; i++) {
      ctx.globalAlpha = i < h.potionCharges ? 1 : .25;
      ctx.beginPath(); ctx.arc(orbR * 2 + 40 + i * 20, H - 22, 7, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // джойстик
    if (touch && input.stick.active) {
      ctx.strokeStyle = 'rgba(200,190,160,0.35)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(input.stick.ox, input.stick.oy, 52, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(200,190,160,0.4)';
      const dx = clamp(input.stick.x - input.stick.ox, -52, 52), dy = clamp(input.stick.y - input.stick.oy, -52, 52);
      ctx.beginPath(); ctx.arc(input.stick.ox + dx, input.stick.oy + dy, 22, 0, 7); ctx.fill();
    }
    // кнопки скиллов (тач)
    if (touch) {
      const bx = W - 66, by = H - 130;
      this.skillButtons(g).forEach((b, i) => {
        const pos = [
          { x: W - 60, y: H - 148 }, { x: W - 128, y: H - 106 }, { x: W - 148, y: H - 178 }, { x: W - 84, y: H - 218 }, { x: W - 24, y: H - 218 },
        ][i] || { x: bx, y: by - i * 66 };
        input.addButton('sk' + i, pos.x, pos.y, i === 0 ? 34 : 25, b.cmd);
        const usable = b.id === 'attack' ? true : canUse(g, b.id);
        ctx.globalAlpha = usable ? .92 : .35;
        ctx.fillStyle = '#151310';
        ctx.beginPath(); ctx.arc(pos.x, pos.y, i === 0 ? 32 : 24, 0, 7); ctx.fill();
        ctx.strokeStyle = usable ? '#8c6d1f' : '#443c28'; ctx.lineWidth = 2.5; ctx.stroke();
        this.drawSkillGlyph(ctx, b, pos.x, pos.y, i === 0 ? 20 : 14);
        const cd = g.hero.cooldowns[b.id];
        if (cd > 0 && SKILLS[b.id]?.cd) {
          ctx.fillStyle = 'rgba(0,0,0,0.65)';
          ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
          ctx.arc(pos.x, pos.y, i === 0 ? 32 : 24, -Math.PI / 2, -Math.PI / 2 + (cd / SKILLS[b.id].cd) * 7); ctx.fill();
        }
        ctx.globalAlpha = 1;
      });
      // кнопки зелья и меню
      input.addButton('potion', orbR * 2 + 40 + 30, H - 60, 24, 'potion');
      ctx.fillStyle = '#151310'; ctx.beginPath(); ctx.arc(orbR * 2 + 70, H - 60, 22, 0, 7); ctx.fill();
      ctx.strokeStyle = '#7a2020'; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = '#c62828'; ctx.beginPath(); ctx.arc(orbR * 2 + 70, H - 60, 9, 0, 7); ctx.fill();
    }
    // кнопка инвентаря/меню
    input.addButton('inv', W - 26, 60, 22, 'inventory');
    ctx.fillStyle = 'rgba(21,19,16,0.8)'; ctx.beginPath(); ctx.arc(W - 26, 60, 18, 0, 7); ctx.fill();
    ctx.strokeStyle = '#8c6d1f'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center'; ctx.font = '15px Georgia'; ctx.fillText('☰', W - 26, 65);
    if (g.hero.statPts > 0 || g.hero.talentPts > 0) {
      ctx.fillStyle = '#ffd75e'; ctx.beginPath(); ctx.arc(W - 12, 46, 5, 0, 7); ctx.fill();
    }
    // босс-бар
    const boss = g.mobs.find(m => m.boss && !m.dead && m.aggro);
    if (boss) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(W * .18, 54, W * .64, 14);
      ctx.fillStyle = '#8b0f23'; ctx.fillRect(W * .18 + 2, 56, (W * .64 - 4) * clamp(boss.hp / boss.maxHp, 0, 1), 10);
      ctx.fillStyle = '#e8dcc0'; ctx.textAlign = 'center'; ctx.font = 'bold 13px Georgia';
      ctx.fillText(STR.mobNames[boss.kind] || '', W / 2, 50);
    }
  }
  skillButtons(g) {
    const bar = g.hero.skillBar;
    return [{ id: 'attack', cmd: 'attack', glyph: 'atk' },
      ...bar.map((id, i) => ({ id, cmd: 'skill' + (i + 1), glyph: id }))].filter(b => b.id);
  }
  drawSkillGlyph(ctx, b, x, y, r) {
    const sk = SKILLS[b.id];
    ctx.strokeStyle = '#d9cba3'; ctx.fillStyle = '#d9cba3'; ctx.lineWidth = 2;
    ctx.save(); ctx.translate(x, y);
    const kind = b.id === 'attack' ? 'atk' : sk?.kind;
    ctx.beginPath();
    switch (kind) { // простые руны по видам умений
      case 'atk': ctx.moveTo(-r * .6, r * .6); ctx.lineTo(r * .6, -r * .6); ctx.moveTo(r * .2, -r * .6); ctx.lineTo(r * .6, -r * .6); ctx.lineTo(r * .6, -r * .2); break;
      case 'melee': ctx.moveTo(-r * .6, r * .4); ctx.lineTo(r * .5, -r * .5); ctx.moveTo(-r * .6, -r * .4); ctx.lineTo(r * .5, r * .5); break;
      case 'proj': ctx.moveTo(-r * .6, 0); ctx.lineTo(r * .6, 0); ctx.lineTo(r * .2, -r * .35); ctx.moveTo(r * .6, 0); ctx.lineTo(r * .2, r * .35); break;
      case 'nova': ctx.arc(0, 0, r * .55, 0, 7); ctx.moveTo(r * .25, 0); ctx.arc(0, 0, r * .25, 0, 7); break;
      case 'zone': ctx.rect(-r * .5, -r * .5, r, r); ctx.moveTo(0, -r * .15); ctx.arc(0, 0, r * .15, 0, 7); break;
      case 'buff': ctx.moveTo(0, r * .6); ctx.lineTo(0, -r * .6); ctx.moveTo(-r * .4, -r * .2); ctx.lineTo(0, -r * .6); ctx.lineTo(r * .4, -r * .2); break;
      case 'dash': ctx.moveTo(-r * .6, 0); ctx.lineTo(r * .5, 0); ctx.moveTo(-r * .2, 0); ctx.lineTo(-r * .6, -r * .3); ctx.moveTo(-r * .2, 0); ctx.lineTo(-r * .6, r * .3); ctx.moveTo(r * .5, -r * .3); ctx.lineTo(r * .5, r * .3); break;
      case 'summon': ctx.arc(-r * .3, r * .2, r * .25, 0, 7); ctx.moveTo(r * .55, r * .2); ctx.arc(r * .3, r * .2, r * .25, 0, 7); ctx.moveTo(0, -r * .5); ctx.arc(0, -r * .3, r * .2, 0, 7); break;
      case 'trap': ctx.moveTo(-r * .5, r * .3); ctx.lineTo(0, -r * .5); ctx.lineTo(r * .5, r * .3); ctx.closePath(); break;
      case 'form': ctx.moveTo(-r * .5, r * .5); ctx.lineTo(0, -r * .55); ctx.lineTo(r * .5, r * .5); ctx.moveTo(-r * .25, r * .1); ctx.lineTo(r * .25, r * .1); break;
      case 'curse': ctx.arc(0, -r * .1, r * .4, Math.PI, 0); ctx.moveTo(0, r * .3); ctx.lineTo(0, r * .6); break;
      case 'chain': ctx.moveTo(-r * .5, -r * .5); ctx.lineTo(0, 0); ctx.lineTo(-r * .15, r * .15); ctx.lineTo(r * .5, r * .55); break;
      default: ctx.arc(0, 0, r * .4, 0, 7);
    }
    ctx.stroke(); ctx.restore();
  }

  // ---------- DOM-экраны ----------
  open(name, opt) { this.screen = name; this.opt = opt; this.render(); this.g.paused = true; }
  closeScreen() { this.screen = null; this.root.querySelector('.panel')?.remove(); this.g.paused = false; this.g.save(); }
  render() {
    this.root.querySelector('.panel')?.remove();
    if (!this.screen) return;
    const p = document.createElement('div');
    p.className = 'panel';
    const fn = { inventory: this.rInventory, character: this.rCharacter, talents: this.rTalents,
      town: this.rTown, vendor: this.rVendor, stash: this.rStash, death: this.rDeath, settings: this.rSettings }[this.screen];
    p.innerHTML = fn.call(this);
    this.root.appendChild(p);
    this.bindPanel(p);
  }
  tabs(active) {
    const t = [['inventory', STR.inventory], ['character', STR.character], ['talents', STR.talents]];
    return `<div class="tabs">${t.map(([id, n]) =>
      `<button class="tab ${id === active ? 'on' : ''}" data-act="tab" data-id="${id}">${n}${id === 'talents' && this.g.hero.talentPts ? ' ●' : ''}${id === 'character' && this.g.hero.statPts ? ' ●' : ''}</button>`).join('')}
      <button class="tab x" data-act="close">✕</button></div>`;
  }
  itemHtml(it, ctx) {
    const cls = `item r-${it.rarity}`;
    return `<div class="${cls}" data-act="item" data-ctx="${ctx}" data-id="${it.id}">
      <div class="iname">${esc(it.name)}</div>
      <div class="islot">${STR.slots[it.slot === 'ring' ? 'ring1' : it.slot]}${it.dmg ? ` · ${it.dmg[0]}–${it.dmg[1]}` : ''}${it.armor ? ` · 🛡${it.armor}` : ''}</div>
    </div>`;
  }
  tooltip(it, actions) {
    const st = [];
    if (it.dmg) st.push(`${STR.dmg}: ${it.dmg[0]}–${it.dmg[1]} (${it.aspd}/с)`);
    if (it.armor) st.push(`${STR.armor}: ${it.armor}`);
    const AFF_T = { dmgFlat: '+# к урону', dmgMul: '+#% урона', aspd: '+#% скор. атаки', crit: '+#% крит. шанса', critDmg: '+#% крит. урона',
      plusSkills: '+# ко всем умениям', leech: '#% урона в здоровье', hpFlat: '+# к здоровью', hpRegen: '+# HP/сек', armorFlat: '+# к броне',
      armorMul: '+#% брони', resFire: '+#% сопр. огню', resCold: '+#% сопр. холоду', resLight: '+#% сопр. молнии', resPoison: '+#% сопр. яду',
      resAll: '+#% ко всем сопр.', moveMul: '+#% скорости бега', goldFind: '+#% золота', magicFind: '+#% магич. находок', thorns: 'шипы: # урона',
      str: '+# к Силе', dex: '+# к Ловкости', int: '+# к Интеллекту', vit: '+# к Живучести', vsUndead: '+#% урона нежити', vsDemon: '+#% урона демонам',
      lightR: '+#% радиуса света', potions: '+# ячейки зелий', spellDmg: '+#% урона умений', resMax: '+# к запасу ресурса', cdr: '-#% перезарядки' };
    for (const k in it.stats) {
      const v = it.stats[k];
      const isPct = /Mul|leech|goldFind|magicFind|lightR|spellDmg|cdr|vsUndead|vsDemon|aspd/.test(k);
      const val = isPct ? Math.round(v * 100) : Math.round(v * 10) / 10;
      st.push((AFF_T[k] || k + ' #').replace('#', val));
    }
    if (it.setId) { const set = SETS.find(s => s.id === it.setId); st.push(`<i>${esc(set.name)} (сет)</i>`); }
    if (it.lore) st.push(`<i class="lore">«${esc(it.lore)}»</i>`);
    return `<div class="tt">
      <div class="ttname" style="color:${RC[it.rarity]}">${esc(it.name)}</div>
      ${it.typeName ? `<div class="ttt">${esc(it.typeName)}</div>` : ''}
      <div class="ttreq">${STR.requires}: ${it.req} ${STR.levelShort} · ${it.price} ✦</div>
      ${st.map(x => `<div class="tts">${x}</div>`).join('')}
      <div class="ttbtns">${actions.map(a => `<button data-act="${a[0]}" data-id="${it.id}">${a[1]}</button>`).join('')}</div>
    </div>`;
  }

  rInventory() {
    const h = this.g.hero;
    const slots = ['weapon', 'offhand', 'helm', 'chest', 'gloves', 'belt', 'boots', 'amulet', 'ring1', 'ring2'];
    return `${this.tabs('inventory')}
    <div class="cols">
      <div class="equip">
        <div class="h2">${STR.equipped}</div>
        ${slots.map(sl => {
          const it = h.equip[sl];
          return `<div class="eslot">${STR.slots[sl]}: ${it ? this.itemHtml(it, 'equip') : '<span class="empty">—</span>'}</div>`;
        }).join('')}
        <div class="gold">${STR.gold}: <b>${h.gold} ✦</b></div>
      </div>
      <div class="bag">
        <div class="h2">${STR.inventory} (${h.inventory.length}/24)</div>
        <div class="grid">${h.inventory.map(it => this.itemHtml(it, 'bag')).join('') || '<span class="empty">пусто</span>'}</div>
      </div>
    </div><div id="ttbox"></div>`;
  }
  rCharacter() {
    const h = this.g.hero, s = this.g.stats;
    const rows = [
      [STR.dmg, Math.round(s.dmgTotal)], [STR.aspd, s.attackSpeed.toFixed(2) + '/с'],
      [STR.crit, Math.round(s.critCh) + '% ×' + (1.5 + s.critDmg).toFixed(1)],
      ['HP', `${Math.ceil(h.hp)}/${s.maxHp}`], [STR.armor, s.armor],
      [STR.resFire, s.resFire + '%'], [STR.resCold, s.resCold + '%'], [STR.resLight, s.resLight + '%'], [STR.resPoison, s.resPoison + '%'],
      ['Скорость', Math.round(s.moveSpeed)], ['Магич. находки', Math.round(s.magicFind * 100) + '%'],
    ];
    return `${this.tabs('character')}
    <div class="cols"><div>
      <div class="h2">${STR.classes[h.cls].name} · ${STR.level} ${h.level}</div>
      <div class="xpline">${STR.exp}: ${h.xp}/${h.xpNext}</div>
      <div class="h2">${STR.statPoints}: <b>${h.statPts}</b></div>
      ${['str', 'dex', 'int', 'vit'].map(k => `<div class="statrow">${this.statNames[k]}: <b>${this.g.stats[k]}</b>
        ${h.statPts > 0 ? `<button data-act="stat" data-id="${k}">+</button>` : ''}</div>`).join('')}
    </div><div>
      <div class="h2">Сводка</div>
      ${rows.map(r => `<div class="statrow">${r[0]}: <b>${r[1]}</b></div>`).join('')}
    </div></div>`;
  }
  rTalents() {
    const h = this.g.hero;
    const cls = h.cls;
    const brs = [[], [], []];
    for (const id in SKILLS) { const sk = SKILLS[id]; if (sk.cls === cls) brs[sk.br].push([id, sk]); }
    brs.forEach(b => b.sort((a, c) => a[1].lvl - c[1].lvl));
    const brName = {
      barbarian: ['Оружие', 'Крики', 'Стойкость'], huntress: ['Лук', 'Ловушки', 'Тени'], mage: ['Огонь', 'Лёд', 'Молния'],
      warlock: ['Проклятия', 'Призыв', 'Кровь'], druid: ['Волк', 'Медведь', 'Природа'] }[cls];
    return `${this.tabs('talents')}
    <div class="h2">${STR.talentPoints}: <b>${h.talentPts}</b> · ${STR.respec}: ${RESPEC_COST(h.level)} ✦ <button data-act="respec">↺</button></div>
    <div class="cols3">${brs.map((b, bi) => `<div class="branch"><div class="h2">${brName[bi]}</div>
      ${b.map(([id, sk]) => {
        const rank = h.talents[id] || 0;
        const locked = h.level < sk.lvl;
        const onBar = h.skillBar.indexOf(id);
        return `<div class="talent ${locked ? 'locked' : ''} ${rank ? 'known' : ''}">
          <div class="tname">${sk.name} <span class="trank">${rank}/5</span></div>
          <div class="tdesc">${sk.d}${sk.passive ? '' : ` · ${sk.cost || 0}⚡${sk.cd ? ` · ${sk.cd}с` : ''}`}</div>
          <div class="tdesc">${locked ? `${STR.requires} ${sk.lvl} ${STR.levelShort}` : ''}</div>
          <div>
          ${!locked && rank < 5 && h.talentPts > 0 ? `<button data-act="learn" data-id="${id}">${STR.learn}</button>` : ''}
          ${rank > 0 && !sk.passive && sk.kind !== 'form' ? `<button data-act="assign" data-id="${id}">${onBar >= 0 ? '✓' + (onBar + 1) : STR.assign}</button>` : ''}
          ${rank > 0 && sk.kind === 'form' ? `<button data-act="assign" data-id="${id}">${onBar >= 0 ? '✓' + (onBar + 1) : STR.assign}</button>` : ''}
          </div>
        </div>`;
      }).join('')}</div>`).join('')}</div>`;
  }
  rTown() {
    const g = this.g;
    const acts = [1, 2, 3, 4].filter(a => a <= g.progress.unlockedActs);
    return `<div class="tabs"><div class="h1">${STR.town}</div><button class="tab x" data-act="close">✕</button></div>
    <div class="townbtns">
      <button class="big" data-act="vendor">🕯 ${STR.vendor}</button>
      <button class="big" data-act="stash">📦 ${STR.stash}</button>
      <button class="big" data-act="tab" data-id="talents">✦ ${STR.altar}</button>
      <button class="big" data-act="settings">⚙ ${STR.settings}</button>
    </div>
    <div class="h2">${STR.portalTo}:</div>
    <div class="townbtns">
      ${acts.map(a => `<button class="big portal" data-act="goact" data-id="${a}">${STR.acts[a].name}</button>`).join('')}
      ${g.progress.cleared ? `<button class="big portal rift" data-act="gorift">🌀 ${STR.rift} ${g.progress.riftLvl}</button>` : ''}
    </div>
    <div class="note">${STR.saveNote}</div>`;
  }
  rVendor() {
    const g = this.g, h = g.hero;
    if (!g.vendorStock.length) g.restockVendor();
    return `<div class="tabs"><div class="h1">${STR.vendor}</div><button class="tab x" data-act="town">←</button></div>
    <div class="gold">${STR.gold}: <b>${h.gold} ✦</b> · <button data-act="gamble">${STR.gamble} (${GAMBLE_COST(h.level)} ✦)</button></div>
    <div class="cols">
      <div><div class="h2">${STR.buy}</div><div class="grid">${g.vendorStock.map(it => this.itemHtml(it, 'shop')).join('')}</div></div>
      <div><div class="h2">${STR.sell}</div><div class="grid">${h.inventory.map(it => this.itemHtml(it, 'sellbag')).join('') || '<span class="empty">пусто</span>'}</div></div>
    </div><div id="ttbox"></div>`;
  }
  rStash() {
    const g = this.g, h = g.hero;
    return `<div class="tabs"><div class="h1">${STR.stash} (${g.stash.length}/48)</div><button class="tab x" data-act="town">←</button></div>
    <div class="cols">
      <div><div class="h2">${STR.stash}</div><div class="grid">${g.stash.map(it => this.itemHtml(it, 'stash')).join('') || '<span class="empty">пусто</span>'}</div></div>
      <div><div class="h2">${STR.inventory}</div><div class="grid">${h.inventory.map(it => this.itemHtml(it, 'tostash')).join('') || '<span class="empty">пусто</span>'}</div></div>
    </div><div id="ttbox"></div>`;
  }
  rDeath() {
    return `<div class="death"><div class="h1red">${STR.youDied}</div>
    <div class="note">${STR.deathHint}${this.opt?.goldLost || 0} ✦</div>
    <button class="big" data-act="revive">${STR.revive}</button></div>`;
  }
  rSettings() {
    const st = this.g.settings;
    return `<div class="tabs"><div class="h1">${STR.settings}</div><button class="tab x" data-act="town">←</button></div>
    <div class="townbtns">
      <button class="big" data-act="set" data-id="sound">${STR.sound}: ${st.sound ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="shake">${STR.shake}: ${st.shake ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="flash">${STR.flash}: ${st.flash ? '✔' : '✖'}</button>
      <button class="big" data-act="set" data-id="bigText">${STR.textSize}: ${st.bigText ? '✔' : '✖'}</button>
    </div>`;
  }

  bindPanel(p) {
    p.addEventListener('click', e => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act, id = b.dataset.id;
      const g = this.g, h = g.hero;
      const find = (arr, iid) => arr.find(x => x.id == iid);
      switch (act) {
        case 'close': this.closeScreen(); break;
        case 'tab': this.open(id); break;
        case 'town': this.open('town'); break;
        case 'vendor': this.open('vendor'); break;
        case 'stash': this.open('stash'); break;
        case 'settings': this.open('settings'); break;
        case 'set': g.settings[id] = !g.settings[id]; g.applySettings(); this.render(); break;
        case 'stat': if (h.statPts > 0) { h.alloc[id]++; h.statPts--; g.recalc(); this.render(); } break;
        case 'learn': if (h.talentPts > 0 && (h.talents[id] || 0) < 5) { h.talents[id] = (h.talents[id] || 0) + 1; h.talentPts--; g.recalc();
          if (!SKILLS[id].passive && h.skillBar.length < 4 && !h.skillBar.includes(id)) h.skillBar.push(id);
          this.render(); } break;
        case 'assign': {
          const i = h.skillBar.indexOf(id);
          if (i >= 0) h.skillBar.splice(i, 1);
          else { if (h.skillBar.length >= 4) h.skillBar.shift(); h.skillBar.push(id); }
          this.render(); break;
        }
        case 'respec': if (h.gold >= RESPEC_COST(h.level)) { h.gold -= RESPEC_COST(h.level);
          let refund = 0; for (const k in h.talents) refund += h.talents[k];
          h.talents = {}; h.skillBar = []; h.talentPts += refund; g.recalc(); this.render(); } else this.toast(STR.notEnoughGold, '#c62828'); break;
        case 'gamble': {
          const cost = GAMBLE_COST(h.level);
          if (h.gold < cost) { this.toast(STR.notEnoughGold, '#c62828'); break; }
          if (h.inventory.length >= 24) { this.toast(STR.inventoryFull, '#c62828'); break; }
          h.gold -= cost;
          const it = makeItem(g.rng, h.level + g.rng.int(0, 3), { magicFind: .8 });
          h.inventory.push(it); this.toast(it.name, RC[it.rarity]); this.render(); break;
        }
        case 'item': this.showTooltip(b, id, b.dataset.ctx); break;
        case 'equipIt': g.equipItem(Number(id)); this.render(); break;
        case 'unequipIt': g.unequipItem(id); this.render(); break;
        case 'sellIt': { const it = find(h.inventory, id); if (it) { h.inventory = h.inventory.filter(x => x !== it); h.gold += Math.floor(it.price / 3); this.render(); } break; }
        case 'buyIt': { const it = find(g.vendorStock, id);
          if (it && h.gold >= it.price && h.inventory.length < 24) { h.gold -= it.price; g.vendorStock = g.vendorStock.filter(x => x !== it); h.inventory.push(it); this.render(); }
          else this.toast(h.gold < (it?.price || 0) ? STR.notEnoughGold : STR.inventoryFull, '#c62828'); break; }
        case 'dropIt': { h.inventory = h.inventory.filter(x => x.id != id); this.render(); break; }
        case 'stashIt': { const it = find(h.inventory, id); if (it && g.stash.length < 48) { h.inventory = h.inventory.filter(x => x !== it); g.stash.push(it); this.render(); } break; }
        case 'unstashIt': { const it = find(g.stash, id); if (it && h.inventory.length < 24) { g.stash = g.stash.filter(x => x !== it); h.inventory.push(it); this.render(); } break; }
        case 'goact': g.enterAct(Number(id)); this.closeScreen(); break;
        case 'gorift': g.enterRift(); this.closeScreen(); break;
        case 'revive': g.revive(); this.closeScreen(); break;
      }
    });
  }
  showTooltip(el, id, ctx) {
    const g = this.g, h = g.hero;
    const src = { equip: Object.values(h.equip).filter(Boolean), bag: h.inventory, shop: g.vendorStock, sellbag: h.inventory, stash: g.stash, tostash: h.inventory }[ctx];
    const it = src.find(x => x.id == id);
    if (!it) return;
    const acts = {
      equip: [['unequipIt', STR.unequip]],
      bag: [['equipIt', STR.equip], ['stashIt', STR.toStash], ['sellIt', `${STR.sell} (${Math.floor(it.price / 3)}✦)`], ['dropIt', STR.drop]],
      shop: [['buyIt', `${STR.buy} (${it.price}✦)`]],
      sellbag: [['sellIt', `${STR.sell} (${Math.floor(it.price / 3)}✦)`]],
      stash: [['unstashIt', STR.fromStash]],
      tostash: [['stashIt', STR.toStash]],
    }[ctx];
    // экипировка из сундука недоступна — только через инвентарь (честно и просто)
    const box = this.root.querySelector('#ttbox');
    if (box) { box.innerHTML = this.tooltip(it, acts); box.style.display = 'block'; }
  }
}
