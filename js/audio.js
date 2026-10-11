'use strict';
// Synthesised sound effects, a gentle music loop and read-aloud for dialogue.
// Everything is generated with WebAudio, so there are no sound files.

const Sound = (() => {
  let ac = null, master = null, sfxGain = null, musicGain = null;
  const state = safeStorageGet('starlite.sound', { sfx: true, music: true, speak: false });
  const last = {};
  let musicTimer = null, musicStep = 0, nextNoteTime = 0;

  function ensure() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    sfxGain = ac.createGain(); sfxGain.gain.value = state.sfx ? 0.5 : 0; sfxGain.connect(master);
    musicGain = ac.createGain(); musicGain.gain.value = state.music ? 0.12 : 0; musicGain.connect(master);
    return true;
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, slideTo = null, delay = 0, dest = null) {
    const t0 = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol = 0.3, freq = 1200, delay = 0) {
    const t0 = ac.currentTime + delay;
    const len = Math.floor(ac.sampleRate * dur);
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource(); src.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t0);
  }

  const SFX = {
    pew: () => tone(900 + Math.random() * 200, 0.09, 'square', 0.06, 400),
    boom: () => { tone(220, 0.25, 'sine', 0.2, 80); noise(0.2, 0.12, 600); },
    beam: () => tone(1400, 0.08, 'sawtooth', 0.03, 1800),
    bonk: () => tone(300, 0.07, 'triangle', 0.12, 180),
    splat: () => noise(0.08, 0.08, 900 + Math.random() * 600),
    poof: () => { tone(500, 0.18, 'sine', 0.12, 1200); noise(0.12, 0.08, 2500); },
    crash: () => { noise(0.6, 0.35, 700); tone(160, 0.5, 'triangle', 0.25, 50); },
    spawn: () => { tone(660, 0.08, 'sine', 0.12); tone(990, 0.12, 'sine', 0.12, null, 0.07); },
    build: () => { tone(330, 0.1, 'square', 0.08); tone(440, 0.1, 'square', 0.08, null, 0.09); },
    done: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.18, 'triangle', 0.15, null, i * 0.08)),
    click: () => tone(700, 0.05, 'sine', 0.12),
    error: () => { tone(220, 0.12, 'square', 0.08); tone(180, 0.15, 'square', 0.08, null, 0.1); },
    alert: () => { tone(880, 0.12, 'triangle', 0.15); tone(660, 0.16, 'triangle', 0.15, null, 0.13); },
    select: () => tone(1200, 0.04, 'sine', 0.06),
    order: () => tone(800, 0.06, 'triangle', 0.08, 1000),
    win: () => [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'triangle', 0.18, null, i * 0.13)),
    lose: () => [523, 494, 440, 392].forEach((f, i) => tone(f, 0.35, 'triangle', 0.15, null, i * 0.25)),
  };

  function play(name) {
    if (!state.sfx || !ensure() || !SFX[name]) return;
    const now = ac.currentTime;
    const gap = name === 'pew' || name === 'splat' || name === 'beam' ? 0.06 : 0.1;
    if (last[name] && now - last[name] < gap) return;
    last[name] = now;
    SFX[name]();
  }

  // A tiny cheerful loop: bass + arpeggio, scheduled ahead of time.
  const CHORDS = [[262, 330, 392], [220, 262, 330], [175, 220, 262], [196, 247, 294]];
  function scheduleMusic() {
    if (!ac) return;
    const beat = 0.25;
    while (nextNoteTime < ac.currentTime + 0.4) {
      const bar = Math.floor(musicStep / 16) % CHORDS.length;
      const ch = CHORDS[bar], s = musicStep % 16;
      const d = Math.max(0, nextNoteTime - ac.currentTime);
      if (s % 4 === 0) tone(ch[0] / 2, beat * 1.8, 'triangle', 0.5, null, d, musicGain);
      const arp = [0, 1, 2, 1, 2, 0, 1, 2];
      if (s % 2 === 0) tone(ch[arp[(s / 2) % 8]] * 2, beat * 0.9, 'sine', 0.25, null, d, musicGain);
      nextNoteTime += beat;
      musicStep++;
    }
  }
  function startMusic() {
    if (!ensure()) return;
    if (musicTimer) return;
    nextNoteTime = ac.currentTime + 0.1;
    musicTimer = setInterval(scheduleMusic, 120);
  }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }

  function set(key, val) {
    state[key] = val;
    safeStorageSet('starlite.sound', state);
    if (ac) {
      sfxGain.gain.value = state.sfx ? 0.5 : 0;
      musicGain.gain.value = state.music ? 0.12 : 0;
    }
    if (key === 'speak' && !val) stopSpeaking();
  }

  // ----- read aloud (speech synthesis) -----
  function voice() {
    if (!window.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find((v) => /^(nb|no|nn)/i.test(v.lang)) || null;
  }
  function hasNorwegianVoice() { return !!voice(); }
  function speak(text) {
    if (!state.speak || !window.speechSynthesis) return;
    stopSpeaking();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'nb-NO';
    const v = voice();
    if (v) u.voice = v;
    u.rate = 0.95; u.pitch = 1.1;
    speechSynthesis.speak(u);
  }
  function stopSpeaking() { if (window.speechSynthesis) speechSynthesis.cancel(); }

  return { play, startMusic, stopMusic, set, state, ensure, speak, stopSpeaking, hasNorwegianVoice };
})();
