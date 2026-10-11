'use strict';
// The campaign story and the game setups for campaign, free play and the
// menu background demo.

const CHARS = {
  stella: { name: 'Kaptein Stella', color: '#ff8a00' },
  bolt: { name: 'Bolt', color: '#5d8fcf' },
  summa: { name: 'Dronning Summa', color: '#ff3da5' },
  lumi: { name: 'Vokter Lumi', color: '#00a99b' },
  skodda: { name: 'Gråskodda', color: '#6b707a' },
  regnbue: { name: 'Regnbueskya', color: '#9b4dff' },
  forteller: { name: 'Fortelleren', color: '#5d22b5' },
};

const PROLOGUE = [
  { who: 'forteller', text: 'Langt, langt ute i verdensrommet ligger den fargerike planeten Glimra.' },
  { who: 'forteller', text: 'Der vokser glitrende krystaller, og alle som bor der, elsker farger.' },
  { who: 'skodda', text: 'Men en dag kom en stor, grå sky drivende. Det var Gråskodda!' },
  { who: 'forteller', text: 'Overalt hvor Gråskodda kom, forsvant fargene. Og alle ble sure og grinete.' },
  { who: 'stella', text: 'Nå er det opp til oss! Vi skal male verden fargerik igjen!' },
];

// Helper: a wave of Gråskodda units that walks towards the player's base.
function spawnWave(g, team, list, from) {
  const target = g.buildings.find((b) => b.team === g.player && b.def.isBase) || g.buildings.find((b) => b.team === g.player);
  if (!target) return;
  const units = [];
  list.forEach((type, i) => {
    const y = clamp(from.y + (i % 5 - 2) * 30, 40, g.map.pxH - 40);
    const x = from.x - Math.floor(i / 5) * 30;
    let px = x, py = y;
    if (!UNITS[type].air && !g.map.walkablePx(px, py)) {
      const nw = g.map.nearestWalkable(Math.floor(px / TILE), Math.floor(py / TILE), 10);
      if (!nw) return;
      px = (nw[0] + 0.5) * TILE; py = (nw[1] + 0.5) * TILE;
    }
    units.push(g.spawnUnit(team, type, px, py));
  });
  g.cmdMove(units, target.x, target.y, true);
}

