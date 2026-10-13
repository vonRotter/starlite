'use strict';
// Game data: team colours, factions, units and buildings. All player-facing
// text is Norwegian (bokmål), written for children aged 6-9.

const COLORS = {
  orange: { name: 'Oransje', main: '#ff8a00', dark: '#c45200', light: '#ffc46b' },
  blue:   { name: 'Blå',     main: '#2f6bff', dark: '#1b3fae', light: '#93b3ff' },
  pink:   { name: 'Rosa',    main: '#ff3da5', dark: '#b3126c', light: '#ffa3d4' },
  green:  { name: 'Grønn',   main: '#4fd11a', dark: '#2f8a08', light: '#b0f07a' },
  purple: { name: 'Lilla',   main: '#9b4dff', dark: '#5d22b5', light: '#d0abff' },
  teal:   { name: 'Turkis',  main: '#00c4b4', dark: '#00847a', light: '#80efe4' },
  yellow: { name: 'Gul',     main: '#ffcf0a', dark: '#b88f00', light: '#ffe980' },
  grey:   { name: 'Grå',     main: '#8f939d', dark: '#585c66', light: '#c8cbd2' },
};
const PLAYER_COLORS = ['orange', 'blue', 'pink', 'green', 'purple', 'teal', 'yellow'];

const FACTIONS = {
  stjerne: {
    id: 'stjerne', name: 'Stjernevennene', playable: true, defaultColor: 'orange',
    desc: 'Modige romfarere med malingsblastere.',
    trait: 'Bygningene reparerer seg selv.',
    base: 'stjernestasjon', worker: 'byggebot',
    builds: ['kaserne', 'verksted', 'vakttarn', 'stjernestasjon', 'fargelab'],
    leader: 'stella',
  },
  summ: {
    id: 'summ', name: 'Summerne', playable: true, defaultColor: 'pink',
    desc: 'Raske, summende småkryp som er mange sammen.',
    trait: 'Blir friske av seg selv.',
    base: 'bikube', worker: 'sankelarve',
    builds: ['klekkeri', 'vingereir', 'piggsopp', 'bikube', 'kongekammer'],
    leader: 'summa',
  },
  krystall: {
    id: 'krystall', name: 'Krystallvokterne', playable: true, defaultColor: 'teal',
    desc: 'Sterke, glitrende vesener laget av lys.',
    trait: 'Skjoldene lader seg opp igjen.',
    base: 'krystallhjerte', worker: 'svevesonde',
    builds: ['portal', 'stjerneport', 'lystarn', 'krystallhjerte', 'lysakademi'],
    leader: 'lumi',
  },
  graa: {
    id: 'graa', name: 'Gråskodda', playable: false, defaultColor: 'grey',
    desc: 'En grinete, grå sky og hjelperne hennes.',
    trait: 'Grå og grinete.',
    base: 'skyslottet', worker: 'stovsuger',
    builds: ['taakefabrikk', 'skyverksted', 'graataarn', 'skyslottet', 'taakelab'],
    leader: 'skodda',
  },
};

