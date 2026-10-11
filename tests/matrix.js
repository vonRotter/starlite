// Faction balance: AI vs AI ("middels" both sides) for every pairing, several seeds.
// Usage: node tests/matrix.js [games per pairing]
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright')); }
(async () => {
  const n = parseInt(process.argv[2] || '6', 10);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '..', 'index.html'));
  await page.waitForFunction(() => typeof App !== 'undefined' && App.game, null, { timeout: 60000 });
  const res = await page.evaluate((n) => {
    App.startGame = () => {}; // keep the menu demo from interfering
    const facs = ['stjerne', 'summ', 'krystall', 'graa'];
    const rows = [];
    for (const a of facs) for (const b of facs) {
      if (a >= b) continue;
      let wa = 0, wb = 0, draw = 0, tsum = 0;
      for (let k = 0; k < n; k++) {
        // Swap sides every other game so start position does not matter.
        const [x, y] = k % 2 ? [b, a] : [a, b];
        const cfg = skirmishConfig({ faction: x, color: 'orange', enemy: y, enemyColor: 'blue', difficulty: 'middels', theme: 'eng', seed: 1000 + k });
        cfg.teams[0].ai = 'middels'; cfg.teams[0].isPlayer = false;
        const g = new Game(cfg);
        while (!g.over && g.time < 1500) g.update(1 / 30);
        tsum += g.time;
        const w = g.result && g.result.winner;
        if (!g.over || w == null || w < 0) draw++;
        else if ((w === 0) === (x === a)) wa++; else wb++;
      }
      rows.push({ a, b, winsA: wa, winsB: wb, draws: draw, avgTime: Math.round(tsum / n) });
    }
    return rows;
  }, n);
  console.table(res);
  await browser.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
