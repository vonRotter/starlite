'use strict';
// The in-game HUD: resources, paint meter, objectives, selection info and
// big command buttons.

class HUD {
  constructor() {
    const $ = (id) => document.getElementById(id);
    this.el = {
      root: $('hud'), crystals: $('crystals'), units: $('unitcount'), paint: $('paintbar'),
      objectives: $('objectives'), toasts: $('toasts'), sel: $('selinfo'), cmds: $('commands'),
      sound: $('btn-sound'), pause: $('btn-pause'),
    };
    this.dirty = true;
    this.sig = '';
    this.cmdList = [];
    this.t = 0; this.paintT = 0; this.objT = 0;
    this.el.cmds.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  attach(game, input) {
    this.game = game; this.input = input;
    this.dirty = true; this.sig = '';
    this.el.toasts.innerHTML = '';
    const P = game.teams[game.player];
    document.querySelector('.ico-crystal').style.backgroundImage = `url(${this.crystalIcon()})`;
    document.querySelector('.ico-unit').style.backgroundImage = `url(${Art.icon('unit', P.f.worker, P.colorKey, 48)})`;
    this.renderObjectives();
  }

  crystalIcon() {
    if (this._ci) return this._ci;
    const c = document.createElement('canvas'); c.width = c.height = 48;
    const ctx = c.getContext('2d'); ctx.translate(24, 26); ctx.scale(1.2, 1.2);
    Art.drawCrystal(ctx, 0, 1, 0);
    return (this._ci = c.toDataURL());
  }

  toast(text, kind = 'info') {
    const box = this.el.toasts;
    // Do not repeat the exact same message on top of itself.
    if (box.lastChild && box.lastChild.textContent === text && !box.lastChild.classList.contains('fade')) return;
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    box.appendChild(d);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(() => d.classList.add('fade'), 2800);
    setTimeout(() => d.remove(), 3400);
  }

  renderObjectives() {
    const g = this.game;
    const parts = [];
    let firstOpen = true;
    for (const o of g.objectives) {
      const text = o.text || 'Mal over alle fiendens bygninger';
      const pr = g.objectiveProgress(o);
      let extra = '';
      if (pr && pr.need > 1 && !o.done) extra = ` (${Math.min(pr.have, pr.need)}/${pr.need})`;
      parts.push(`<div class="obj ${o.done ? 'done' : ''}"><span class="box"></span><span>${text}${extra}</span></div>`);
      if (!o.done && firstOpen) {
        firstOpen = false;
        if (o.type === 'survive') parts.push(`<div class="timer">${fmtTime(pr.left)}</div>`);
        if (o.hint) parts.push(`<div class="hint">${o.hint}</div>`);
      }
    }
    const html = parts.join('');
    if (html !== this._objHtml) { this.el.objectives.innerHTML = html; this._objHtml = html; }
  }

  update(dt) {
    const g = this.game, P = g.teams[g.player];
    this.el.crystals.textContent = Math.floor(P.crystals);
    this.el.units.textContent = `${g.unitCount(g.player)}/${UNIT_CAP}`;
    this.paintT -= dt;
    if (this.paintT <= 0) {
      this.paintT = 0.5;
      this.el.paint.innerHTML = g.teams.map((t) => `<div style="width:${(g.paint.coverage(t.id) * 100).toFixed(1)}%;background:${t.color.main}"></div>`).join('');
    }
    this.objT -= dt;
    if (this.objT <= 0) { this.objT = 0.25; this.renderObjectives(); }
    const sig = this.signature();
    if (this.dirty || sig !== this.sig) {
      this.sig = sig; this.dirty = false;
      this.renderSelection();
      this.renderCommands();
    }
  }

  signature() {
    const g = this.game, T = g.teams[g.player];
    const sel = g.selection.map((e) => {
      const hp = Math.round(((e.hp + (e.shield || 0)) / ((e.maxHp || 1) + (e.maxShield || 0))) * 20);
      return `${e.id}:${hp}:${e.queue ? e.queue.join(',') : ''}:${e.built != null ? Math.round(e.built * 20) : ''}:${e.amount != null ? Math.round(e.amount / 50) : ''}`;
    }).join('|');
    const afford = [100, 50, 30, 80, 110, 125, 150, 200, 400].map((c) => (T.crystals >= c ? 1 : 0)).join('');
    const mode = this.input.mode ? this.input.mode.type + (this.input.mode.what || '') : '';
    return sel + '#' + afford + '#' + mode;
  }

  renderSelection() {
    const g = this.game, el = this.el.sel, sel = g.selection;
    const P = g.player;
    if (!sel.length) {
      el.innerHTML = this.input.mode && this.input.mode.type === 'build'
        ? `<div class="tip">Klikk på bakken der <b>${BUILDINGS[this.input.mode.what].name}</b> skal stå. Grønt betyr at det er plass.</div>`
        : `<div class="tip">Klikk på noe for å velge det.<br>Dra en firkant rundt soldatene for å velge mange.</div>`;
      return;
    }
    if (sel.length === 1) {
      const e = sel[0];
      const team = e.team != null ? g.teams[e.team] : null;
      let iconUrl, name, desc = '', extra = '';
      if (e.kind === 'resource') {
        iconUrl = this.crystalIcon(); name = 'Krystaller';
        desc = `Det er ${Math.ceil(e.amount)} krystaller igjen her.`;
      } else {
        iconUrl = Art.icon(e.kind, e.type, team.colorKey, 96);
        name = e.def.name; desc = e.def.desc;
        if (e.team !== P) extra += `<p><b>${team.name}</b> ${P >= 0 && g.isEnemy(P, e.team) ? '(fiende)' : '(venn)'}</p>`;
        extra += `<div class="hpbar"><div style="width:${clamp(e.hp / e.maxHp, 0, 1) * 100}%"></div></div>`;
        if (e.maxShield) extra += `<div class="hpbar shield"><div style="width:${clamp(e.shield / e.maxShield, 0, 1) * 100}%"></div></div>`;
        if (e.kind === 'building' && e.built < 1) extra += `<p>Bygges … ${Math.floor(e.built * 100)} %</p>`;
        if (e.kind === 'unit' && e.def.worker && e.team === P) {
          const st = { gather: 'Samler krystaller', return: 'Bærer krystaller hjem', move: 'Går', idle: 'Venter' }[e.state] || '';
          if (st) extra += `<p>${st}</p>`;
        }
        if (e.kind === 'building' && e.queue.length && e.team === P) {
          extra += '<div class="queue">' + e.queue.map((q, i) => `<img data-q="${i}" title="Klikk for å avbryte" src="${Art.icon('unit', q, team.colorKey, 48)}">`).join('') + '</div>';
        }
      }
      el.innerHTML = `<img class="big-icon" src="${iconUrl}"><div class="info"><h3>${name}</h3><p>${desc}</p>${extra}</div>`;
      el.querySelectorAll('[data-q]').forEach((img) => img.addEventListener('click', () => {
        g.cancelTrain(sel[0], parseInt(img.dataset.q, 10)); Sound.play('click'); this.dirty = true;
      }));
      return;
    }
    const team = g.teams[sel[0].team];
    el.innerHTML = '<div class="group">' + sel.slice(0, 30).map((u, i) => `<img data-i="${i}" title="${u.def.name}" src="${Art.icon('unit', u.type, team.colorKey, 48)}">`).join('') + '</div>';
    el.querySelectorAll('[data-i]').forEach((img) => img.addEventListener('click', () => {
      this.input.select([sel[parseInt(img.dataset.i, 10)]]);
    }));
  }

  renderCommands() {
    const g = this.game, inp = this.input, P = g.player, T = g.teams[P];
    const own = g.selection.filter((e) => e.team === P);
    const list = [];
    const buildBtn = (type) => {
      const d = BUILDINGS[type];
      list.push({ icon: Art.icon('building', type, T.colorKey, 64), label: d.name, cost: d.cost, title: d.desc, poor: T.crystals < d.cost,
        active: inp.mode && inp.mode.what === type, fn: () => inp.startBuild(type) });
    };
    if (inp.mode && inp.mode.type !== 'move') {
      const txt = inp.mode.type === 'build' ? 'Avbryt bygging' : 'Avbryt';
      list.push({ text: txt, fn: () => { inp.mode = null; this.dirty = true; } });
      if (inp.mode.type === 'rally') this.toastOnce('Klikk der nye enheter skal samles.');
    } else if (own.length && own[0].kind === 'unit') {
      if (own.some((u) => u.def.worker)) for (const type of T.f.builds) buildBtn(type);
      if (own.some((u) => !u.def.worker)) {
        list.push({ text: 'Løp hit', title: 'Gå uten å stoppe for å slåss', active: inp.mode && inp.mode.type === 'move',
          fn: () => { inp.mode = inp.mode && inp.mode.type === 'move' ? null : { type: 'move' }; this.dirty = true; } });
      }
      list.push({ text: 'Stopp', fn: () => g.cmdStop(inp.ownSelectedUnits()) });
    } else if (own.length && own[0].kind === 'building') {
      const b = own[0];
      if (b.built >= 1 && b.def.trains) {
        for (const type of b.def.trains) {
          const d = UNITS[type];
          list.push({ icon: Art.icon('unit', type, T.colorKey, 64), label: d.name, cost: d.cost, title: d.desc, poor: T.crystals < d.cost,
            fn: () => {
              const err = g.cmdTrain(b, type);
              if (err) { this.toast(err, 'alert'); Sound.play('error'); } else Sound.play('click');
              this.dirty = true;
            } });
        }
      }
      if (b.def.isBase && b.built >= 1) for (const type of T.f.builds) if (type !== b.type) buildBtn(type);
      if (b.def.trains && b.built >= 1) list.push({ text: 'Samlings­punkt', title: 'Hvor nye enheter skal gå', fn: () => { inp.mode = { type: 'rally' }; this.dirty = true; } });
    }
    list.push({ text: 'Alle soldater', title: 'Velg alle soldatene dine (A)', fn: () => inp.selectArmy() });
    if (!own.length) {
      list.push({ text: 'Til basen', title: 'Vis basen (mellomrom)', fn: () => inp.jumpHome() });
      list.push({ text: 'Alle byggere', title: 'Velg alle byggerne (B)', fn: () => inp.selectWorkers() });
    }

    this.cmdList = list;
    const html = list.map((c, i) => {
      const cls = ['cmd', c.text ? 'text' : '', c.poor ? 'poor' : '', c.active ? 'active' : ''].join(' ');
      const key = i < 9 ? `<span class="key">${i + 1}</span>` : '';
      if (c.text) return `<button class="${cls}" data-c="${i}" title="${c.title || ''}">${key}${c.text}</button>`;
      return `<button class="${cls}" data-c="${i}" title="${c.title || ''}">${key}<span class="cost">${c.cost}</span><img src="${c.icon}" alt="">${c.label}</button>`;
    }).join('');
    this.el.cmds.innerHTML = html;
    this.el.cmds.querySelectorAll('[data-c]').forEach((btn) => btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Sound.ensure();
      const c = this.cmdList[parseInt(btn.dataset.c, 10)];
      if (c) c.fn();
    }));
  }

  toastOnce(text) {
    if (this._lastOnce === text) return;
    this._lastOnce = text;
    this.toast(text);
  }

  hotkey(i) {
    const c = this.cmdList[i];
    if (c) c.fn();
  }
}