// Unit fields:
//  hp, shield, speed (px/s), radius (px), cost, time (s), sight (px)
//  dmg, cd (cooldown s), range (px, edge to edge), hitsAir, hitsGround (default true)
//  attack: 'blob' (paint projectile), 'melee', 'beam'; splash (px)
//  requires: building type that must be finished before this can be made
const UNITS = {
  // --- Stjernevennene ---
  byggebot: {
    faction: 'stjerne', name: 'Byggebot', worker: true,
    desc: 'Samler krystaller.', cost: 50, time: 9,
    hp: 45, speed: 78, radius: 11, sight: 200,
  },
  malersoldat: {
    faction: 'stjerne', name: 'Malersoldat',
    desc: 'Skyter malingsklatter. Kan treffe flyvere.', cost: 50, time: 11,
    hp: 54, speed: 68, radius: 11, sight: 240,
    dmg: 7, cd: 0.66, range: 120, hitsAir: true, attack: 'blob', projSpeed: 380,
  },
  rullebil: {
    faction: 'stjerne', name: 'Rullebil',
    desc: 'Maler veien og skyter store malingsballonger.', cost: 150, time: 16,
    hp: 185, speed: 52, radius: 17, sight: 280,
    dmg: 20, cd: 1.8, range: 190, hitsAir: false, attack: 'blob', splash: 40, projSpeed: 260, painter: true,
  },
  ballongflyer: {
    faction: 'stjerne', name: 'Ballongflyer', air: true,
    desc: 'Flyr over alt. Skyter både opp og ned.', cost: 125, time: 15,
    hp: 110, speed: 82, radius: 16, sight: 260,
    dmg: 9, cd: 0.9, range: 130, hitsAir: true, attack: 'blob', projSpeed: 340,
  },
  malerrobot: {
    faction: 'stjerne', name: 'Malerrobot', heavy: true, requires: 'fargelab',
    desc: 'Kjempestor robot med to malingskanoner. Treffer alt.', cost: 300, time: 28,
    hp: 430, speed: 44, radius: 19, sight: 290,
    dmg: 15, cd: 1.1, range: 160, hitsAir: true, attack: 'blob', splash: 30, projSpeed: 330,
  },
  // --- Summerne ---
  sankelarve: {
    faction: 'summ', name: 'Sankelarve', worker: true,
    desc: 'Samler krystaller.', cost: 50, time: 9,
    hp: 45, speed: 78, radius: 11, sight: 200,
  },
  sprettbille: {
    faction: 'summ', name: 'Sprettbille',
    desc: 'Billig og superrask. Kjemper på nært hold.', cost: 30, time: 5,
    hp: 42, speed: 100, radius: 9, sight: 220,
    dmg: 5, cd: 0.5, range: 8, hitsAir: false, attack: 'melee',
  },
  spyttsnegl: {
    faction: 'summ', name: 'Spyttsnegl',
    desc: 'Spytter maling langt. Kan treffe flyvere.', cost: 80, time: 10,
    hp: 90, speed: 58, radius: 13, sight: 250,
    dmg: 9, cd: 0.8, range: 140, hitsAir: true, attack: 'blob', projSpeed: 330,
  },
  vingesumm: {
    faction: 'summ', name: 'Vingesumm', air: true,
    desc: 'Rask flyver. Skyter både opp og ned.', cost: 110, time: 12,
    hp: 95, speed: 110, radius: 14, sight: 250,
    dmg: 8, cd: 0.8, range: 110, hitsAir: true, attack: 'blob', projSpeed: 360,
  },
  kjempebille: {
    faction: 'summ', name: 'Kjempebille', heavy: true, requires: 'kongekammer',
    desc: 'Diger bille med store horn. Slår mange på en gang.', cost: 275, time: 26,
    hp: 480, speed: 72, radius: 19, sight: 250,
    dmg: 22, cd: 1.1, range: 10, hitsAir: false, attack: 'melee', splash: 32,
  },
  // --- Krystallvokterne ---
  svevesonde: {
    faction: 'krystall', name: 'Svevesonde', worker: true,
    desc: 'Samler krystaller.', cost: 50, time: 9,
    hp: 25, shield: 20, speed: 78, radius: 11, sight: 200,
  },
  lysvokter: {
    faction: 'krystall', name: 'Lysvokter',
    desc: 'Sterk kriger med lyssverd. Kjemper på nært hold.', cost: 90, time: 13,
    hp: 80, shield: 60, speed: 72, radius: 12, sight: 230,
    dmg: 15, cd: 1.0, range: 8, hitsAir: false, attack: 'melee',
  },
  glimtskytter: {
    faction: 'krystall', name: 'Glimtskytter',
    desc: 'Skyter langt. Kan treffe flyvere.', cost: 115, time: 14,
    hp: 80, shield: 60, speed: 70, radius: 14, sight: 270,
    dmg: 13, cd: 1.1, range: 170, hitsAir: true, attack: 'blob', projSpeed: 420,
  },
  stjerneseiler: {
    faction: 'krystall', name: 'Stjerneseiler', air: true,
    desc: 'Stort lysskip med fargestråle.', cost: 200, time: 20,
    hp: 120, shield: 100, speed: 62, radius: 18, sight: 260,
    dmg: 5, cd: 0.33, range: 140, hitsAir: true, attack: 'beam',
  },
  lyskjempe: {
    faction: 'krystall', name: 'Lyskjempe', heavy: true, requires: 'lysakademi',
    desc: 'Svevende kjempe av rent lys. Treffer alt rundt seg.', cost: 275, time: 26,
    hp: 160, shield: 300, speed: 60, radius: 19, sight: 260,
    dmg: 18, cd: 1.1, range: 110, hitsAir: true, attack: 'blob', splash: 30, projSpeed: 480,
  },
  // --- Gråskodda ---
  stovsuger: {
    faction: 'graa', name: 'Støvsuger', worker: true,
    desc: 'Suger opp krystaller.', cost: 50, time: 9,
    hp: 45, speed: 78, radius: 11, sight: 200,
  },
  stovdott: {
    faction: 'graa', name: 'Støvdott',
    desc: 'Liten, lodden og grinete.', cost: 35, time: 6,
    hp: 52, speed: 90, radius: 10, sight: 220,
    dmg: 7, cd: 0.6, range: 8, hitsAir: false, attack: 'melee',
  },
  graabot: {
    faction: 'graa', name: 'Gråbot',
    desc: 'Klumpete robot med grå maling.', cost: 90, time: 11,
    hp: 115, speed: 55, radius: 14, sight: 250,
    dmg: 9, cd: 0.8, range: 140, hitsAir: true, attack: 'blob', projSpeed: 330,
  },
  taakesky: {
    faction: 'graa', name: 'Tåkesky', air: true,
    desc: 'Sur sky som drypper grått regn.', cost: 120, time: 15,
    hp: 110, speed: 70, radius: 16, sight: 240,
    dmg: 10, cd: 1.0, range: 120, hitsAir: true, attack: 'blob', splash: 22, projSpeed: 300,
  },
  tordensky: {
    faction: 'graa', name: 'Tordensky', air: true, heavy: true, requires: 'taakelab',
    desc: 'Svær, sint tordensky som slipper store grå bomber.', cost: 300, time: 28,
    hp: 330, speed: 48, radius: 22, sight: 260,
    dmg: 22, cd: 1.6, range: 120, hitsAir: false, attack: 'blob', splash: 38, projSpeed: 260,
  },
};

