/* =========================================================
   Blind Test : trouve le bon titre parmi 4 propositions.
   Les extraits (30 s) viennent de l'API publique Deezer, appelée
   en JSONP : ça marche sans serveur, même en ouvrant index.html
   directement depuis l'ordinateur.
   ========================================================= */
(() => {
  'use strict';

  // ---------- Configuration ----------
  const API = 'https://api.deezer.com';
  const DIFFICULTY = {
    easy:   { time: 20, randomStart: false, label: 'Facile' },
    normal: { time: 12, randomStart: false, label: 'Normal' },
    hard:   { time: 6,  randomStart: true,  label: 'Difficile' },
  };
  const MODES = { classic: 'Classique', survival: 'Survie', chrono: 'Chrono' };
  const CHRONO_TIME = 90;      // secondes en mode Chrono
  const CHRONO_PENALTY = 5;    // secondes perdues sur une erreur en Chrono
  const SURVIVAL_LIVES = 3;
  const MAX_SELECTED = 8;
  const CACHE_TTL = 10 * 60 * 1000; // les liens d'extraits Deezer expirent : on recharge après 10 min

  const PRESETS = {
    fr: ['Ninho', 'Jul', 'PNL', 'Damso', 'SCH', 'Booba', 'Gazo', 'Tiakola', 'Nekfeu', 'Orelsan', 'Niska', 'Werenoi', 'Hamza', 'Naps', 'Lacrim', 'Kaaris', 'Gims', 'Soolking'],
    us: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Eminem', 'Kanye West', 'Future', 'J. Cole', '21 Savage', 'Lil Baby', 'Post Malone', 'Nicki Minaj', 'Tyler, The Creator'],
    pop: ['Aya Nakamura', 'Angèle', 'Stromae', 'Dua Lipa', 'The Weeknd', 'Rihanna', 'Beyoncé', 'Taylor Swift', 'Bad Bunny', 'Billie Eilish', 'Ed Sheeran', 'Indila'],
  };

  // ---------- Petits utilitaires ----------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const fmtFans = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '') + ' M fans' : n >= 1e3 ? Math.round(n / 1e3) + ' k fans' : (n || 0) + ' fans';
  // Normalise un titre pour repérer les doublons : "Jefe (Remix) [feat. X]" -> "jefe"
  const normTitle = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s-\s.*$/, '').replace(/feat\..*$|ft\..*$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem('bt_' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('bt_' + key, JSON.stringify(value)); } catch { /* stockage indisponible : tant pis */ } },
  };

  let toastTimer;
  function toast(msg, ms = 2600) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), ms);
  }

  // ---------- API Deezer (JSONP) ----------
  let jsonpId = 0;
  function jsonp(path, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const cb = `__dz${Date.now()}_${jsonpId++}`;
      const script = document.createElement('script');
      const done = () => { clearTimeout(timer); script.remove(); window[cb] = () => {}; };
      const timer = setTimeout(() => { done(); reject(new Error('Le serveur Deezer ne répond pas.')); }, timeout);
      window[cb] = (data) => {
        done();
        if (data && data.error) reject(new Error(data.error.message || 'Erreur Deezer'));
        else resolve(data);
      };
      script.onerror = () => { done(); reject(new Error('Impossible de contacter Deezer. Vérifie ta connexion.')); };
      script.src = `${API}${path}${path.includes('?') ? '&' : '?'}output=jsonp&callback=${cb}`;
      document.head.appendChild(script);
    });
  }

  const toArtist = (a) => ({ id: a.id, name: a.name, picture: a.picture_medium || a.picture || '', fans: a.nb_fan || 0 });

  async function searchArtists(q, limit = 12) {
    const res = await jsonp(`/search/artist?q=${encodeURIComponent(q)}&limit=${limit}`);
    return (res.data || []).map(toArtist);
  }

  const presetCache = store.get('presetCache', {});
  async function resolvePreset(name) {
    if (presetCache[name]) return presetCache[name];
    const [first] = await searchArtists(name, 1);
    if (!first) throw new Error(`Artiste introuvable : ${name}`);
    presetCache[name] = first;
    store.set('presetCache', presetCache);
    return first;
  }

  const trackCache = new Map();
  async function fetchTopTracks(artist, limit) {
    const key = `${artist.id}:${limit}`;
    const hit = trackCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.tracks;
    const res = await jsonp(`/artist/${artist.id}/top?limit=${limit}`);
    const seen = new Set();
    const tracks = [];
    for (const t of res.data || []) {
      if (!t.preview || t.readable === false) continue;
      const norm = normTitle(t.title_short || t.title);
      if (!norm || seen.has(norm)) continue; // on retire les doublons (remix, version live…)
      seen.add(norm);
      tracks.push({
        id: t.id,
        title: t.title_short || t.title,
        norm,
        preview: t.preview,
        link: t.link,
        album: t.album ? t.album.title : '',
        cover: t.album ? (t.album.cover_big || t.album.cover_medium) : '',
        coverSmall: t.album ? (t.album.cover_small || t.album.cover_medium) : '',
        artistId: artist.id,
        artistName: (t.artist && t.artist.name) || artist.name,
      });
    }
    trackCache.set(key, { at: Date.now(), tracks });
    return tracks;
  }

  // ---------- Effets sonores (Web Audio, aucun fichier) ----------
  let audioCtx;
  function sfx(type) {
    if (muted || volume === 0) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const notes = {
        good: [[660, 0], [880, 0.09], [1320, 0.18]],
        bad: [[220, 0], [160, 0.14]],
        tick: [[1000, 0]],
        end: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]],
      }[type] || [];
      for (const [freq, at] of notes) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type === 'bad' ? 'sawtooth' : 'triangle';
        osc.frequency.value = freq;
        const len = type === 'tick' ? 0.05 : 0.16;
        const peak = (type === 'tick' ? 0.08 : 0.18) * volume;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + at);
        osc.stop(now + at + len + 0.02);
      }
    } catch { /* Web Audio non dispo */ }
  }

  // ---------- Volume ----------
  const audio = $('#audio');
  const recapAudio = $('#recapAudio');
  let volume = store.get('volume', 0.8);
  let muted = store.get('muted', false);
  function applyVolume() {
    audio.volume = recapAudio.volume = volume;
    audio.muted = recapAudio.muted = muted;
    $('#volume').value = volume;
    $('#muteBtn').textContent = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
  }
  $('#volume').addEventListener('input', (e) => { volume = +e.target.value; muted = false; store.set('volume', volume); store.set('muted', muted); applyVolume(); });
  $('#muteBtn').addEventListener('click', (e) => { e.preventDefault(); muted = !muted; store.set('muted', muted); applyVolume(); });
  applyVolume();

  // ---------- Écrans ----------
  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // =========================================================
  //  ACCUEIL : sélection des artistes et des réglages
  // =========================================================
  const selected = new Map(); // id -> artiste
  const settings = Object.assign({ mode: 'classic', rounds: '10', difficulty: 'normal', pool: '25' }, store.get('settings', {}));
  let challenge = null; // défi reçu via un lien partagé

  function artistCard(artist, { preset } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'artist';
    btn.dataset.id = artist.id || '';
    btn.dataset.name = artist.name;
    if (artist.id && selected.has(artist.id)) btn.classList.add('selected');
    btn.innerHTML = `
      ${artist.picture ? `<img class="avatar" src="${esc(artist.picture)}" alt="" loading="lazy">` : `<div class="avatar">${esc(initials(artist.name))}</div>`}
      <div class="artist-name">${esc(artist.name)}</div>
      ${artist.fans ? `<div class="artist-fans">${fmtFans(artist.fans)}</div>` : ''}`;
    btn.addEventListener('click', async () => {
      let a = artist;
      if (preset && !a.id) {
        btn.disabled = true;
        try { a = await resolvePreset(artist.name); } catch (err) { toast(err.message); btn.disabled = false; return; }
        btn.disabled = false;
      }
      toggleArtist(a);
    });
    return btn;
  }

  function toggleArtist(a) {
    if (selected.has(a.id)) selected.delete(a.id);
    else {
      if (selected.size >= MAX_SELECTED) { toast(`${MAX_SELECTED} artistes maximum par partie`); return; }
      selected.set(a.id, a);
    }
    renderSelected();
  }

  function renderSelected() {
    const wrap = $('#selectedWrap');
    const chips = $('#selected');
    wrap.classList.toggle('hidden', selected.size === 0);
    $('#selectedCount').textContent = `(${selected.size})`;
    chips.innerHTML = '';
    for (const a of selected.values()) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.innerHTML = `${a.picture ? `<img src="${esc(a.picture)}" alt="">` : '<span class="mini"></span>'}${esc(a.name)}<button type="button" aria-label="Retirer ${esc(a.name)}">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => { selected.delete(a.id); renderSelected(); });
      chips.appendChild(chip);
    }
    // met à jour l'état "sélectionné" de toutes les cartes visibles
    $$('.artist').forEach((card) => {
      const id = +card.dataset.id || (presetCache[card.dataset.name] && presetCache[card.dataset.name].id);
      card.classList.toggle('selected', !!id && selected.has(id));
    });
    const start = $('#startBtn');
    start.disabled = selected.size === 0;
    start.textContent = selected.size === 0 ? 'Choisis au moins un artiste'
      : selected.size === 1 ? `▶ Jouer avec ${[...selected.values()][0].name}`
      : `▶ Jouer avec ${selected.size} artistes (mix)`;
  }

  let currentCat = 'fr';
  function renderPresets() {
    const grid = $('#presets');
    grid.innerHTML = '';
    if (currentCat === 'recent') {
      const recents = store.get('recent', []);
      if (!recents.length) { grid.innerHTML = '<p class="empty">Les artistes avec qui tu as joué apparaîtront ici.</p>'; return; }
      recents.forEach((a) => grid.appendChild(artistCard(a)));
      return;
    }
    const names = PRESETS[currentCat];
    names.forEach((name) => grid.appendChild(artistCard(presetCache[name] || { name }, { preset: true })));
    loadPresetPictures(names);
  }

  // Charge les photos des suggestions en tâche de fond (une par une, sans bloquer)
  async function loadPresetPictures(names) {
    for (const name of names) {
      if (presetCache[name]) continue;
      try {
        const a = await resolvePreset(name);
        const old = $(`#presets .artist[data-name="${CSS.escape(name)}"]`);
        if (old) old.replaceWith(artistCard(a, { preset: true }));
      } catch { /* on garde les initiales */ }
    }
  }

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    currentCat = tab.dataset.cat;
    renderPresets();
  }));

  $('#searchForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const q = $('#searchInput').value.trim();
    const box = $('#searchResults');
    if (!q) { box.innerHTML = ''; return; }
    box.innerHTML = '<p class="empty">Recherche…</p>';
    try {
      const results = await searchArtists(q);
      box.innerHTML = '';
      if (!results.length) { box.innerHTML = `<p class="empty">Aucun artiste trouvé pour « ${esc(q)} »</p>`; return; }
      results.forEach((a) => box.appendChild(artistCard(a)));
    } catch (err) {
      box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  });

  // Recherche automatique pendant la frappe (avec un petit délai)
  let searchDebounce;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    if (e.target.value.trim().length < 2) { if (!e.target.value.trim()) $('#searchResults').innerHTML = ''; return; }
    searchDebounce = setTimeout(() => $('#searchForm').requestSubmit(), 450);
  });

  // Boutons de réglages
  function renderSettings() {
    $$('.settings .seg').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings[key]));
    });
    $('#roundsSetting').classList.toggle('hidden', settings.mode !== 'classic');
  }
  $$('.settings .seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[seg.dataset.setting] = b.dataset.value;
    store.set('settings', settings);
    renderSettings();
  }));

  const nameInput = $('#playerName');
  nameInput.value = store.get('name', '');
  nameInput.addEventListener('input', () => store.set('name', nameInput.value.trim()));

  $('#startBtn').addEventListener('click', () => startGame([...selected.values()], { ...settings }));
  $('#logoBtn').addEventListener('click', () => { if (game && !game.over && !confirm('Quitter la partie en cours ?')) return; stopGame(); show('home'); });

  // =========================================================
  //  PARTIE
  // =========================================================
  let game = null;
  let rafId = 0;
  let lastTick = 0;

  async function startGame(artists, opts) {
    $('#homeError').classList.add('hidden');
    show('loading');
    $('#loadingText').textContent = `Chargement des morceaux de ${artists.map((a) => a.name).join(', ')}…`;
    let byArtist;
    try {
      byArtist = await Promise.all(artists.map((a) => fetchTopTracks(a, +opts.pool)));
    } catch (err) {
      show('home');
      $('#homeError').textContent = err.message;
      $('#homeError').classList.remove('hidden');
      return;
    }
    const all = byArtist.flat();
    // il faut au moins 4 titres différents pour faire un QCM
    const usable = artists.filter((_, i) => byArtist[i].length > 0);
    if (all.length < 4) {
      show('home');
      $('#homeError').textContent = 'Pas assez de morceaux avec un extrait pour cet artiste. Essaie avec « Toute la disco » ou ajoute un autre artiste.';
      $('#homeError').classList.remove('hidden');
      return;
    }

    // mémorise les artistes récents
    const recents = store.get('recent', []).filter((r) => !artists.some((a) => a.id === r.id));
    store.set('recent', [...artists.map(({ id, name, picture, fans }) => ({ id, name, picture, fans })), ...recents].slice(0, 12));

    const diff = DIFFICULTY[opts.difficulty];
    const queue = shuffle(all);
    game = {
      artists: usable,
      opts,
      diff,
      tracks: all,
      byArtist: new Map(usable.map((a) => [a.id, all.filter((t) => t.artistId === a.id)])),
      queue,
      total: opts.mode === 'classic' ? Math.min(+opts.rounds, queue.length) : queue.length,
      index: -1,
      score: 0,
      streak: 0,
      bestStreak: 0,
      lives: SURVIVAL_LIVES,
      chronoLeft: CHRONO_TIME,
      correct: 0,
      answered: 0,
      times: [],
      history: [],
      jokers: { fifty: true, skip: true },
      mix: usable.length > 1,
      over: false,
    };
    if (opts.mode === 'classic' && queue.length < +opts.rounds) toast(`Seulement ${queue.length} morceaux disponibles : la partie sera plus courte.`);

    $('#livesWrap').classList.toggle('hidden', opts.mode !== 'survival');
    $('#chronoWrap').classList.toggle('hidden', opts.mode !== 'chrono');
    $('#progressLabel').textContent = opts.mode === 'classic' ? 'Question' : 'Trouvés';
    updateHud();
    show('game');
    nextQuestion();
  }

  function pickChoices(track) {
    // On prend les mauvaises réponses chez le même artiste si possible (plus dur !)
    const sameArtist = game.byArtist.get(track.artistId) || [];
    const source = sameArtist.length >= 4 ? sameArtist : game.tracks;
    const wrong = [];
    const used = new Set([track.norm]);
    for (const t of shuffle(source)) {
      if (used.has(t.norm)) continue;
      used.add(t.norm);
      wrong.push(t);
      if (wrong.length === 3) break;
    }
    return shuffle([track, ...wrong]);
  }

  function isGameFinished() {
    const g = game;
    if (g.index + 1 >= g.queue.length) return true;
    if (g.opts.mode === 'classic') return g.index + 1 >= g.total;
    if (g.opts.mode === 'survival') return g.lives <= 0;
    if (g.opts.mode === 'chrono') return g.chronoLeft <= 0;
    return false;
  }

  function nextQuestion() {
    if (!game || game.over) return;
    if (isGameFinished()) { endGame(); return; }
    const g = game;
    g.index++;
    const track = g.queue[g.index];
    g.current = {
      track,
      choices: pickChoices(track),
      locked: false,
      started: false,
      startAt: 0,
      elapsed: 0,
      offset: 0,
      removed: new Set(),
    };

    // remise à zéro de l'interface
    $('#reveal').innerHTML = '';
    $('#cover').classList.add('hidden');
    $('#cover').removeAttribute('src');
    $('#vinylLabel').classList.remove('hidden');
    $('#vinylLabel').textContent = '?';
    $('#nextBtn').classList.add('hidden');
    $('#timerBar').style.width = '100%';
    $('#timerBar').style.backgroundPosition = '0% 0';
    $('#jokerFifty').disabled = !g.jokers.fifty;
    $('#jokerSkip').disabled = !g.jokers.skip;
    $('#replayBtn').disabled = false;
    renderAnswers();
    updateHud();
    playExtract(true);
  }

  function renderAnswers() {
    const box = $('#answers');
    box.innerHTML = '';
    const { choices } = game.current;
    choices.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'answer';
      b.type = 'button';
      b.innerHTML = `<span class="key">${i + 1}</span>${esc(t.title)}${game.mix ? `<span class="a-artist">${esc(t.artistName)}</span>` : ''}`;
      b.addEventListener('click', () => answer(i));
      box.appendChild(b);
    });
  }

  function playExtract(fresh) {
    const cur = game.current;
    const { track } = cur;
    const vinyl = $('#vinyl');
    const eq = $('#eq');
    if (fresh) {
      audio.src = track.preview;
      audio.load();
      const onMeta = () => {
        const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
        const span = game.opts.mode === 'chrono' ? 10 : game.diff.time;
        cur.offset = game.diff.randomStart ? Math.random() * Math.max(0, dur - span - 1) : 0;
        try { audio.currentTime = cur.offset; } catch { /* ignore */ }
      };
      audio.addEventListener('loadedmetadata', onMeta, { once: true });
    } else {
      try { audio.currentTime = cur.offset; } catch { /* ignore */ }
    }
    const p = audio.play();
    if (p && p.catch) {
      p.catch((err) => {
        if (err && err.name === 'NotAllowedError') {
          // le navigateur bloque la lecture automatique : on demande un clic
          $('#reveal').innerHTML = '<button class="btn" id="tapToPlay">▶ Lancer l\'extrait</button>';
          $('#tapToPlay').addEventListener('click', () => { $('#reveal').innerHTML = ''; playExtract(false); });
        }
      });
    }
    vinyl.classList.add('spinning');
    eq.classList.add('playing');
  }

  // Le chrono de la question démarre seulement quand le son joue vraiment (équitable si la connexion est lente)
  audio.addEventListener('playing', () => {
    if (!game || !game.current || game.current.locked) return;
    if (!game.current.started) {
      game.current.started = true;
      game.current.startAt = performance.now();
      lastTick = performance.now();
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(loop);
    }
  });
  audio.addEventListener('pause', () => { $('#eq').classList.remove('playing'); $('#vinyl').classList.remove('spinning'); });
  audio.addEventListener('play', () => { $('#eq').classList.add('playing'); $('#vinyl').classList.add('spinning'); });
  audio.addEventListener('ended', () => { $('#eq').classList.remove('playing'); $('#vinyl').classList.remove('spinning'); });
  audio.addEventListener('error', () => {
    // extrait cassé : on passe au suivant sans pénaliser le joueur
    if (!game || game.over || !game.current || game.current.locked || !audio.getAttribute('src')) return;
    game.current.locked = true;
    cancelAnimationFrame(rafId);
    toast('Extrait indisponible, morceau suivant…');
    if (game.opts.mode === 'classic') game.total = Math.min(game.total + 1, game.queue.length);
    setTimeout(nextQuestion, 800);
  });

  function loop(now) {
    const g = game;
    if (!g || g.over || !g.current || g.current.locked) return;
    const cur = g.current;
    const dt = (now - lastTick) / 1000;
    lastTick = now;
    cur.elapsed = (now - cur.startAt) / 1000;

    if (g.opts.mode === 'chrono') {
      const before = Math.ceil(g.chronoLeft);
      g.chronoLeft = Math.max(0, g.chronoLeft - dt);
      const after = Math.ceil(g.chronoLeft);
      $('#chrono').textContent = after;
      if (after !== before && after <= 5 && after > 0) sfx('tick');
      const ratio = g.chronoLeft / CHRONO_TIME;
      setTimerBar(ratio);
      if (g.chronoLeft <= 0) { answer(null); return; }
    } else {
      const limit = g.diff.time;
      const left = Math.max(0, limit - cur.elapsed);
      const prevLeft = limit - (cur.elapsed - dt);
      if (Math.ceil(left) !== Math.ceil(prevLeft) && left <= 3 && left > 0) sfx('tick');
      setTimerBar(left / limit);
      if (left <= 0) { answer(null); return; }
    }
    rafId = requestAnimationFrame(loop);
  }

  function setTimerBar(ratio) {
    const bar = $('#timerBar');
    bar.style.width = `${Math.max(0, ratio) * 100}%`;
    bar.style.backgroundPosition = `${(1 - ratio) * 100}% 0`;
  }

  function multiplierFor(streak) {
    return streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
  }

  // index = numéro de la réponse, null = temps écoulé, 'skip' = joker Passer
  function answer(index) {
    const g = game;
    if (!g || g.over || !g.current || g.current.locked) return;
    const cur = g.current;
    if (typeof index === 'number' && cur.removed.has(index)) return;
    if (index === null && g.opts.mode === 'chrono') {
      // fin du temps en Chrono : la question en cours ne compte pas comme une erreur
      cur.locked = true;
      cancelAnimationFrame(rafId);
      endGame();
      return;
    }
    cur.locked = true;
    cancelAnimationFrame(rafId);

    const { track, choices } = cur;
    const correctIdx = choices.indexOf(track);
    const buttons = $$('#answers .answer');
    buttons.forEach((b) => (b.disabled = true));
    const elapsed = cur.started ? Math.min(cur.elapsed, g.opts.mode === 'chrono' ? 99 : g.diff.time) : 0;

    let status; let points = 0;
    if (index === 'skip') {
      status = 'skip';
    } else if (index === correctIdx) {
      status = 'ok';
      g.streak++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      g.correct++;
      const ref = g.opts.mode === 'chrono' ? 10 : g.diff.time;
      const speedBonus = Math.round(100 * Math.max(0, 1 - elapsed / ref));
      points = Math.round((100 + speedBonus) * multiplierFor(g.streak));
      g.score += points;
      g.times.push(elapsed);
      sfx('good');
    } else {
      status = 'ko';
      g.streak = 0;
      if (g.opts.mode === 'survival') g.lives--;
      if (g.opts.mode === 'chrono') g.chronoLeft = Math.max(0, g.chronoLeft - CHRONO_PENALTY);
      sfx('bad');
    }
    if (status !== 'skip') g.answered++;

    buttons[correctIdx].classList.add('correct');
    if (typeof index === 'number' && index !== correctIdx) buttons[index].classList.add('wrong');

    g.history.push({ track, status, points, time: elapsed, picked: typeof index === 'number' ? choices[index] : null });

    // révélation de la pochette et du titre
    const cover = $('#cover');
    if (track.cover) { cover.src = track.cover; cover.classList.remove('hidden'); $('#vinylLabel').classList.add('hidden'); }
    const msg = status === 'ok' ? `<span class="r-points good">+${points} pts</span>`
      : status === 'skip' ? '<span class="r-points">Question passée</span>'
      : index === null ? '<span class="r-points bad">⏰ Temps écoulé !</span>'
      : '<span class="r-points bad">Raté !</span>';
    $('#reveal').innerHTML = `${msg}<div class="r-title">${esc(track.title)}</div><div class="r-sub">${esc(track.artistName)}${track.album ? ' · ' + esc(track.album) : ''}</div>`;

    const mult = multiplierFor(g.streak);
    const multEl = $('#multiplier');
    if (status === 'ok' && mult > 1) { multEl.textContent = `🔥 ×${mult}`; multEl.classList.remove('hidden'); multEl.style.animation = 'none'; void multEl.offsetWidth; multEl.style.animation = ''; }
    else if (g.streak === 0) multEl.classList.add('hidden');

    $('#jokerFifty').disabled = true;
    $('#jokerSkip').disabled = true;
    updateHud(status === 'ok');

    const finished = isGameFinished();
    if (g.opts.mode === 'chrono') {
      // en Chrono on enchaîne vite
      setTimeout(() => { if (game === g && !g.over) { audio.pause(); nextQuestion(); } }, finished ? 600 : 1100);
    } else {
      const next = $('#nextBtn');
      next.textContent = finished ? 'Voir les résultats 🏁' : 'Suivant ➜';
      next.classList.remove('hidden');
      next.focus({ preventScroll: true });
    }
  }

  function updateHud(bump) {
    const g = game;
    if (!g) return;
    $('#progress').textContent = g.opts.mode === 'classic' ? `${Math.max(1, g.index + 1)}/${g.total}` : `${g.correct}`;
    $('#score').textContent = g.score;
    $('#streak').textContent = g.streak >= 3 ? `${g.streak} 🔥` : g.streak;
    $('#lives').textContent = '❤️'.repeat(Math.max(0, g.lives)) + '🖤'.repeat(SURVIVAL_LIVES - Math.max(0, g.lives));
    $('#chrono').textContent = Math.ceil(g.chronoLeft);
    if (bump) {
      const s = $('#score');
      s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump');
    }
  }

  $('#nextBtn').addEventListener('click', () => { audio.pause(); nextQuestion(); });
  $('#replayBtn').addEventListener('click', () => { if (game && game.current) playExtract(false); });
  $('#jokerFifty').addEventListener('click', () => {
    const g = game;
    if (!g || !g.jokers.fifty || g.current.locked) return;
    g.jokers.fifty = false;
    const correctIdx = g.current.choices.indexOf(g.current.track);
    const wrongIdx = shuffle([0, 1, 2, 3].filter((i) => i !== correctIdx)).slice(0, 2);
    const buttons = $$('#answers .answer');
    wrongIdx.forEach((i) => { g.current.removed.add(i); buttons[i].classList.add('removed'); buttons[i].disabled = true; });
    $('#jokerFifty').disabled = true;
  });
  $('#jokerSkip').addEventListener('click', () => {
    const g = game;
    if (!g || !g.jokers.skip || g.current.locked) return;
    g.jokers.skip = false;
    answer('skip');
  });
  $('#quitBtn').addEventListener('click', () => {
    if (!confirm('Quitter la partie ? Ton score ne sera pas enregistré.')) return;
    stopGame();
    show('home');
  });

  function stopGame() {
    cancelAnimationFrame(rafId);
    audio.pause();
    audio.removeAttribute('src');
    recapAudio.pause();
    if (game) game.over = true;
  }

  // Raccourcis clavier
  document.addEventListener('keydown', (e) => {
    if (!$('#screen-game').classList.contains('active') || !game || document.querySelector('dialog[open]')) return;
    if (e.target.matches('input, textarea')) return;
    const map = { '1': 0, '2': 1, '3': 2, '4': 3, '&': 0, 'é': 1, '"': 2, "'": 3 };
    if (e.key in map && !game.current.locked) { e.preventDefault(); answer(map[e.key]); }
    else if (e.key === ' ') { e.preventDefault(); playExtract(false); }
    else if (e.key === 'Enter' && game.current.locked && !$('#nextBtn').classList.contains('hidden')) { e.preventDefault(); $('#nextBtn').click(); }
  });

  // =========================================================
  //  RÉSULTATS
  // =========================================================
  function scoreKey(g) {
    return [g.opts.mode, g.opts.difficulty, g.opts.mode === 'classic' ? g.opts.rounds : '', g.opts.pool, g.artists.map((a) => a.id).sort().join('-')].join('|');
  }

  function endGame() {
    const g = game;
    g.over = true;
    cancelAnimationFrame(rafId);
    audio.pause();
    sfx('end');

    const answered = g.answered;
    const acc = answered ? Math.round((g.correct / answered) * 100) : 0;
    const avg = g.times.length ? g.times.reduce((a, b) => a + b, 0) / g.times.length : 0;

    // records
    const records = store.get('records', {});
    const key = scoreKey(g);
    const isRecord = g.score > 0 && g.score > (records[key] || 0);
    if (isRecord) { records[key] = g.score; store.set('records', records); }

    const name = nameInput.value.trim() || 'Anonyme';
    const scores = store.get('scores', []);
    scores.push({
      name, score: g.score, correct: g.correct, answered, mode: g.opts.mode, difficulty: g.opts.difficulty,
      artists: g.artists.map((a) => a.name), date: Date.now(), bestStreak: g.bestStreak,
    });
    scores.sort((a, b) => b.score - a.score);
    store.set('scores', scores.slice(0, 200));

    // titre selon la performance
    const ranks = [
      [90, '👑', 'Légende !', 'Tu connais la discographie par cœur.'],
      [70, '🔥', 'Gros niveau !', 'Un vrai fan, ça se voit.'],
      [50, '😎', 'Pas mal du tout', 'Encore quelques écoutes et tu seras au top.'],
      [25, '🎧', 'Ça vient…', "Il est temps de réécouter les albums."],
      [0, '🙈', 'Aïe…', "T'es sûr que tu écoutes cet artiste ?"],
    ];
    const [, emoji, title, sub] = ranks.find(([min]) => acc >= min);
    $('#rankEmoji').textContent = emoji;
    $('#rankTitle').textContent = title;
    const artistLabel = g.artists.map((a) => a.name).join(', ');
    $('#rankSub').textContent = `${sub} · ${artistLabel} · ${MODES[g.opts.mode]} · ${DIFFICULTY[g.opts.difficulty].label}`;
    $('#finalScore').textContent = g.score;
    $('#newRecord').classList.toggle('hidden', !isRecord);
    $('#statCorrect').textContent = `${g.correct}/${answered}`;
    $('#statAccuracy').textContent = `${acc}%`;
    $('#statBestStreak').textContent = g.bestStreak;
    $('#statAvgTime').textContent = `${avg.toFixed(1).replace('.', ',')} s`;
    $('#shareMsg').classList.add('hidden');

    if (challenge) {
      const won = g.score > challenge.score;
      toast(won ? `🏆 Tu as battu ${challenge.name} (${challenge.score} pts) !` : `😤 ${challenge.name} reste devant avec ${challenge.score} pts…`, 4500);
      challenge = null;
      $('#challengeBanner')?.remove();
    }

    renderRecap(g.history);
    show('results');
  }

  function renderRecap(history) {
    const list = $('#recap');
    list.innerHTML = '';
    history.forEach((h) => {
      const li = document.createElement('li');
      li.className = h.status;
      const icon = h.status === 'ok' ? '✅' : h.status === 'skip' ? '⏭️' : '❌';
      const detail = h.status === 'ok' ? `+${h.points} pts · ${h.time.toFixed(1).replace('.', ',')} s`
        : h.status === 'skip' ? 'Passée'
        : h.picked ? `Tu as répondu : ${esc(h.picked.title)}` : 'Temps écoulé';
      li.innerHTML = `
        ${h.track.coverSmall ? `<img src="${esc(h.track.coverSmall)}" alt="">` : '<span></span>'}
        <div><div class="t">${icon} ${esc(h.track.title)}</div><div class="s">${esc(h.track.artistName)} · ${detail}</div></div>
        <button class="play" type="button" aria-label="Écouter">▶</button>
        <a href="${esc(h.track.link)}" target="_blank" rel="noopener">Deezer ↗</a>`;
      const play = li.querySelector('.play');
      play.addEventListener('click', () => {
        const playingThis = recapAudio.dataset.id === String(h.track.id) && !recapAudio.paused;
        $$('#recap .play').forEach((b) => (b.textContent = '▶'));
        if (playingThis) { recapAudio.pause(); return; }
        recapAudio.src = h.track.preview;
        recapAudio.dataset.id = h.track.id;
        recapAudio.play().catch(() => toast('Impossible de lire cet extrait'));
        play.textContent = '⏸';
      });
      list.appendChild(li);
    });
  }
  recapAudio.addEventListener('ended', () => $$('#recap .play').forEach((b) => (b.textContent = '▶')));

  $('#replaySameBtn').addEventListener('click', () => { recapAudio.pause(); startGame(game.artists, game.opts); });
  $('#homeBtn').addEventListener('click', () => { recapAudio.pause(); show('home'); renderSelected(); });

  // Partage : lien qui permet à un ami de relever le défi avec les mêmes réglages
  $('#shareBtn').addEventListener('click', async () => {
    const g = game;
    const params = new URLSearchParams({
      a: g.artists.map((a) => a.id).join(','),
      m: g.opts.mode, d: g.opts.difficulty, r: g.opts.rounds, p: g.opts.pool,
      s: g.score, n: nameInput.value.trim() || 'Un ami',
    });
    const url = `${location.origin}${location.pathname}?${params}`;
    const text = `🎧 J'ai fait ${g.score} pts au Blind Test ${g.artists.map((a) => a.name).join(' / ')} (${g.correct}/${g.answered} bonnes réponses). Tu fais mieux ?`;
    try {
      if (navigator.share && location.protocol.startsWith('http')) { await navigator.share({ title: 'Blind Test', text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      $('#shareMsg').textContent = '✅ Lien du défi copié ! Envoie-le à tes potes.';
    } catch {
      $('#shareMsg').textContent = `${text} ${url}`;
    }
    $('#shareMsg').classList.remove('hidden');
  });

  // =========================================================
  //  CLASSEMENT & STATS
  // =========================================================
  let lbFilter = 'all';
  function renderLeaderboard() {
    const scores = store.get('scores', []);
    const list = $('#leaderboard');
    const filtered = scores.filter((s) => lbFilter === 'all' || s.mode === lbFilter).slice(0, 10);
    list.innerHTML = filtered.length ? '' : '<p class="muted">Aucune partie pour l\'instant. Lance-toi !</p>';
    filtered.forEach((s) => {
      const li = document.createElement('li');
      const date = new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      li.innerHTML = `<div><div>${esc(s.name)}</div><div class="lb-sub">${esc(s.artists.join(', '))} · ${MODES[s.mode]} · ${DIFFICULTY[s.difficulty]?.label || ''} · ${date}</div></div><div class="lb-score">${s.score}</div>`;
      list.appendChild(li);
    });

    const games = scores.length;
    const correct = scores.reduce((a, s) => a + s.correct, 0);
    const answered = scores.reduce((a, s) => a + s.answered, 0);
    const best = scores.reduce((a, s) => Math.max(a, s.score), 0);
    const counts = {};
    scores.forEach((s) => s.artists.forEach((n) => (counts[n] = (counts[n] || 0) + 1)));
    const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    $('#globalStats').innerHTML = `
      <div><b>${games}</b><span>Parties</span></div>
      <div><b>${best}</b><span>Meilleur score</span></div>
      <div><b>${answered ? Math.round((correct / answered) * 100) : 0}%</b><span>Précision globale</span></div>
      <div><b>${fav ? esc(fav[0]) : '—'}</b><span>Artiste préféré</span></div>`;
  }
  $('#lbFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    lbFilter = b.dataset.value;
    $$('#lbFilter button').forEach((x) => x.classList.toggle('active', x === b));
    renderLeaderboard();
  });
  $('#statsBtn').addEventListener('click', () => { renderLeaderboard(); $('#statsDialog').showModal(); });
  $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());
  $('#resetStats').addEventListener('click', () => {
    if (!confirm('Effacer tous tes scores et records ?')) return;
    store.set('scores', []); store.set('records', {});
    renderLeaderboard();
  });
  // fermer une modale en cliquant à côté
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // =========================================================
  //  DÉMARRAGE (+ lecture d'un lien de défi)
  // =========================================================
  async function loadChallengeFromUrl() {
    const params = new URLSearchParams(location.search);
    const ids = (params.get('a') || '').split(',').map(Number).filter(Boolean).slice(0, MAX_SELECTED);
    if (!ids.length) return;
    if (MODES[params.get('m')]) settings.mode = params.get('m');
    if (DIFFICULTY[params.get('d')]) settings.difficulty = params.get('d');
    if (['5', '10', '15', '20'].includes(params.get('r'))) settings.rounds = params.get('r');
    if (['25', '100'].includes(params.get('p'))) settings.pool = params.get('p');
    renderSettings();
    try {
      const artists = await Promise.all(ids.map((id) => jsonp(`/artist/${id}`)));
      artists.forEach((a) => a && a.id && selected.set(a.id, toArtist(a)));
      renderSelected();
    } catch { /* lien invalide : on ignore */ }
    const score = parseInt(params.get('s'), 10);
    if (score >= 0) {
      challenge = { score, name: (params.get('n') || 'Un ami').slice(0, 16) };
      const banner = document.createElement('div');
      banner.id = 'challengeBanner';
      banner.className = 'card';
      banner.style.borderColor = 'var(--warn)';
      banner.innerHTML = `<h2>⚔️ Défi reçu !</h2><p><b>${esc(challenge.name)}</b> a fait <b>${challenge.score} pts</b> en mode ${MODES[settings.mode]} (${DIFFICULTY[settings.difficulty].label}). Les réglages sont déjà prêts : à toi de le battre !</p>`;
      $('#screen-home .hero').after(banner);
    }
    history.replaceState(null, '', location.pathname);
  }

  renderSettings();
  renderPresets();
  renderSelected();
  loadChallengeFromUrl();
})();
