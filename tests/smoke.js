// Headless smoke test: loads the game, runs AI-vs-AI simulations for all
// faction pairs, plays through the campaign setups and checks for errors.
// Usage: node tests/smoke.js [screenshotDir]
const { serve, launch } = require('./serve');

(async () => {
  const shots = process.argv[2];
  const server = await serve();
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(server.url);
  await page.waitForFunction(() => typeof App !== 'undefined' && App.game, null, { timeout: 60000 }).catch((e) => { console.error(errors.join('\n')); throw e; });
  if (!(await page.evaluate(() => App.is3D))) errors.push('the three.js renderer did not start');
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
  await page.evaluate(() => { for (let k = 0; k < 30 * 32; k++) App.game.update(1 / 30); }); // worker walks there, then 20 s to build
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
    return App.renderer.project(b.x, b.y, 20);
  });
  await page.mouse.click(basePos.x, basePos.y);
  await page.waitForTimeout(1500); // software WebGL is slow; give the HUD a few frames
  const buttons = await page.$$eval('#commands .cmd', (els) => els.map((e) => e.textContent.trim()));
  console.log('base buttons:', buttons);
  if (!buttons.some((b) => b.includes('Lysportal'))) errors.push('clicking the base did not select it');
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

  // Command modes: rally point, cancelling a queued unit, StarCraft controls and simple controls.
  const modes = await page.evaluate(() => {
    const g = App.game, inp = App.input, hud = App.hud;
    const out = {};
    const base = g.buildings.find((b) => b.team === 0 && b.def.isBase);
    g.teams[0].crystals = 3000;
    inp.select([base]); hud.update(0);
    hud.cmdList.find((c) => c.text && c.text.startsWith('Samlings')).fn();
    out.rallyMode = inp.mode && inp.mode.type;
    const rp = App.renderer.project(base.x + 150, base.y, 0);
    inp.click(rp.x, rp.y, false);
    out.rally = !!base.rally;
    g.cmdTrain(base, 'svevesonde'); g.cmdTrain(base, 'svevesonde');
    const before = g.teams[0].crystals;
    g.cancelTrain(base, 1);
    out.refund = g.teams[0].crystals - before;
    for (let k = 0; k < 30 * 35; k++) g.update(1 / 30);
    const portal = g.buildings.find((b) => b.type === 'portal' && b.built >= 1);
    out.portalBuilt = !!portal;
    if (!portal) return out;
    g.cmdTrain(portal, 'lysvokter'); g.cmdTrain(portal, 'lysvokter');
    for (let k = 0; k < 30 * 30; k++) g.update(1 / 30);
    const vs = g.units.filter((u) => u.type === 'lysvokter');
    const v = vs[0];
    out.trained = vs.length;
    // --- StarCraft mode ---
    inp.sc = true;
    inp.select(vs); hud.update(0);
    out.scKeys = hud.cmdList.map((c) => c.key).join('');
    // right click on the ground = plain move
    const a = App.renderer.project(v.x + 200, v.y, 0);
    inp.rightClick(a.x, a.y, false);
    out.rightMove = v.state === 'move' && !v.attackMove;
    // Shift + right click queues a second waypoint
    const b2 = App.renderer.project(v.x + 200, v.y + 150, 0);
    inp.rightClick(b2.x, b2.y, true);
    out.queued = v.orders.length;
    // Q then left click = attack-move
    inp.onKey({ code: 'KeyQ', key: 'q', preventDefault() {}, target: document.body }, true);
    out.attackMode = inp.mode && inp.mode.type;
    inp.click(a.x, a.y, false, false);
    out.attackMove = v.state === 'move' && v.attackMove;
    // H = hold position, X = stop
    inp.onKey({ code: 'KeyH', key: 'h', preventDefault() {}, target: document.body }, true);
    out.hold = v.hold && v.state === 'idle';
    inp.onKey({ code: 'KeyX', key: 'x', preventDefault() {}, target: document.body }, true);
    out.stopped = !v.hold && v.state === 'idle';
    // Ctrl+1 stores a group, 1 selects it again
    inp.onKey({ code: 'Digit1', key: '1', ctrlKey: true, preventDefault() {}, target: document.body }, true);
    inp.select([]);
    inp.onKey({ code: 'Digit1', key: '1', preventDefault() {}, target: document.body }, true);
    out.group = g.selection.length;
    // left click on empty ground only deselects in StarCraft mode
    const far = App.renderer.project(v.x + 300, v.y + 200, 0);
    inp.select(vs);
    inp.click(far.x, far.y, false, false);
    out.leftDeselects = g.selection.length === 0 && v.state === 'idle';
    // --- simple mode ---
    inp.sc = false;
    inp.select([v]); hud.update(0);
    hud.cmdList.find((c) => c.text === 'Løp hit').fn();
    out.moveMode = inp.mode && inp.mode.type;
    inp.click(a.x, a.y, false);
    out.moving = v.state === 'move' && !v.attackMove;
    inp.select([v]);
    inp.click(b2.x, b2.y, false);
    out.simpleClickAttackMoves = v.state === 'move' && v.attackMove;
    inp.sc = true;
    return out;
  });
  console.log('modes', modes);
  const okModes = modes.rallyMode === 'rally' && modes.rally && modes.refund === 50 && modes.portalBuilt && modes.trained >= 2 && modes.rightMove &&
    modes.queued === 1 && modes.attackMode === 'attack' && modes.attackMove && modes.hold && modes.stopped && modes.group === modes.trained &&
    modes.leftDeselects && modes.moveMode === 'move' && modes.moving && modes.simpleClickAttackMoves;
  if (!okModes) errors.push('command modes failed: ' + JSON.stringify(modes));

  // WASD moves the camera.
  const camBefore = await page.evaluate(() => ({ x: App.cam.x, y: App.cam.y }));
  await page.mouse.move(640, 400);
  await page.keyboard.down('d'); await page.keyboard.down('s');
  await page.waitForTimeout(1200);
  await page.keyboard.up('d'); await page.keyboard.up('s');
  const camAfter = await page.evaluate(() => ({ x: App.cam.x, y: App.cam.y }));
  console.log('camera', camBefore, '->', camAfter);
  if (!(camAfter.x > camBefore.x + 20 && camAfter.y > camBefore.y + 20)) errors.push('WASD did not move the camera');

  // Expansion, tech building, research and the heavy unit.
  const feat = await page.evaluate(() => {
    const g = App.game, out = {};
    g.teams[0].crystals = 5000;
    const home = g.buildings.find((b) => b.team === 0 && b.def.isBase);
    const spots = g.freeExpansions().sort((a, b) => dist2(a.tx, a.ty, home.tx, home.ty) - dist2(b.tx, b.ty, home.tx, home.ty));
    out.spots = spots.length;
    out.expandErr = g.cmdBuild(0, 'krystallhjerte', spots[0].tx, spots[0].ty);
    out.builderWalking = g.units.some((u) => u.team === 0 && u.state === 'build');
    out.tooFar = g.cmdBuild(0, 'portal', spots[spots.length - 1].tx, spots[spots.length - 1].ty);
    const helper = new AI(g, 0, 'middels', { attack: false });
    out.labPlaced = helper.placeBuilding('lysakademi', home);
    for (let k = 0; k < 30 * 90; k++) g.update(1 / 30);
    out.bases = g.buildings.filter((b) => b.team === 0 && b.def.isBase && b.built >= 1).length;
    const lab = g.buildings.find((b) => b.team === 0 && b.type === 'lysakademi' && b.built >= 1);
    out.lab = !!lab;
    if (!lab) return out;
    out.researchErr = g.cmdResearch(lab, 'dmg');
    out.doubleResearch = g.cmdResearch(lab, 'dmg');
    const portal = g.buildings.find((b) => b.team === 0 && b.type === 'portal');
    out.heavyErr = g.cmdTrain(portal, 'lyskjempe');
    for (let k = 0; k < 30 * 35; k++) g.update(1 / 30);
    out.dmgLevel = g.teams[0].up.dmg;
    out.heavy = g.units.some((u) => u.team === 0 && u.type === 'lyskjempe');
    return out;
  });
  console.log('features', feat);
  if (!(feat.spots > 0 && feat.expandErr === null && feat.builderWalking && feat.tooFar && feat.labPlaced && feat.bases === 2 && feat.lab &&
    feat.researchErr === null && feat.doubleResearch && feat.heavyErr === null && feat.dmgLevel === 1 && feat.heavy)) errors.push('expansion/tech failed: ' + JSON.stringify(feat));
  await page.evaluate(() => { const g = App.game; const h = g.units.find((u) => u.type === 'lyskjempe'); if (h) { App.input.select([h]); App.input.centerOn(h.x, h.y); } });
  await page.waitForTimeout(1500);
  if (shots) await page.screenshot({ path: shots + '/heavy.png' });

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
  server.close();
  if (errors.length) { console.error('ERRORS:\n' + errors.join('\n')); process.exit(1); }
  console.log('OK: no errors');
})().catch((e) => { console.error(e); process.exit(1); });