const MISSIONS = [
  {
    id: 1,
    title: 'Landingen',
    subtitle: 'Lær å bygge og male',
    faction: 'stjerne',
    briefing: [
      { who: 'stella', text: 'Hei! Jeg er Kaptein Stella. Velkommen til planeten Glimra!' },
      { who: 'bolt', text: 'Bip bop! Jeg er Bolt, roboten. Se på de skinnende krystallene! Byggebotene våre samler dem.' },
      { who: 'stella', text: 'Med krystaller kan vi bygge hus og lage malersoldater. Malingen gjør grå ting fargerike igjen!' },
      { who: 'bolt', text: 'Der borte er en grå Støvdott-leir. Vi må male den fargerik. Bip!' },
      { who: 'stella', text: 'Først bygger vi en Kaserne. Følg tipsene øverst på skjermen.' },
    ],
    outro: [
      { who: 'stella', text: 'Hurra! Se så fint det ble med farger!' },
      { who: 'bolt', text: 'Bip... Men hva er det som summer inne i skogen? Det høres litt surt ut.' },
      { who: 'stella', text: 'Det må vi finne ut av. Kom igjen!' },
    ],
    setup() {
      const w = 44, h = 32;
      return {
        map: { w, h, seed: 101, theme: 'eng', bases: [{ tx: 4, ty: 13 }, { tx: 35, ty: 13 }], density: 0.06 },
        teams: [
          { faction: 'stjerne', color: 'orange', isPlayer: true, start: { tx: 4, ty: 13 }, crystals: 200 },
          { faction: 'graa', color: 'grey', name: 'Støvdott-leiren' },
        ],
        objectives: [
          { type: 'build', what: 'kaserne', text: 'Bygg en Kaserne', hint: 'Klikk på Stjernestasjonen eller en byggebot. Trykk på Kaserne-knappen nede til høyre. Klikk så på bakken der den skal stå.' },
          { type: 'train', what: 'malersoldat', count: 4, text: 'Lag 4 malersoldater', hint: 'Klikk på Kasernen og trykk på Malersoldat-knappen fire ganger.' },
          { type: 'destroyAll', text: 'Mal over Støvdott-leiren', hint: 'Trykk på «Alle soldater». Klikk så på den grå fabrikken langt til høyre.' },
        ],
        onStart(g) {
          const camp = g.spawnBuildingNear(1, 'taakefabrikk', 36, 14);
          camp.hp = camp.maxHp = 450;
          for (let i = 0; i < 3; i++) g.spawnUnit(1, 'stovdott', camp.x - 70, camp.y - 30 + i * 30);
        },
      };
    },
  },
  {
    id: 2,
    title: 'Summing i skogen',
    subtitle: 'Hjelp Summerne',
    faction: 'stjerne',
    briefing: [
      { who: 'stella', text: 'Hør! Det summer inne i skogen.' },
      { who: 'bolt', text: 'Det er Summerne! Men de er helt grå. Og se på de sinte øyenbrynene! Bip!' },
      { who: 'stella', text: 'Gråskodda har gjort dem grinete. Hvis vi maler basen deres fargerik igjen, blir de glade.' },
      { who: 'bolt', text: 'Tips: Rullebiler maler veien. På din egen farge går alle fortere!' },
    ],
    outro: [
      { who: 'summa', text: 'Summ summ ... Å! Hvor er jeg? Alt var så grått og trist.' },
      { who: 'stella', text: 'Gråskodda fanget deg. Men nå er du deg selv igjen!' },
      { who: 'summa', text: 'Tusen takk! Jeg er Dronning Summa. Gråskodda fløy videre til Krystallgrotta. Summerne vil hjelpe!' },
    ],
    setup() {
      const w = 54, h = 40;
      return {
        map: { w, h, seed: 202, theme: 'skog', bases: [{ tx: 4, ty: 4 }, { tx: w - 8, ty: h - 8 }] },
        teams: [
          { faction: 'stjerne', color: 'orange', isPlayer: true, start: { tx: 4, ty: 4 }, crystals: 150 },
          { faction: 'summ', color: 'grey', gloom: true, name: 'Grå Summere', start: { tx: w - 8, ty: h - 8 }, ai: 'lett' },
        ],
        aiOpts: { 1: { firstAttack: 210, wave: 4 } },
        objectives: [{ type: 'destroyAll', text: 'Mal over hele Summ-basen', hint: 'Bygg et Verksted for å lage rullebiler og ballongflyere.' }],
      };
    },
  },
  {
    id: 3,
    title: 'Krystallgrotta',
    subtitle: 'Nå styrer du Summerne',
    faction: 'summ',
    briefing: [
      { who: 'summa', text: 'Summ summ! Nå er det vår tur. Du skal styre Summerne!' },
      { who: 'summa', text: 'Sprettbillene er superraske. Spyttsneglene spytter maling langt. Og vi blir friske av oss selv.' },
      { who: 'summa', text: 'Jeg har allerede klekket fire sprettbiller til deg. Lykke til!' },
      { who: 'bolt', text: 'Krystallvokterne her er blitt grå. De har skjold som lader seg opp igjen. Angrip mange samtidig! Bip!' },
    ],
    outro: [
      { who: 'lumi', text: 'Lyset ... det kommer tilbake. Takk, små venner.' },
      { who: 'summa', text: 'Summ! Du er visst ikke grå lenger!' },
      { who: 'lumi', text: 'Jeg er Vokter Lumi. Gråskodda er på vei hit med en stor hær av støvdotter. Vi må holde ut til krystallene lyser fullt!' },
    ],
    setup() {
      const w = 54, h = 40;
      return {
        map: { w, h, seed: 303, theme: 'grotte', bases: [{ tx: 4, ty: h - 8 }, { tx: w - 8, ty: 4 }] },
        teams: [
          { faction: 'summ', color: 'pink', isPlayer: true, start: { tx: 4, ty: h - 8 }, crystals: 200 },
          { faction: 'krystall', color: 'grey', gloom: true, name: 'Grå Krystallvoktere', start: { tx: w - 8, ty: 4 }, ai: 'supersnill' },
        ],
        aiOpts: { 1: { firstAttack: 240, wave: 3 } },
        objectives: [{ type: 'destroyAll', text: 'Mal over Krystallvokternes base', hint: 'Bygg et Vingereir for å lage flyvende vingesummer.' }],
        onStart(g) {
          g.spawnBuildingNear(1, 'lystarn', w - 14, 9);
          const k = g.spawnBuildingNear(0, 'klekkeri', 10, h - 12);
          if (k) for (let i = 0; i < 4; i++) g.spawnFrom(k, 'sprettbille', true);
        },
      };
    },
  },
  {
    id: 4,
    title: 'Hold lyset',
    subtitle: 'Forsvar Krystallhjertet',
    faction: 'krystall',
    briefing: [
      { who: 'lumi', text: 'Nå styrer du Krystallvokterne. Krystallhjertet vårt må lade seg opp.' },
      { who: 'lumi', text: 'Når det har ladet i fire minutter, blir lyset så sterkt at Gråskodda må flykte.' },
      { who: 'skodda', text: 'Grrr! Jeg kommer og gjør alt grått! Støvdotter, angrip!' },
      { who: 'bolt', text: 'Bygg Lystårn rundt basen og lag mange voktere. Ikke la Krystallhjertet bli malt over! Bip bop!' },
    ],
    outro: [
      { who: 'skodda', text: 'Grrr! For mye lys! Jeg drar hjem til Skyslottet mitt!' },
      { who: 'lumi', text: 'Den flyktet! Men den kommer tilbake hvis vi ikke gjør noe.' },
      { who: 'stella', text: 'Da drar vi til Skyslottet. Alle sammen!' },
    ],
    setup() {
      const w = 50, h = 36;
      const waves = [
        [40, ['stovdott', 'stovdott', 'stovdott']],
        [75, ['stovdott', 'stovdott', 'stovdott', 'graabot']],
        [110, ['stovdott', 'stovdott', 'stovdott', 'stovdott', 'graabot', 'graabot']],
        [145, ['stovdott', 'stovdott', 'graabot', 'graabot', 'taakesky']],
        [180, ['stovdott', 'stovdott', 'stovdott', 'stovdott', 'graabot', 'graabot', 'taakesky']],
        [210, ['stovdott', 'stovdott', 'stovdott', 'graabot', 'graabot', 'graabot', 'taakesky', 'taakesky']],
      ];
      return {
        map: { w, h, seed: 404, theme: 'strand', bases: [{ tx: 6, ty: 16 }, { tx: w - 6, ty: 16 }], density: 0.07 },
        teams: [
          { faction: 'krystall', color: 'teal', isPlayer: true, start: { tx: 6, ty: 16 }, crystals: 300 },
          { faction: 'graa', color: 'grey', name: 'Gråskoddas hær', noDefeat: true },
        ],
        protect: 'krystallhjerte',
        objectives: [{ type: 'survive', time: 240, text: 'Hold ut til Krystallhjertet er fulladet', hint: 'Ikke la Krystallhjertet bli malt over. Bygg Lystårn!' }],
        onStart(g) {
          g.spawnBuildingNear(0, 'portal', 12, 12);
          g.spawnUnit(0, 'lysvokter', 15 * TILE, 21 * TILE);
          g.spawnUnit(0, 'lysvokter', 15 * TILE, 22 * TILE);
          g.waveIdx = 0;
        },
        script(g) {
          if (g.waveIdx < waves.length && g.time >= waves[g.waveIdx][0]) {
            spawnWave(g, 1, waves[g.waveIdx][1], { x: g.map.pxW - 50, y: g.map.pxH / 2 });
            g.msg(g.waveIdx === waves.length - 1 ? 'Den siste bølgen kommer! Hold ut!' : 'Støvdottene kommer!', 'alert');
            g.waveIdx++;
          }
          if (!g.saidHalf && g.time >= 120) { g.saidHalf = true; g.msg('Krystallhjertet er halvveis oppladet!', 'good'); }
        },
      };
    },
  },
  {
    id: 5,
    title: 'Skyslottet',
    subtitle: 'Det store fargeslaget',
    faction: 'stjerne',
    briefing: [
      { who: 'stella', text: 'Dette er det store slaget! Vi er framme ved Skyslottet.' },
      { who: 'summa', text: 'Summ summ! Summerne kjemper sammen med dere. Vi angriper fra toppen av kartet!' },
      { who: 'lumi', text: 'Skyslottet er sterkt. Lag mange soldater og angrip sammen.' },
      { who: 'bolt', text: 'Bip bop! Når Skyslottet blir fargerikt, er Gråskodda ikke grå lenger!' },
    ],
    outro: [
      { who: 'skodda', text: 'Å nei ... jeg er helt full av farger ...' },
      { who: 'skodda', text: '... Hm. Egentlig ... føles det ganske fint.' },
      { who: 'stella', text: 'Hvorfor gjorde du alt grått, Gråskodda?' },
      { who: 'skodda', text: 'Jeg var så alene der oppe. Ingen ville leke med en grå sky. Så jeg ville at alle skulle være like grå som meg.' },
      { who: 'lumi', text: 'Du trenger ikke være grå for å være venn med oss.' },
      { who: 'summa', text: 'Summ! Du kan være med på fargefesten!' },
      { who: 'regnbue', text: 'Fargefest? Ja takk! Fra nå av heter jeg Regnbueskya!' },
      { who: 'forteller', text: 'Og slik ble Glimra fargerik igjen. Stjernevennene, Summerne, Krystallvokterne og Regnbueskya ble de beste vennene i hele galaksen.' },
      { who: 'forteller', text: 'SLUTT. Takk for at du spilte!' },
    ],
    setup() {
      const w = 62, h = 46;
      return {
        map: { w, h, seed: 505, theme: 'sky', bases: [{ tx: 4, ty: h - 8 }, { tx: 4, ty: 4 }, { tx: w - 9, ty: Math.floor(h / 2) - 2 }] },
        teams: [
          { faction: 'stjerne', color: 'orange', isPlayer: true, start: { tx: 4, ty: h - 8 }, crystals: 200, allies: [1] },
          { faction: 'summ', color: 'pink', name: 'Summerne', start: { tx: 4, ty: 4 }, ai: 'lett', allies: [0] },
          { faction: 'graa', color: 'grey', name: 'Gråskodda', start: { tx: w - 9, ty: Math.floor(h / 2) - 2 }, ai: 'middels' },
        ],
        aiOpts: { 1: { targetTeam: 2, firstAttack: 200, wave: 6 }, 2: { firstAttack: 200, wave: 5 } },
        objectives: [{ type: 'destroyAll', text: 'Mal Skyslottet fargerikt', hint: 'Lag mange soldater, og angrip sammen med Summerne.' }],
        onStart(g) {
          const cx = w - 9, cy = Math.floor(h / 2) - 2;
          g.spawnBuildingNear(2, 'graataarn', cx - 5, cy - 4);
          g.spawnBuildingNear(2, 'graataarn', cx - 5, cy + 6);
          g.spawnBuildingNear(2, 'taakefabrikk', cx - 1, cy - 8);
          g.spawnBuildingNear(2, 'skyverksted', cx - 1, cy + 7);
        },
      };
    },
  },
];

