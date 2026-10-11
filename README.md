# Starlite

*Mal verden fargerik igjen!* (Paint the world colourful again!)

Starlite is a real-time strategy game for children aged 6–9. It is inspired by StarCraft 1 and 2, but the unit rosters are much smaller, the art is bright and cartoony with paint splats everywhere, and the story is about friendship. All in-game text is in Norwegian (bokmål).

Nothing gets hurt. Units shoot paint. When a unit runs out of health, it falls over and goes *Poff!*, and the ground under it gets painted in the attacker's colour. Buildings go *SPLASJ!*.

## Play

Open `index.html` in a modern browser (Chrome, Edge, Firefox, or Safari). You don't need to install or build anything, and it also works straight from the file system.

To serve it locally instead:

```sh
npx http-server -c-1 .
```

The game runs on desktop and tablets. It uses the Fredoka font from Google Fonts when online and falls back to a rounded system font offline.

## How to play

| Action | Mouse | Touch | Keys |
| --- | --- | --- | --- |
| Select | Click a unit, or drag a box around units | Tap | `A` all soldiers, `B` all workers |
| Move or attack | Click the ground or an enemy (right click also works) | Tap | |
| Walk without fighting | Press **Løp hit**, then click | Same | |
| Build | Select the base or a worker, press a building button, click the ground | Same | `1`–`9` press the buttons |
| Rally point | Right click with a building selected, or press **Samlingspunkt** | Same | |
| Move the map | Screen edges, minimap, or mouse wheel to zoom | Drag with one finger, or tap the minimap | Arrow keys, `Space` jumps to your base |
| Pause | **Pause** button | Same | `P`, `Esc` cancels |

Some rules keep things simple for young players:

- Soldiers walk in attack-move by default, so they fight whatever they meet on the way.
- Workers start gathering crystals by themselves.
- There is only one resource (crystals) and a fixed limit of 50 units. There is no supply to manage.
- Buildings construct themselves once placed, but only near your own buildings.
- **Paint matters.** Every hit, and every footstep, leaves paint in your team's colour. Your units walk 30 % faster on your own paint and a little slower on enemy paint. The top bar shows how much of the map each team has painted.

## The four peoples

Each faction has one worker, three fighters, and four buildings (a base, two production buildings, and a defence tower).

| | Stjernevennene (inspired by Terran) | Summerne (Zerg) | Krystallvokterne (Protoss) | Gråskodda (story villain) |
| --- | --- | --- | --- | --- |
| Special trait | Buildings repair themselves | Units and buildings heal themselves | Shields recharge | – |
| Worker | Byggebot | Sankelarve | Svevesonde | Støvsuger |
| Fighter 1 | Malersoldat (paint blaster, hits air) | Sprettbille (fast, cheap, melee) | Lysvokter (light sword, melee) | Støvdott (fluffy, melee) |
| Fighter 2 | Rullebil (paint roller plus splash cannon, paints the road) | Spyttsnegl (long range, hits air) | Glimtskytter (long range, hits air) | Gråbot (ranged, hits air) |
| Flyer | Ballongflyer | Vingesumm | Stjerneseiler (beam) | Tåkesky (splash) |
| Buildings | Stjernestasjon, Kaserne, Verksted, Vakttårn | Bikube, Klekkeri, Vingereir, Piggsopp | Krystallhjerte, Lysportal, Stjerneport, Lystårn | Skyslottet, Tåkefabrikk, Skyverksted, Grått tårn |

The first three factions are playable in free play (*Fri lek*). Gråskodda can be chosen as the opponent.

## Story (Historie)

A grumpy grey cloud, Gråskodda, drifts over the colourful planet Glimra and drains the colour from everything, which makes everyone sour and grumpy. Kaptein Stella and her robot Bolt set out to paint the world colourful again. Painting a grey base turns its owners happy and colourful, and they become friends.

1. **Landingen**: a tutorial with step-by-step goals. Build a Kaserne, train soldiers, and paint over a small dust-bunny camp.
2. **Summing i skogen**: free the grey, grumpy Summerne and meet Dronning Summa.
3. **Krystallgrotta**: play as Summerne and free Vokter Lumi's Krystallvokterne.
4. **Hold lyset**: play as Krystallvokterne and defend the Krystallhjerte for four minutes against waves from Gråskodda.
5. **Skyslottet**: the Stjernevennene and an allied Summerne army storm the cloud castle. In the ending, Gråskodda admits it was lonely and becomes Regnbueskya (the Rainbow Cloud).

Dialogue can be read aloud with the browser's speech synthesis (**Les høyt**). This works best when the system has a Norwegian voice installed. Campaign progress is saved in the browser.

Free play has five maps (Blomsterenga, Summeskogen, Krystallgrotta, Skyøya, and Solstranda), five difficulty levels from *Fredelig* (the computer never attacks) to *Vanskelig*, team colours, and an optional AI helper on your side.

## Project layout

```
index.html        page, HUD and screen containers
css/style.css     all styling
js/util.js        helpers (random numbers, heap, colours, storage)
js/data.js        factions, units, buildings, difficulties
js/map.js         map generation and A* path finding
js/paint.js       the paint layer and coverage tracking
js/game.js        simulation: units, combat, gathering, objectives
js/ai.js          computer opponent
js/art.js         procedural cartoon art (units, buildings, portraits)
js/render.js      world and minimap rendering
js/audio.js       synthesised sound effects, music, read-aloud
js/story.js       campaign missions, dialogue, free-play setup
js/input.js       mouse, touch and keyboard
js/hud.js         in-game HUD
js/main.js        screens, dialogue, main loop
tests/            headless browser tests (Playwright)
```

All graphics and sounds are generated in code, so the game has no image or audio files.

## Tests

The tests drive the real game in headless Chromium:

```sh
npm install           # installs Playwright (or use a global install)
node tests/smoke.js   # loads the game, plays the tutorial, exercises the UI, checks for errors
node tests/campaign.js  # an AI plays each campaign mission; reports win or loss
node tests/matrix.js    # AI vs AI for every faction pairing (balance check)
```

`node tests/smoke.js <dir>` also saves screenshots to `<dir>`.
