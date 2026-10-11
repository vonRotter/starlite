// Balance check: lets a "middels" AI play the player's side in every
// campaign mission and reports whether it wins and how long it takes.
// Usage: node tests/campaign.js [comma separated mission numbers]
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }

const only = process.argv[2] ? process.argv[2].split(',').map(Number) : null;
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + '\n' + e.stack));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof App !== 'undefined' && App.game, null, { timeout: 60000 });
  for (const level of ['lett', 'middels']) {
    const res = await page.evaluate(([level, process_only]) => {
      const out = [];
      for (let i = 0; i < MISSIONS.length; i++) {
        if (process_only && !process_only.includes(i + 1)) continue;
        for (let run = 0; run < 3; run++) {
          const cfg = MISSIONS[i].setup();
          const g = new Game(cfg);
          // Mission 4 is about defending, so the stand-in player does not attack.
          g.teams[0].ai = new AI(g, 0, level, { attack: i !== 3 });
          // Let the tutorial's build/train objectives be fulfilled by the AI build plan.
          while (!g.over && g.time < 1500) g.update(1 / 30);
          out.push({ level, mission: i + 1, run, result: g.result, time: Math.round(g.time), lost: g.teams[0].lost, killed: g.teams[0].killed,
            paint: Math.round(g.paint.coverage(0) * 100) });
        }
      }
      return out;
    }, [level, only]);
    console.table(res);
  }
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