// ---------- free play ----------
const MAP_CHOICES = ['eng', 'skog', 'grotte', 'sky', 'strand'];

// o = { faction, color, enemy, enemyColor, helper (faction|null), helperColor, difficulty, theme, seed, speed }
function skirmishConfig(o) {
  const three = !!o.helper;
  const w = three ? 62 : 56, h = three ? 46 : 42;
  const starts = skirmishStarts(w, h, three ? 3 : 2);
  const teams = [
    { faction: o.faction, color: o.color, isPlayer: true, start: starts[0], crystals: 100, allies: three ? [2] : [] },
    { faction: o.enemy, color: o.enemyColor, start: starts[1], ai: o.difficulty },
  ];
  if (three) teams.push({ faction: o.helper, color: o.helperColor, start: starts[2], ai: o.difficulty === 'fredelig' ? 'fredelig' : 'lett', allies: [0] });
  return {
    map: {
      w, h, seed: o.seed, theme: o.theme, bases: starts,
      fields: [{ tx: Math.floor(w / 2) - 1, ty: Math.floor(h / 2) - 1 }, { tx: Math.floor(w * 0.25), ty: Math.floor(h * 0.72) }, { tx: Math.floor(w * 0.72), ty: Math.floor(h * 0.25) }],
    },
    teams,
    aiOpts: three ? { 2: { targetTeam: 1 } } : {},
    objectives: [{ type: 'destroyAll', text: 'Mal over alle fiendens bygninger' }],
    speed: o.speed,
  };
}