// Building fields: size (tiles, square), hp, shield, cost, time, trains[], isBase,
// tower attack fields like units (dmg, cd, range, hitsAir), requires, research[].
const BUILDINGS = {
  // --- Stjernevennene ---
  stjernestasjon: {
    faction: 'stjerne', name: 'Stjernestasjon', isBase: true,
    desc: 'Hovedbasen. Lager byggeboter og tar imot krystaller.',
    size: 4, hp: 1500, cost: 400, time: 50, trains: ['byggebot'],
  },
  kaserne: {
    faction: 'stjerne', name: 'Kaserne',
    desc: 'Her trener malersoldatene.', size: 3, hp: 800, cost: 150, time: 20, trains: ['malersoldat'],
  },
  verksted: {
    faction: 'stjerne', name: 'Verksted',
    desc: 'Bygger rullebiler, ballongflyere og malerroboter.', size: 3, hp: 900, cost: 200, time: 24, trains: ['rullebil', 'ballongflyer', 'malerrobot'],
  },
  vakttarn: {
    faction: 'stjerne', name: 'Vakttårn',
    desc: 'Passer på basen og skyter maling.', size: 2, hp: 420, cost: 100, time: 15,
    dmg: 10, cd: 0.9, range: 200, hitsAir: true, attack: 'blob', projSpeed: 400,
  },
  fargelab: {
    faction: 'stjerne', name: 'Fargelab', requires: 'kaserne', research: ['dmg', 'armor'],
    desc: 'Forsker fram sterkere maling og drakter. Gir Malerrobot.', size: 3, hp: 750, cost: 150, time: 25,
  },
  // --- Summerne ---
  bikube: {
    faction: 'summ', name: 'Bikube', isBase: true,
    desc: 'Hjemmet til Summerne. Lager sankelarver.',
    size: 4, hp: 1500, cost: 400, time: 50, trains: ['sankelarve'],
  },
  klekkeri: {
    faction: 'summ', name: 'Klekkeri',
    desc: 'Klekker sprettbiller, spyttsnegler og kjempebiller.', size: 3, hp: 750, cost: 150, time: 20, trains: ['sprettbille', 'spyttsnegl', 'kjempebille'],
  },
  vingereir: {
    faction: 'summ', name: 'Vingereir',
    desc: 'Klekker vingesummer.', size: 3, hp: 800, cost: 200, time: 24, trains: ['vingesumm'],
  },
  piggsopp: {
    faction: 'summ', name: 'Piggsopp',
    desc: 'Sopp som skyter malingssporer.', size: 2, hp: 450, cost: 100, time: 15,
    dmg: 11, cd: 1.0, range: 190, hitsAir: true, attack: 'blob', projSpeed: 360,
  },
  kongekammer: {
    faction: 'summ', name: 'Kongekammer', requires: 'klekkeri', research: ['dmg', 'armor'],
    desc: 'Dronningens kammer. Gir hardere skall og Kjempebille.', size: 3, hp: 750, cost: 150, time: 25,
  },
  // --- Krystallvokterne ---
  krystallhjerte: {
    faction: 'krystall', name: 'Krystallhjerte', isBase: true,
    desc: 'Det lysende hjertet. Lager svevesonder.',
    size: 4, hp: 1000, shield: 500, cost: 400, time: 50, trains: ['svevesonde'],
  },
  portal: {
    faction: 'krystall', name: 'Lysportal',
    desc: 'Henter lysvoktere, glimtskyttere og lyskjemper.', size: 3, hp: 500, shield: 300, cost: 150, time: 20, trains: ['lysvokter', 'glimtskytter', 'lyskjempe'],
  },
  stjerneport: {
    faction: 'krystall', name: 'Stjerneport',
    desc: 'Henter stjerneseilere.', size: 3, hp: 600, shield: 300, cost: 200, time: 24, trains: ['stjerneseiler'],
  },
  lystarn: {
    faction: 'krystall', name: 'Lystårn',
    desc: 'Tårn som skyter lyskuler.', size: 2, hp: 260, shield: 200, cost: 100, time: 15,
    dmg: 12, cd: 0.9, range: 200, hitsAir: true, attack: 'blob', projSpeed: 420,
  },
  lysakademi: {
    faction: 'krystall', name: 'Lysakademi', requires: 'portal', research: ['dmg', 'armor'],
    desc: 'Her lærer vokterne å lyse sterkere. Gir Lyskjempe.', size: 3, hp: 450, shield: 300, cost: 150, time: 25,
  },
  // --- Gråskodda ---
  skyslottet: {
    faction: 'graa', name: 'Skyslottet', isBase: true,
    desc: 'Gråskoddas slott av skyer.',
    size: 4, hp: 1800, cost: 400, time: 50, trains: ['stovsuger'],
  },
  taakefabrikk: {
    faction: 'graa', name: 'Tåkefabrikk',
    desc: 'Lager støvdotter og gråboter.', size: 3, hp: 850, cost: 150, time: 20, trains: ['stovdott', 'graabot'],
  },
  skyverksted: {
    faction: 'graa', name: 'Skyverksted',
    desc: 'Lager tåkeskyer og tordenskyer.', size: 3, hp: 850, cost: 200, time: 24, trains: ['taakesky', 'tordensky'],
  },
  graataarn: {
    faction: 'graa', name: 'Grått tårn',
    desc: 'Et surt tårn som skyter grå maling.', size: 2, hp: 450, cost: 100, time: 15,
    dmg: 10, cd: 0.9, range: 200, hitsAir: true, attack: 'blob', projSpeed: 380,
  },
  taakelab: {
    faction: 'graa', name: 'Tåkelab', requires: 'taakefabrikk', research: ['dmg', 'armor'],
    desc: 'Et boblende laboratorium. Gir Tordensky.', size: 3, hp: 800, cost: 150, time: 25,
  },
};

