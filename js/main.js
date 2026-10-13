'use strict';
// App controller: screens, dialogue, the main loop and campaign progress.

const STEP = 1 / 30;
const SPEEDS = [{ name: 'Rolig', v: 0.75 }, { name: 'Normal', v: 1 }, { name: 'Rask', v: 1.4 }];

const App = {
  init() {
    this.canvas = document.getElementById('world');
    const mm = document.getElementById('minimap');
    // The 3D renderer needs WebGL and a served page (ES modules); ?2d forces the flat renderer.
    const want3D = typeof window.Renderer3D === 'function' && !/[?&]2d\b/.test(location.search);
    this.renderer = want3D ? new window.Renderer3D(this.canvas, mm, document.getElementById('overlay')) : new Renderer(this.canvas, mm);
    this.is3D = want3D;
    this.input = new Input(this.canvas, mm);
    this.input.R = this.renderer;
    this.hud = new HUD();
    this.cam = { x: 0, y: 0, zoom: 1, w: window.innerWidth, h: window.innerHeight };
    this.renderer.cam = this.cam;
    this.game = null;
    this.mode = 'menu';
    this.paused = false;
    this.acc = 0;
    this.mmT = 0;
    this.speedIdx = safeStorageGet('starlite.speed', 1);
    // 'sc' = StarCraft-style controls, 'enkel' = simple click controls for young children.
    this.controls = safeStorageGet('starlite.controls', 'sc');
    this.input.sc = this.controls === 'sc';
    this.progress = safeStorageGet('starlite.progress', { unlocked: 1, done: [] });
    this.input.onPause = () => this.togglePause();

    window.addEventListener('resize', () => this.resize());
    document.getElementById('btn-pause').addEventListener('click', () => this.togglePause());
    document.getElementById('btn-sound').addEventListener('click', () => {
      Sound.set('sfx', !Sound.state.sfx);
      Sound.set('music', Sound.state.sfx);
      if (Sound.state.music) Sound.startMusic();
      this.updateSoundButton();
    });
    // Browsers only allow sound after the first tap or click.
    const unlock = () => {
      Sound.ensure();
      if (Sound.state.music) Sound.startMusic();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('keydown', (e) => {
      if (this.dialogState && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.dialogNext(); }
      else if ((e.key === 'Escape' || e.code === 'KeyP') && this.mode === 'game' && this.paused && !this.dialogState && !this.game.over) {
        e.preventDefault();
        this.togglePause();
      }
    });
    if (window.speechSynthesis) speechSynthesis.onvoiceschanged = () => {};

    this.resize();
    this.startDemo();
    this.showMenu();
    document.getElementById('loading').classList.add('hidden');
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  },

  resize() {
    this.cam.w = window.innerWidth;
    this.cam.h = window.innerHeight;
    this.renderer.resize(this.cam.w, this.cam.h);
    if (this.game && this.mode === 'game' && this.input.game === this.game) this.input.clampCam();
  },

  frame(ts) {
    const dt = Math.min(0.1, (ts - this.last) / 1000);
    this.last = ts;
    const g = this.game;
    if (g) {
      if (this.mode === 'demo' && g.time > 360 && !g.over) { this.startDemo(); return requestAnimationFrame((t) => this.frame(t)); }
      if (!this.paused) {
        this.acc += dt * g.speed;
        let n = 0;
        while (this.acc >= STEP && n < 8) { g.update(STEP); this.acc -= STEP; n++; }
        if (n >= 8) this.acc = 0;
      }
      if (this.mode === 'demo') this.demoCamera(dt);
      else this.input.update(dt);
      this.renderer.draw(this.cam, this.mode === 'game' ? this.input.viewState() : { hover: null });
      if (this.mode === 'game') {
        this.hud.update(dt);
        this.mmT -= dt;
        if (this.mmT <= 0) { this.mmT = 0.1; this.renderer.drawMinimap(this.cam); }
      }
    }
    requestAnimationFrame((t) => this.frame(t));
  },

  // ---------- screens ----------
  hideScreens() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
  },
  show(id, html, center) {
    this.hideScreens();
    const el = document.getElementById(id);
    if (html != null) el.innerHTML = html;
    el.classList.toggle('center', !!center);
    el.classList.remove('hidden');
    return el;
  },
  on(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', () => { Sound.play('click'); fn(); });
  },

  splatSVG(color, seed, extra = '') {
    const rng = makeRng(seed);
    let d = '';
    const n = 18;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * TAU, r = 80 + rng() * 28 + (i % 3 === 0 ? 22 : 0);
      const x = 200 + Math.cos(a) * r * 1.6, y = 120 + Math.sin(a) * r * 0.8;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    let drops = '';
    for (let i = 0; i < 7; i++) {
      const a = rng() * TAU, r = 150 + rng() * 60;
      drops += `<circle cx="${200 + Math.cos(a) * r * 1.3}" cy="${120 + Math.sin(a) * r * 0.6}" r="${6 + rng() * 12}" fill="${color}" stroke="#2a2440" stroke-width="5"/>`;
    }
    return `<svg class="splat-bg ${extra}" viewBox="-60 -40 520 320" xmlns="http://www.w3.org/2000/svg"><path d="${d}Z" fill="${color}" stroke="#2a2440" stroke-width="8" stroke-linejoin="round"/>${drops}</svg>`;
  },

  showMenu() {
    const letters = 'STARLITE'.split('').map((c) => `<span>${c}</span>`).join('');
    this.show('screen-menu', `
      <div class="logo-wrap">${this.splatSVG('#ff3da5', 7)}<div class="logo">${letters}</div>
        <div class="subtitle">Mal verden fargerik igjen!</div></div>
      <div class="menu-buttons">
        <button class="btn big pink" id="m-story">Historie</button>
        <button class="btn big" id="m-free">Fri lek</button>
        <button class="btn big blue" id="m-howto">Slik spiller du</button>
      </div>
      <div class="menu-footer">
        <button class="btn small white" id="m-sfx"></button>
        <button class="btn small white" id="m-music"></button>
        <button class="btn small white" id="m-speak"></button>
        <button class="btn small white" id="m-controls"></button>
      </div>
      <div class="credits">Et fargerikt strategispill for barn. Bygg, samle krystaller og mal planeten Glimra fargerik!</div>`);
    const upd = () => {
      document.getElementById('m-sfx').textContent = 'Lyder: ' + (Sound.state.sfx ? 'på' : 'av');
      document.getElementById('m-music').textContent = 'Musikk: ' + (Sound.state.music ? 'på' : 'av');
      document.getElementById('m-speak').textContent = 'Les høyt: ' + (Sound.state.speak ? 'på' : 'av');
      document.getElementById('m-controls').textContent = 'Styring: ' + this.controlsName();
    };
    upd();
    this.on('m-story', () => this.showCampaign());
    this.on('m-free', () => this.showSkirmish());
    this.on('m-howto', () => this.showHowto());
    this.on('m-sfx', () => { Sound.set('sfx', !Sound.state.sfx); upd(); });
    this.on('m-music', () => { Sound.set('music', !Sound.state.music); if (Sound.state.music) Sound.startMusic(); upd(); });
    this.on('m-speak', () => { Sound.set('speak', !Sound.state.speak); upd(); if (Sound.state.speak) Sound.speak('Jeg leser høyt for deg.'); });
    this.on('m-controls', () => { this.toggleControls(); upd(); });
  },

  controlsName() { return this.controls === 'sc' ? 'StarCraft' : 'Enkel'; },
  toggleControls() {
    this.controls = this.controls === 'sc' ? 'enkel' : 'sc';
    this.input.sc = this.controls === 'sc';
    safeStorageSet('starlite.controls', this.controls);
    if (this.hud) this.hud.dirty = true;
  },

  showCampaign() {
    const icons = [['building', 'stjernestasjon', 'orange'], ['building', 'bikube', 'grey'], ['building', 'krystallhjerte', 'grey'],
      ['building', 'krystallhjerte', 'teal'], ['building', 'skyslottet', 'grey']];
    const cards = MISSIONS.map((m, i) => {
      const locked = m.id > this.progress.unlocked;
      const done = this.progress.done.includes(m.id);
      const [k, t, c] = icons[i];
      return `<button class="mission ${locked ? 'locked' : ''} ${done ? 'done' : ''}" data-m="${i}" ${locked ? 'disabled' : ''}>
        <span class="num">${m.id}</span><img src="${Art.icon(k, t, c, 160)}" alt="">
        <h3>${m.title}</h3><p>${locked ? 'Klar dette først: ' + MISSIONS[i - 1].title : m.subtitle}</p></button>`;
    }).join('');
    this.show('screen-campaign', `<h2>Historien om Glimra</h2><div class="missions">${cards}</div>
      <div class="row-buttons"><button class="btn white" id="c-prologue">Se starten av historien</button><button class="btn white" id="c-back">Tilbake</button></div>`);
    document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      Sound.play('click');
      this.startMission(parseInt(b.dataset.m, 10));
    }));
    this.on('c-back', () => this.showMenu());
    this.on('c-prologue', () => { this.hideScreens(); this.dialog(PROLOGUE, () => this.showCampaign()); });
  },

  showHowto() {
    const P = 'orange';
    const tip = (title, text, img) => `<div class="tip">${img ? `<img src="${img}" alt="">` : ''}<h4>${title}</h4><p>${text}</p></div>`;
    this.show('screen-howto', `<h2>Slik spiller du</h2><div class="panel"><div class="howto">
      ${tip('1. Velg', 'Klikk på en soldat for å velge den. Dra en firkant rundt mange soldater for å velge alle sammen.', Art.icon('unit', 'malersoldat', P, 64))}
      ${tip('2. Gå og mal', 'Høyreklikk på bakken for å gå dit, eller på en fiende for å angripe. Trykk Q og klikk for å slåss med alt på veien.', Art.icon('unit', 'rullebil', P, 64))}
      ${tip('3. Samle krystaller', 'Byggerne samler krystaller av seg selv. Krystaller bruker du til å bygge hus og lage soldater.', Art.icon('unit', 'byggebot', P, 64))}
      ${tip('4. Bygg', 'Velg en bygger, trykk på en bygning nede til høyre, og klikk der den skal stå. Byggeren går dit og setter i gang.', Art.icon('building', 'kaserne', P, 64))}
      ${tip('5. Utvid', 'Bygg en ny base ved et krystallfelt et annet sted på kartet. Da får du mer krystaller og kan bygge der også.', Art.icon('building', 'stjernestasjon', P, 64))}
      ${tip('6. Forsk', 'Bygg Fargelab (eller det ditt folk har) for å forske fram sterkere maling og drakter, og for å lage en kjempeenhet.', Art.icon('unit', 'malerrobot', P, 64))}
      ${tip('7. Maling', 'Alt du treffer blir malt i din farge. På din egen farge går du fortere!', Art.icon('unit', 'ballongflyer', P, 64))}
      ${tip('8. Vinn', 'Mal over alle bygningene til fienden. Da blir de glade og fargerike igjen!', Art.icon('building', 'skyslottet', 'grey', 64))}
      </div>
      <div class="keys"><b>Alltid:</b> <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> eller piltaster flytter kartet · musehjulet zoomer ·
      <kbd>Mellomrom</kbd> til basene dine · <kbd>F1</kbd> ledig bygger · <kbd>F2</kbd> alle soldater · <kbd>Esc</kbd> avbryt · <kbd>P</kbd> pause.<br>
      <b>StarCraft-styring:</b> venstreklikk velger · høyreklikk går, angriper og samler · <kbd>Q</kbd> angrip-gå · <kbd>X</kbd> stopp ·
      <kbd>H</kbd> hold posisjon · <kbd>Shift</kbd> legger ordre i kø · <kbd>Ctrl</kbd>+<kbd>1</kbd>–<kbd>9</kbd> lagrer gruppe, <kbd>1</kbd>–<kbd>9</kbd> velger den ·
      bokstaven på hver knapp er snarveien.<br>
      <b>Enkel styring:</b> klikk på bakken for å gå og slåss · høyreklikk går uten å slåss · <kbd>1</kbd>–<kbd>9</kbd> trykker knappene.<br>
      Du bytter styring i menyen eller i pausen. På nettbrett: dra med én finger for å flytte kartet.</div></div>
      <div class="row-buttons"><button class="btn white" id="h-back">Tilbake</button></div>`);
    this.on('h-back', () => this.showMenu());
  },

  showSkirmish() {
    const s = Object.assign({ faction: 'stjerne', color: 'orange', enemy: 'random', helper: 'none', difficulty: 'lett', theme: 'eng' },
      safeStorageGet('starlite.skirmish', {}));
    const render = () => {
      const fac = (id, sel, key) => {
        const f = FACTIONS[id];
        const unit = { stjerne: 'malersoldat', summ: 'sprettbille', krystall: 'lysvokter', graa: 'stovdott' }[id];
        const col = key === 'faction' ? s.color : f.defaultColor;
        return `<button class="choice faction ${sel ? 'sel' : ''}" data-k="${key}" data-v="${id}"><img src="${Art.icon('unit', unit, col, 64)}" alt="">
          <span>${f.name}<small>${f.desc} ${f.trait}</small></span></button>`;
      };
      const opt = (key, v, label, extra = '') => `<button class="choice ${s[key] === v ? 'sel' : ''}" data-k="${key}" data-v="${v}">${extra}${label}</button>`;
      const html = `<h2>Fri lek</h2><div class="panel setup">
        <div><h4>Velg ditt folk</h4><div class="choices">${['stjerne', 'summ', 'krystall'].map((id) => fac(id, s.faction === id, 'faction')).join('')}</div></div>
        <div><h4>Velg farge</h4><div class="choices">${PLAYER_COLORS.map((c) => `<span class="swatch ${s.color === c ? 'sel' : ''}" data-k="color" data-v="${c}" title="${COLORS[c].name}" style="background:${COLORS[c].main}"></span>`).join('')}</div></div>
        <div><h4>Motstander</h4><div class="choices">${opt('enemy', 'random', 'Tilfeldig')}${['stjerne', 'summ', 'krystall', 'graa'].map((id) => opt('enemy', id, FACTIONS[id].name)).join('')}</div></div>
        <div><h4>Hjelper (en venn som spiller på ditt lag)</h4><div class="choices">${opt('helper', 'none', 'Ingen')}${['stjerne', 'summ', 'krystall'].map((id) => opt('helper', id, FACTIONS[id].name)).join('')}</div></div>
        <div><h4>Hvor vanskelig?</h4><div class="choices">${Object.entries(DIFFICULTIES).map(([k, d]) => opt('difficulty', k, `${d.name}<small>${d.desc}</small>`)).join('')}</div></div>
        <div><h4>Kart</h4><div class="choices">${MAP_CHOICES.map((t) => opt('theme', t, THEMES[t].name)).join('')}</div></div>
        </div>
        <div class="row-buttons"><button class="btn white" id="s-back">Tilbake</button><button class="btn big pink" id="s-start">Start!</button></div>`;
      this.show('screen-skirmish', html);
      document.querySelectorAll('#screen-skirmish [data-k]').forEach((el) => el.addEventListener('click', () => {
        s[el.dataset.k] = el.dataset.v; Sound.play('click'); render();
      }));
      this.on('s-back', () => this.showMenu());
      this.on('s-start', () => { safeStorageSet('starlite.skirmish', s); this.startSkirmish(s); });
    };
    render();
  },

  startSkirmish(s) {
    const enemy = s.enemy === 'random' ? ['stjerne', 'summ', 'krystall', 'graa'][Math.floor(Math.random() * 4)] : s.enemy;
    const used = [s.color];
    const pickColor = (fac) => {
      if (fac === 'graa') return 'grey';
      const pref = FACTIONS[fac].defaultColor;
      const c = !used.includes(pref) ? pref : PLAYER_COLORS.find((x) => !used.includes(x));
      used.push(c);
      return c;
    };
    const helper = s.helper === 'none' ? null : s.helper;
    const helperColor = helper ? pickColor(helper) : null;
    const enemyColor = pickColor(enemy);
    const cfg = skirmishConfig({
      faction: s.faction, color: s.color, enemy, enemyColor, helper, helperColor,
      difficulty: s.difficulty, theme: s.theme, seed: Math.floor(Math.random() * 100000),
    });
    this.startGame(cfg, { type: 'skirmish', settings: s });
  },

  startMission(i) {
    const m = MISSIONS[i];
    const cfg = m.setup();
    this.startGame(cfg, { type: 'campaign', index: i }, true);
    const lines = (i === 0 && !safeStorageGet('starlite.prologueSeen', false)) ? PROLOGUE.concat(m.briefing) : m.briefing;
    safeStorageSet('starlite.prologueSeen', true);
    this.paused = true;
    this.input.detach();
    this.dialog(lines, () => {
      this.paused = false;
      this.input.attach(this.game, this.cam, this.hud);
      const o = this.game.objectives[0];
      if (o && o.hint) this.hud.toast(o.hint);
    });
  },

  startGame(cfg, meta, hold) {
    Sound.stopSpeaking();
    this.hideScreens();
    this.mode = 'game';
    this.meta = meta;
    this.lastCfg = cfg;
    const g = new Game(cfg);
    g.speed = SPEEDS[this.speedIdx].v;
    g.sound = (n) => Sound.play(n);
    g.onMessage = (t, k) => this.hud.toast(t, k);
    g.onEnd = (r) => this.onEnd(r);
    g.onObjective = (o) => {
      if (!o) return;
      Sound.play('done');
      this.hud.toast(`Bra jobbet! «${o.text || 'Oppdrag'}» er klart.`, 'good');
      const next = g.objectives.find((x) => !x.done);
      if (next && next.hint) setTimeout(() => this.hud.toast(next.hint), 1200);
    };
    this.game = g;
    this.acc = 0;
    this.paused = false;
    document.getElementById('hud').classList.remove('hidden');
    this.renderer.setGame(g);
    this.resize();
    this.cam.zoom = 1;
    this.hud.attach(g, this.input);
    this.input.attach(g, this.cam, this.hud);
    this.input.jumpHome();
    this.updateSoundButton();
    if (hold) this.input.detach();
  },

  updateSoundButton() {
    document.getElementById('btn-sound').classList.toggle('off', !Sound.state.sfx);
  },

  togglePause() {
    if (this.mode !== 'game' || !this.game || this.game.over || this.dialogState) return;
    this.paused = !this.paused;
    if (!this.paused) { this.hideScreens(); this.input.attach(this.game, this.cam, this.hud); return; }
    this.input.detach();
    const render = () => {
      this.show('screen-pause', `<h2>Pause</h2><div class="menu-buttons">
        <button class="btn big" id="p-resume">Fortsett</button>
        <button class="btn white" id="p-speed">Fart: ${SPEEDS[this.speedIdx].name}</button>
        <button class="btn white" id="p-music">Musikk: ${Sound.state.music ? 'på' : 'av'}</button>
        <button class="btn white" id="p-controls">Styring: ${this.controlsName()}</button>
        <button class="btn white" id="p-restart">Start på nytt</button>
        <button class="btn pink" id="p-quit">Til menyen</button></div>`, true);
      this.on('p-resume', () => this.togglePause());
      this.on('p-speed', () => {
        this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
        safeStorageSet('starlite.speed', this.speedIdx);
        this.game.speed = SPEEDS[this.speedIdx].v;
        render();
      });
      this.on('p-music', () => { Sound.set('music', !Sound.state.music); if (Sound.state.music) Sound.startMusic(); render(); });
      this.on('p-controls', () => { this.toggleControls(); render(); });
      this.on('p-restart', () => this.restart());
      this.on('p-quit', () => this.quitToMenu());
    };
    render();
  },

  restart() {
    if (this.meta.type === 'campaign') this.startMission(this.meta.index);
    else this.startSkirmish(this.meta.settings);
  },

  quitToMenu() {
    Sound.stopSpeaking();
    document.getElementById('hud').classList.add('hidden');
    this.input.detach();
    this.paused = false;
    this.startDemo();
    this.showMenu();
  },

  onEnd(result) {
    const win = result === 'win';
    const g = this.game;
    this.input.detach();
    Sound.play(win ? 'win' : 'lose');
    this.hud.toast(win ? 'Hurra! Du klarte det!' : 'Å nei!', win ? 'good' : 'alert');
    setTimeout(() => {
      if (this.game !== g || this.mode !== 'game') return;
      if (this.meta.type === 'campaign' && win) {
        const m = MISSIONS[this.meta.index];
        if (!this.progress.done.includes(m.id)) this.progress.done.push(m.id);
        this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(MISSIONS.length, m.id + 1));
        safeStorageSet('starlite.progress', this.progress);
        this.dialog(m.outro, () => {
          if (this.meta.index === MISSIONS.length - 1) this.showEnding();
          else this.showResult(true);
        });
      } else this.showResult(win);
    }, 1800);
  },

  showResult(win) {
    const g = this.game, P = g.teams[g.player];
    const isCampaign = this.meta.type === 'campaign';
    const hasNext = isCampaign && win && this.meta.index < MISSIONS.length - 1;
    this.show('screen-result', `
      <div class="result-title ${win ? '' : 'lose'}">${win ? 'Hurra! Du vant!' : 'Å nei!'}</div>
      <div class="panel" style="max-width:460px;margin-top:20px">
        ${win ? '' : '<p style="font-size:20px;margin-top:0">Det gikk ikke denne gangen, men du kan prøve igjen!</p>'}
        <div class="stats">
          <span>Krystaller samlet</span><b>${Math.floor(P.gathered)}</b>
          <span>Enheter laget</span><b>${P.made}</b>
          <span>Fiender malt over</span><b>${P.killed}</b>
          <span>Kartet malt i din farge</span><b>${Math.round(g.paint.coverage(g.player) * 100)} %</b>
          <span>Tid</span><b>${fmtTime(g.time)}</b>
        </div>
      </div>
      <div class="row-buttons">
        ${hasNext ? '<button class="btn big pink" id="r-next">Neste oppdrag</button>' : ''}
        ${!win || !isCampaign ? `<button class="btn big" id="r-again">${win ? 'Spill igjen' : 'Prøv igjen'}</button>` : ''}
        <button class="btn white" id="r-menu">Til menyen</button>
      </div>`);
    this.on('r-next', () => this.startMission(this.meta.index + 1));
    this.on('r-again', () => this.restart());
    this.on('r-menu', () => this.quitToMenu());
  },

  showEnding() {
    const friends = ['stella', 'bolt', 'summa', 'lumi', 'regnbue'];
    this.show('screen-end', `<canvas class="confetti" id="confetti"></canvas>
      <div class="result-title">Glimra er fargerik igjen!</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin:24px 0;position:relative">
        ${friends.map((f) => `<div style="text-align:center"><img src="${Art.icon('portrait', f, 'orange', 140)}" style="width:120px;height:120px;background:#fff;border:4px solid #2a2440;border-radius:50%"><div style="font-weight:700">${CHARS[f].name}</div></div>`).join('')}
      </div>
      <div class="panel" style="max-width:560px;text-align:center;font-size:20px;position:relative">
        Du har klart hele historien! Takk for at du hjalp Stjernevennene, Summerne og Krystallvokterne.
        Nå kan du spille <b>Fri lek</b> så mye du vil.
      </div>
      <div class="row-buttons" style="position:relative"><button class="btn big pink" id="e-menu">Til menyen</button></div>`, false);
    this.on('e-menu', () => { this.confettiOn = false; this.quitToMenu(); });
    this.confetti();
  },

  confetti() {
    const cv = document.getElementById('confetti');
    const ctx = cv.getContext('2d');
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    const cols = ['#ff3da5', '#ff8a00', '#ffcf0a', '#4fd11a', '#2f6bff', '#9b4dff', '#00c4b4'];
    const bits = Array.from({ length: 140 }, () => ({
      x: Math.random() * cv.width, y: -Math.random() * cv.height, vy: 60 + Math.random() * 120,
      r: 4 + Math.random() * 6, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * TAU,
    }));
    this.confettiOn = true;
    let last = performance.now();
    const tick = (t) => {
      if (!this.confettiOn || !document.getElementById('confetti')) return;
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (const b of bits) {
        b.y += b.vy * dt; b.a += dt * 3; b.x += Math.sin(b.a) * 30 * dt;
        if (b.y > cv.height + 10) { b.y = -10; b.x = Math.random() * cv.width; }
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
        ctx.fillStyle = b.c; ctx.fillRect(-b.r, -b.r / 2, b.r * 2, b.r);
        ctx.restore();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },

  // ---------- dialogue ----------
  dialog(lines, done) {
    const box = document.getElementById('screen-dialog');
    box.classList.remove('hidden');
    this.dialogState = { lines, i: 0, done };
    const speakBtn = document.getElementById('dialog-speak');
    speakBtn.textContent = 'Les høyt: ' + (Sound.state.speak ? 'på' : 'av');
    speakBtn.onclick = () => {
      Sound.set('speak', !Sound.state.speak);
      speakBtn.textContent = 'Les høyt: ' + (Sound.state.speak ? 'på' : 'av');
      if (Sound.state.speak) this.dialogShow();
    };
    document.getElementById('dialog-next').onclick = () => { Sound.play('click'); this.dialogNext(); };
    document.getElementById('dialog-skip').onclick = () => { Sound.play('click'); this.dialogEnd(); };
    this.dialogShow();
    const cv = document.getElementById('portrait');
    const ctx = cv.getContext('2d');
    const anim = (t) => {
      if (!this.dialogState) return;
      const line = this.dialogState.lines[this.dialogState.i];
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#e9f3ff'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.translate(cv.width / 2, cv.height / 2 + 10);
      ctx.scale(1.55, 1.55);
      Art.drawPortrait(ctx, line.who, t / 1000);
      requestAnimationFrame(anim);
    };
    requestAnimationFrame(anim);
  },
  dialogShow() {
    const st = this.dialogState;
    const line = st.lines[st.i];
    const ch = CHARS[line.who] || CHARS.forteller;
    const name = document.getElementById('dialog-name');
    name.textContent = ch.name;
    name.style.background = ch.color;
    document.getElementById('dialog-text').textContent = line.text;
    document.getElementById('dialog-next').textContent = st.i === st.lines.length - 1 ? 'Start!' : 'Neste';
    if (this.meta && this.meta.type === 'campaign' && this.game && this.game.over) document.getElementById('dialog-next').textContent = st.i === st.lines.length - 1 ? 'Videre' : 'Neste';
    Sound.speak(line.text);
  },
  dialogNext() {
    const st = this.dialogState;
    if (!st) return;
    st.i++;
    if (st.i >= st.lines.length) this.dialogEnd();
    else this.dialogShow();
  },
  dialogEnd() {
    const st = this.dialogState;
    if (!st) return;
    this.dialogState = null;
    Sound.stopSpeaking();
    document.getElementById('screen-dialog').classList.add('hidden');
    if (st.done) st.done();
  },

  // ---------- menu background ----------
  startDemo() {
    this.mode = 'demo';
    this.meta = null;
    document.getElementById('hud').classList.add('hidden');
    const g = new Game(demoConfig(Math.floor(Math.random() * 1e6)));
    g.speed = 1.5;
    g.onEnd = () => setTimeout(() => { if (this.mode === 'demo' && this.game === g) this.startDemo(); }, 3000);
    this.game = g;
    this.paused = false;
    this.renderer.setGame(g);
    this.cam.zoom = 1;
    this.cam.x = g.map.pxW / 2 - this.cam.w / 2;
    this.cam.y = g.map.pxH / 2 - (this.cam.h * this.renderer.K) / 2;
  },

  demoCamera(dt) {
    const g = this.game;
    let x = 0, y = 0, n = 0;
    for (const u of g.units) if (u.def.dmg) { x += u.x; y += u.y; n++; }
    const tx = n ? x / n : g.map.pxW / 2, ty = n ? y / n : g.map.pxH / 2;
    const vw = this.cam.w, vh = this.cam.h * this.renderer.K;
    const cx = tx - vw / 2, cy = ty - vh / 2;
    const k = Math.min(1, dt * 0.4);
    this.cam.x += (cx - this.cam.x) * k;
    this.cam.y += (cy - this.cam.y) * k;
    this.cam.x = vw >= g.map.pxW ? (g.map.pxW - vw) / 2 : clamp(this.cam.x, 0, g.map.pxW - vw);
    this.cam.y = vh >= g.map.pxH ? (g.map.pxH - vh) / 2 : clamp(this.cam.y, 0, g.map.pxH - vh);
  },
};

window.addEventListener('load', () => App.init());