// AI against AI, used behind the main menu.
function demoConfig(seed) {
  const rng = makeRng(seed);
  const facs = ['stjerne', 'summ', 'krystall', 'graa'];
  const a = facs[Math.floor(rng() * 4)];
  let b = facs[Math.floor(rng() * 4)];
  if (b === a) b = facs[(facs.indexOf(a) + 1) % 4];
  const w = 40, h = 28;
  const starts = [{ tx: 4, ty: 4 }, { tx: w - 8, ty: h - 8 }];
  const cols = ['orange', 'blue', 'pink', 'green', 'purple', 'teal'];
  const ca = cols[Math.floor(rng() * cols.length)];
  let cb = cols[Math.floor(rng() * cols.length)];
  if (cb === ca) cb = cols[(cols.indexOf(ca) + 2) % cols.length];
  return {
    map: { w, h, seed, theme: MAP_CHOICES[Math.floor(rng() * MAP_CHOICES.length)], bases: starts },
    teams: [
      { faction: a, color: ca, start: starts[0], ai: 'middels', crystals: 400 },
      { faction: b, color: cb, start: starts[1], ai: 'middels', crystals: 400 },
    ],
    aiOpts: { 0: { firstAttack: 60, wave: 4 }, 1: { firstAttack: 60, wave: 4 } },
  };
}
