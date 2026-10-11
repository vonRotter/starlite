// Headless smoke test: loads the game, runs AI-vs-AI simulations for all
// faction pairs, plays through the campaign setups and checks for errors.
// Usage: node tests/smoke.js [screenshotDir]
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

(async () => {
  const shots = process.argv[2];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof App !== 'undefined' && App.game, null, { timeout: 60000 }).catch((e) => { console.error(errors.join('\n')); throw e; });
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: shots + '/menu.png' });

  // 1) AI vs AI for every pairing.
  const sims = await page.evaluate(() => {
    const facs = ['stjerne', 'summ', 'krystall', 'graa'];
    const out = [];
    let seed = 1;
    for (const a of facs) for (const b of facs) {
      if (a >= b) continue;
      const cfg = demoConfig(seed++);
      cfg.teams[0].faction = a; cfg.teams[1].faction = b;
      cfg.teams[0].ai = cfg.teams[1].ai = 'middels';
      cfg.map.w = 56; cfg.map.h = 42;
      cfg.teams[1].start = cfg.map.bases[1] = { tx: 48, ty: 34 };
      const g = new Game(cfg);
      const t0 = performance.now();
      let steps = 0;
      while (!g.over && g.time < 1500) { g.update(1 / 30); steps++; }
      const t1 = performance.now();
      out.push({ a, b, over: g.over, winner: g.result && g.result.winner, time: Math.round(g.time),
        msPerStep: +((t1 - t0) / steps).toFixed(3), units: g.units.length, made: g.teams.map((t) => t.made), gathered: g.teams.map((t) => t.gathered),
        paint: g.teams.map((t) => Math.round(g.paint.coverage(t.id) * 100)) });
    }
    return out;
  });
  console.table(sims);

  // 2) Campaign setups and skirmish setups construct and run for a while.
  const camp = await page.evaluate(() => {
    const res = [];
    MISSIONS.forEach((m, i) => {
      const g = new Game(m.setup());
      for (let k = 0; k < 30 * 120; k++) g.update(1 / 30);
      res.push({ mission: m.id, over: g.over, result: g.result, time: Math.round(g.time), units: g.units.length, buildings: g.buildings.length,
        objectives: g.objectives.map((o) => o.done) });
    });
    return res;
  });
  console.table(camp);

  // 3) Start mission 1 through the UI and take screenshots.
  await page.evaluate(() => App.startMission(0));
  await page.waitForTimeout(600);
  if (shots) await page.screenshot({ path: shots + '/dialog.png' });
  await page.evaluate(() => App.dialogEnd());
  await page.waitForTimeout(300);
  // Follow the tutorial with real commands.
  await page.evaluate(() => {
    const g = App.game;
    g.teams[0].crystals = 1000;
    const base = g.buildings[0];
    const err = g.cmdBuild(0, 'kaserne', base.tx + 6, base.ty);
    if (err) throw new Error('build failed: ' + err);
  });
  await page.evaluate(() => { for (let k = 0; k < 30 * 22; k++) App.game.update(1 / 30); });
  await page.evaluate(() => {
    const g = App.game; const k = g.buildings.find((b) => b.type === 'kaserne');
    for (let i = 0; i < 5; i++) { const e = g.cmdTrain(k, 'malersoldat'); if (e) throw new Error(e); }
    App.input.select([k]);
  });
  await page.waitForTimeout(400);
  if (shots) await page.screenshot({ path: shots + '/mission1-base.png' });
  const tut = await page.evaluate(() => {
    const g = App.game;
    for (let k = 0; k < 30 * 60; k++) g.update(1 / 30);
    const army = g.units.filter((u) => u.team === 0 && u.def.dmg);
    const camp = g.buildings.find((b) => b.team === 1);
    g.cmdMove(army, camp.x, camp.y, true);
    App.input.select(army);
    for (let k = 0; k < 30 * 30; k++) g.update(1 / 30);
    App.cam.x = army[0].x - 500; App.cam.y = army[0].y - 300;
    return { army: army.length, objectives: g.objectives.map((o) => o.done), over: g.over, time: g.time };
  });
  console.log('tutorial progress', tut);
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: shots + '/mission1-fight.png' });
  await page.evaluate(() => { for (let k = 0; k < 30 * 60 && !App.game.over; k++) App.game.update(1 / 30); });
  const tutEnd = await page.evaluate(() => ({ over: App.game.over, result: App.game.result, obj: App.game.objectives.map((o) => o.done) }));
  console.log('tutorial end', tutEnd);
  await page.waitForTimeout(2500);
  if (shots) await page.screenshot({ path: shots + '/mission1-outro.png' });

  // 4) Skirmish screen and a skirmish game.
  await page.evaluate(() => { App.dialogEnd(); App.quitToMenu(); App.showSkirmish(); });
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: shots + '/skirmish-setup.png', fullPage: true });
  await page.evaluate(() => App.startSkirmish({ faction: 'summ', color: 'pink', enemy: 'krystall', helper: 'stjerne', difficulty: 'middels', theme: 'grotte' }));
  await page.evaluate(() => { for (let k = 0; k < 30 * 300; k++) App.game.update(1 / 30); });
  await page.evaluate(() => {
    const g = App.game;
    const enemy = g.units.find((u) => u.team === 1 && u.def.dmg) || g.units.find((u) => u.team !== 0);
    if (enemy) App.input.centerOn(enemy.x, enemy.y);
    const mine = g.units.filter((u) => u.team === 0);
    App.input.select(mine.slice(0, 8));
  });
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: shots + '/skirmish-game.png' });

  // 5) UI interactions by mouse: click on base, click build button, place.
  await page.evaluate(() => App.startSkirmish({ faction: 'krystall', color: 'teal', enemy: 'graa', helper: 'none', difficulty: 'fredelig', theme: 'sky' }));
  await page.waitForTimeout(300);
  const basePos = await page.evaluate(() => {
    const g = App.game, b = g.buildings.find((x) => x.team === 0);
    return { x: (b.x - App.cam.x) * App.cam.zoom, y: (b.y - App.cam.y) * App.cam.zoom };
  });
  await page.mouse.click(basePos.x, basePos.y);
  await page.waitForTimeout(200);
  const buttons = await page.$$eval('#commands .cmd', (els) => els.map((e) => e.textContent.trim()));
  console.log('base buttons:', buttons);
  await page.evaluate(() => { App.game.teams[0].crystals = 500; });
  await page.waitForTimeout(100);
  await page.click('#commands .cmd >> nth=1'); // first build button (Lysportal)
  await page.mouse.move(basePos.x + 200, basePos.y + 40);
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: shots + '/placing.png' });
  await page.mouse.click(basePos.x + 200, basePos.y + 40);
  const placed = await page.evaluate(() => App.game.buildings.filter((b) => b.team === 0).map((b) => b.type));
  console.log('buildings after placing:', placed);
  if (!placed.includes('portal')) errors.push('placing a building with the mouse failed');
  // select a worker by box and right-click a crystal
  await page.evaluate(() => { for (let k = 0; k < 30 * 5; k++) App.game.update(1 / 30); });
  await page.keyboard.press('a');
  await page.keyboard.press('Escape');
  await page.keyboard.press('p');
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: shots + '/pause.png' });
  await page.keyboard.press('p');

  // Command modes: "Løp hit", rally point and cancelling a queued unit.
  const modes = await page.evaluate(() => {
    const g = App.game, inp = App.input, hud = App.hud;
    const out = {};
    const base = g.buildings.find((b) => b.team === 0 && b.def.isBase);
    g.teams[0].crystals = 1000;
    inp.select([base]); hud.update(0);
    hud.cmdList.find((c) => c.text && c.text.startsWith('Samlings')).fn();
    out.rallyMode = inp.mode && inp.mode.type;
    inp.click((base.x + 150 - App.cam.x) * App.cam.zoom, (base.y - App.cam.y) * App.cam.zoom, false);
    out.rally = !!base.rally;
    g.cmdTrain(base, 'svevesonde'); g.cmdTrain(base, 'svevesonde');
    const before = g.teams[0].crystals;
    g.cancelTrain(base, 1);
    out.refund = g.teams[0].crystals - before;
    const portal = g.buildings.find((b) => b.type === 'portal');
    for (let k = 0; k < 30 * 25; k++) g.update(1 / 30);
    g.cmdTrain(portal, 'lysvokter');
    for (let k = 0; k < 30 * 16; k++) g.update(1 / 30);
    const v = g.units.find((u) => u.type === 'lysvokter');
    out.trained = !!v;
    inp.select([v]); hud.update(0);
    hud.cmdList.find((c) => c.text === 'Løp hit').fn();
    out.moveMode = inp.mode && inp.mode.type;
    inp.click((v.x + 200 - App.cam.x) * App.cam.zoom, (v.y - App.cam.y) * App.cam.zoom, false);
    out.moving = v.state === 'move' && !v.attackMove;
    return out;
  });
  console.log('modes', modes);
  if (!(modes.rallyMode === 'rally' && modes.rally && modes.refund === 50 && modes.trained && modes.moveMode === 'move' && modes.moving)) errors.push('command modes failed: ' + JSON.stringify(modes));

  // Tablet-sized layout
  await page.setViewportSize({ width: 820, height: 600 });
  await page.evaluate(() => { const g = App.game; App.input.select(g.units.filter((u) => u.team === 0)); });
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: shots + '/tablet.png' });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.evaluate(() => { App.quitToMenu(); App.showCampaign(); });
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: shots + '/campaign.png' });
  await page.evaluate(() => App.showHowto());
  await page.waitForTimeout(200);
  if (shots) await page.screenshot({ path: shots + '/howto.png' });
  // Final mission: winning shows the outro and then the ending screen.
  await page.evaluate(() => { App.startMission(4); App.dialogEnd(); });
  await page.evaluate(() => { const g = App.game; for (const b of g.buildings.filter((b) => b.team === 2)) g.kill(b, 0); for (let k = 0; k < 30; k++) g.update(1 / 30); });
  await page.waitForTimeout(2300);
  const outro = await page.evaluate(() => !!App.dialogState && App.dialogState.lines.length);
  await page.evaluate(() => App.dialogEnd());
  await page.waitForTimeout(300);
  const ending = await page.evaluate(() => !document.getElementById('screen-end').classList.contains('hidden'));
  console.log('final mission: outro lines', outro, 'ending shown', ending);
  if (!outro || !ending) errors.push('final mission flow failed');
  await page.evaluate(() => { App.confettiOn = false; App.quitToMenu(); });

  await page.evaluate(() => App.showMenu());
  await page.waitForTimeout(300);
  if (shots) await page.screenshot({ path: shots + '/menu2.png' });
  await page.evaluate(() => App.showEnding());
  await page.waitForTimeout(500);
  if (shots) await page.screenshot({ path: shots + '/ending.png' });

  await browser.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('OK: no errors');
})().catch((e) => { console.error(e); process.exit(1); });