// Research in the tech buildings. Three levels each; the cost and time are per level.
const UPGRADES = {
  dmg: {
    name: { stjerne: 'Sterkere maling', summ: 'Skarpere spytt', krystall: 'Klarere lys', graa: 'Gråere maling' },
    desc: 'Alle enhetene dine treffer hardere.', cost: [100, 175, 250], time: [30, 40, 50],
  },
  armor: {
    name: { stjerne: 'Tykkere drakter', summ: 'Hardere skall', krystall: 'Sterkere krystaller', graa: 'Tettere støv' },
    desc: 'Alle enhetene dine tåler mer.', cost: [100, 175, 250], time: [30, 40, 50],
  },
};
const UPGRADE_MAX = 3;
const UPGRADE_DMG = 0.12;   // +12 % damage per level
const UPGRADE_ARMOR = 0.08; // -8 % damage taken per level

for (const [k, d] of Object.entries(UNITS)) { d.key = k; d.kind = 'unit'; }
for (const [k, d] of Object.entries(BUILDINGS)) { d.key = k; d.kind = 'building'; }

const DIFFICULTIES = {
  fredelig:  { name: 'Fredelig',  desc: 'Datamaskinen angriper aldri. Bare lek og bygg!', income: 0.6, firstAttack: Infinity, wave: 4, waveGrow: 0, workers: 6, think: 2.0 },
  supersnill:{ name: 'Supersnill', desc: 'Små og sjeldne angrep.', income: 0.6, firstAttack: 330, wave: 3, waveGrow: 1, workers: 6, think: 2.0 },
  lett:      { name: 'Lett',      desc: 'For nye kapteiner.', income: 0.85, firstAttack: 240, wave: 5, waveGrow: 2, workers: 8, think: 1.5 },
  middels:   { name: 'Middels',   desc: 'En skikkelig utfordring.', income: 1.0, firstAttack: 170, wave: 7, waveGrow: 3, workers: 11, think: 1.0 },
  vanskelig: { name: 'Vanskelig', desc: 'For superkapteiner!', income: 1.25, firstAttack: 120, wave: 9, waveGrow: 3, workers: 14, think: 0.7 },
};

const UNIT_CAP = 60;
const AIR_H = 46; // flying height of air units (world units)
const CARRY = 5;
const MINE_TIME = 1.4;
const CRYSTAL_AMOUNT = 1200;
const BUILD_RADIUS = 11 * TILE; // building must be this close to your own buildings
const EXPAND_RADIUS = 9 * TILE; // a new base may also be placed this close to any crystal
