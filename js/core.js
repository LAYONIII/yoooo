/* =========================================================
   core.js : briques partagées (utilitaires, stockage, API Deezer,
   effets sonores, confettis, profil, succès, création des questions).
   Tout est exposé dans l'objet global BT.
   ========================================================= */
window.BT = window.BT || {};
(() => {
  'use strict';

  // ---------- Utilitaires ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const initials = (name) => String(name).split(/\s+/).map((w) => w[0] || '').join('').slice(0, 2).toUpperCase();
  const fmtFans = (n) => n >= 1e6 ? (n / 1e6).toFixed(1).replace('.0', '').replace('.', ',') + ' M fans' : n >= 1e3 ? Math.round(n / 1e3) + ' k fans' : (n || 0) + ' fans';
  const fmtSec = (s) => `${s.toFixed(1).replace('.', ',')} s`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // Normalise un titre pour repérer les doublons : "Jefe (Remix) [feat. X]" -> "jefe"
  const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\(.*?\)|\[.*?\]/g, '').replace(/\s-\s.*$/, '').replace(/\b(feat|ft)\..*$/, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem('bt_' + key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem('bt_' + key, JSON.stringify(value)); } catch { /* stockage indisponible */ } },
  };

  function toast(msg, { type = '', ms = 2800, icon = '' } = {}) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icon ? `<span class="toast-ico">${icon}</span>` : ''}<span>${esc(msg)}</span>`;
    box.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, ms);
  }

  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    document.body.dataset.screen = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------- API Deezer (JSONP : marche sans serveur, même en file://) ----------
  const API = 'https://api.deezer.com';
  let jsonpId = 0;
  function jsonp(path, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const cb = `__dz${Date.now()}_${jsonpId++}`;
      const script = document.createElement('script');
      const done = () => { clearTimeout(timer); script.remove(); window[cb] = () => {}; };
      const timer = setTimeout(() => { done(); reject(new Error('Deezer ne répond pas, réessaie dans un instant.')); }, timeout);
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

  const toArtist = (a) => ({ type: 'artist', id: a.id, name: a.name, picture: a.picture_medium || a.picture || '', fans: a.nb_fan || 0 });

  /** Trie les résultats Deezer : nom identique d'abord, puis le plus de fans (évite les homonymes). */
  function bestFirst(list, q) {
    const nq = norm(q).replace(/\s+/g, '');
    const score = (a) => (norm(a.name).replace(/\s+/g, '') === nq ? 1e12 : 0) + (a.fans || 0);
    return list.slice().sort((a, b) => score(b) - score(a));
  }

  const api = {
    async search(q, limit = 12) {
      const res = await jsonp(`/search/artist?q=${encodeURIComponent(q)}&limit=${Math.max(limit, 15)}`);
      return bestFirst((res.data || []).map(toArtist), q).slice(0, limit);
    },
    async track(id) {
      try { return await jsonp(`/track/${id}`); } catch { return null; }
    },
    async artist(id) { return toArtist(await jsonp(`/artist/${id}`)); },
    async related(id) {
      try { const res = await jsonp(`/artist/${id}/related?limit=20`); return (res.data || []).map((a) => a.name); } catch { return []; }
    },
    // v2 : l'ancien cache pouvait contenir des homonymes (mauvaises photos)
    presetCache: store.get('presetCache2', {}),
    async resolve(name) {
      if (this.presetCache[name]) return this.presetCache[name];
      const [first] = await this.search(name, 1);
      if (!first) throw new Error(`Artiste introuvable : ${name}`);
      this.presetCache[name] = first;
      store.set('presetCache2', this.presetCache);
      return first;
    },
  };

  // Playlists « charts » de Deezer (le classement dépend du pays du joueur)
  const CHARTS = [
    { type: 'chart', id: 0, name: 'Top du moment', emoji: '🔥', desc: 'Les titres les plus écoutés' },
    { type: 'chart', id: 116, name: 'Top Rap', emoji: '🎤', desc: 'Rap & Hip-Hop' },
    { type: 'chart', id: 132, name: 'Top Pop', emoji: '💃', desc: 'Les hits pop' },
    { type: 'chart', id: 165, name: 'Top R&B', emoji: '💜', desc: 'R&B, soul' },
    { type: 'chart', id: 113, name: 'Top Dance', emoji: '🪩', desc: 'Dance & électro' },
    { type: 'chart', id: 152, name: 'Top Rock', emoji: '🎸', desc: 'Rock' },
  ];
  const sourceKey = (s) => `${s.type === 'chart' ? 'c' : 'a'}${s.id}`;

  const CACHE_TTL = 10 * 60 * 1000; // les liens d'extraits Deezer expirent : on recharge après 10 min
  const trackCache = new Map();
  const SKIP = /^(intro|outro|interlude|skit|instrumental)\b/i;

  /** Ajoute des morceaux Deezer à la liste en retirant les doublons (remix, live, versions…). */
  function addTracks(list, raw, source, seen, album) {
    for (const t of raw) {
      if (!t || !t.preview || t.readable === false) continue;
      if (album && album !== 'search' && source.type === 'artist' && t.artist && t.artist.id && t.artist.id !== source.id) continue;
      // recherche par nom : on garde les titres de l'artiste et ses featurings
      if (album === 'search' && !(t.artist && t.artist.id === source.id) && !norm(t.title).includes(norm(source.name))) continue;
      const title = t.title_short || t.title;
      const n = norm(title);
      if (!n || SKIP.test(n)) continue;
      const artistName = (t.artist && t.artist.name) || source.name;
      const key = `${n}|${source.type === 'chart' ? artistName : ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const alb = (album && album !== 'search' ? album : t.album) || {};
      list.push({
        id: t.id, title, norm: n, preview: t.preview, link: t.link || `https://www.deezer.com/track/${t.id}`,
        album: alb.title || '',
        cover: alb.cover_big || alb.cover_medium || '',
        coverSmall: alb.cover_small || alb.cover_medium || '',
        artistName,
        group: sourceKey(source),
        rank: t.rank || 0,
        explicit: !!t.explicit_lyrics,
        duration: t.duration || 0,
      });
    }
  }

  /** Exécute des tâches asynchrones avec au plus `n` en parallèle. */
  async function pool(items, n, fn) {
    const out = [];
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) { const k = i++; try { out[k] = await fn(items[k], k); } catch { out[k] = null; } }
    }));
    return out;
  }

  /**
   * Récupère les morceaux d'une source.
   * size : '50' (les hits), '100' (top 100) ou 'all' (top 100 + tous les albums, EP et singles).
   */
  async function fetchTracks(source, size, onProgress) {
    const key = `${sourceKey(source)}:${size}`;
    const hit = trackCache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL) return hit.tracks;
    const seen = new Set();
    const tracks = [];
    if (source.type === 'chart') {
      const res = await jsonp(`/chart/${source.id}/tracks?limit=100`);
      addTracks(tracks, res.data || [], source, seen);
    } else {
      const top = await jsonp(`/artist/${source.id}/top?limit=${size === '50' ? 50 : 100}`);
      addTracks(tracks, top.data || [], source, seen);
      if (size === 'all') {
        // toute la discographie : albums et EP d'abord, puis les singles
        const res = await jsonp(`/artist/${source.id}/albums?limit=150`);
        const rank = { album: 0, ep: 1, single: 2 };
        const albums = (res.data || [])
          .filter((a) => a.record_type in rank)
          .sort((a, b) => rank[a.record_type] - rank[b.record_type] || (b.fans || 0) - (a.fans || 0))
          .slice(0, 45);
        let done = 0;
        const lists = await pool(albums, 6, async (alb) => {
          const r = await jsonp(`/album/${alb.id}/tracks?limit=100`);
          if (onProgress) onProgress(`${source.name} : album ${++done}/${albums.length}`);
          return { alb, data: r.data || [] };
        });
        lists.forEach((l) => l && addTracks(tracks, l.data, source, seen, l.alb));
        // en plus : les titres où l'artiste apparaît (featurings, morceaux hors albums)
        const q = encodeURIComponent(`artist:"${source.name}"`);
        const extra = await pool([0, 100, 200], 3, (index) => jsonp(`/search/track?q=${q}&limit=100&index=${index}`));
        extra.forEach((r) => r && addTracks(tracks, r.data || [], source, seen, 'search'));
        if (onProgress) onProgress(`${source.name} : ${tracks.length} morceaux`);
      }
    }
    trackCache.set(key, { at: Date.now(), tracks });
    return tracks;
  }

  // ---------- Création des questions ----------
  const DIFFICULTY = {
    easy: { time: 20, randomStart: false, label: 'Facile' },
    normal: { time: 12, randomStart: false, label: 'Normal' },
    hard: { time: 6, randomStart: true, label: 'Difficile' },
  };
  const MODES = { classic: 'Classique', survival: 'Survie', chrono: 'Chrono', online: 'En ligne', battle: 'Battle', theme: 'Battle à thème' };

  /** Charge tous les morceaux des sources choisies et prépare le « pool » de questions. */
  async function loadPool(sources, { pool: size, guess }, onProgress) {
    const lists = await Promise.all(sources.map((s) => fetchTracks(s, String(size), onProgress)));
    const tracks = lists.flat();
    const groups = new Map();
    tracks.forEach((t) => { if (!groups.has(t.group)) groups.set(t.group, []); groups.get(t.group).push(t); });
    const artistNames = new Map(); // nom normalisé -> nom affiché
    tracks.forEach((t) => artistNames.set(norm(t.artistName), t.artistName));
    if (guess === 'artist') {
      // pour « Qui chante ? », on ajoute des artistes proches comme mauvaises réponses
      const rel = await Promise.all(sources.filter((s) => s.type === 'artist').map((s) => api.related(s.id)));
      rel.flat().forEach((n) => { if (!artistNames.has(norm(n))) artistNames.set(norm(n), n); });
    }
    const multiArtist = new Set(tracks.map((t) => norm(t.artistName))).size > 1;
    const poolObj = { sources, tracks, groups, count: tracks.length, artistNames: [...artistNames.values()], multiArtist, guess };
    if (guess === 'artist' && poolObj.artistNames.length < 4) throw new Error("Pas assez d'artistes différents pour « Qui chante ? ». Ajoute d'autres artistes ou choisis une playlist.");
    if (tracks.length < 4) throw new Error('Pas assez de morceaux avec un extrait. Essaie « Toute la disco » ou ajoute un autre artiste.');
    return poolObj;
  }

  /** Construit une question à 4 choix pour un morceau donné. */
  function makeQuestion(pool, track) {
    if (pool.guess === 'artist') {
      const correct = track.artistName;
      const others = shuffle(pool.artistNames.filter((n) => norm(n) !== norm(correct))).slice(0, 3);
      const labels = shuffle([correct, ...others]);
      return {
        choices: labels.map((l) => ({ label: l })),
        correctIndex: labels.indexOf(correct),
        hint: `Le titre : « ${track.title} »`,
        prompt: 'Qui chante ce morceau ?',
      };
    }
    const same = pool.groups.get(track.group) || [];
    // mauvaises réponses chez le même artiste si possible (plus dur !)
    const source = new Set(same.map((t) => t.norm)).size >= 4 ? same : pool.tracks;
    const wrong = [];
    const used = new Set([track.norm]);
    for (const t of shuffle(source)) {
      if (used.has(t.norm)) continue;
      used.add(t.norm);
      wrong.push(t);
      if (wrong.length === 3) break;
    }
    const opts = shuffle([track, ...wrong]);
    const words = track.title.trim().split(/\s+/).length;
    return {
      choices: opts.map((t) => ({ label: t.title, sub: pool.multiArtist ? t.artistName : '' })),
      correctIndex: opts.indexOf(track),
      hint: `Commence par « ${track.title.trim()[0].toUpperCase()} » · ${words} mot${words > 1 ? 's' : ''}`,
      prompt: 'Quel est ce titre ?',
    };
  }

  /** Mélange en mettant d'abord les morceaux pas encore entendus récemment. */
  function freshShuffle(tracks) {
    const played = new Set(store.get('played', []));
    const mixed = shuffle(tracks);
    return [...mixed.filter((t) => !played.has(t.id)), ...mixed.filter((t) => played.has(t.id))];
  }
  function markPlayed(ids) {
    const list = store.get('played', []).filter((id) => !ids.includes(id));
    store.set('played', [...list, ...ids].slice(-1500));
  }

  const pointsFor = ({ elapsed, time, streak, hinted }) => {
    const speed = Math.round(100 * Math.max(0, 1 - elapsed / time));
    const mult = streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1;
    return Math.round((100 + speed) * mult * (hinted ? 0.5 : 1));
  };
  const multiplierFor = (streak) => (streak >= 5 ? 2 : streak >= 3 ? 1.5 : 1);

  // ---------- Volume & effets sonores (Web Audio, aucun fichier) ----------
  const sound = {
    volume: store.get('volume', 0.8),
    muted: store.get('muted', false),
  };
  let audioCtx;
  function sfx(type) {
    if (sound.muted || sound.volume === 0) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const now = audioCtx.currentTime;
      const notes = {
        good: [[660, 0], [880, 0.08], [1320, 0.16]],
        bad: [[220, 0], [150, 0.13]],
        tick: [[1100, 0]],
        end: [[523, 0], [659, 0.12], [784, 0.24], [1046, 0.36]],
        join: [[880, 0], [1320, 0.08]],
        pop: [[1500, 0]],
        badge: [[784, 0], [988, 0.1], [1175, 0.2], [1568, 0.3]],
      }[type] || [];
      for (const [freq, at] of notes) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = type === 'bad' ? 'sawtooth' : 'triangle';
        osc.frequency.value = freq;
        const len = type === 'tick' || type === 'pop' ? 0.05 : 0.16;
        const peak = (type === 'tick' || type === 'pop' ? 0.07 : 0.16) * sound.volume;
        gain.gain.setValueAtTime(0.0001, now + at);
        gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), now + at + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + at + len);
        osc.connect(gain).connect(audioCtx.destination);
        osc.start(now + at);
        osc.stop(now + at + len + 0.02);
      }
    } catch { /* Web Audio indisponible */ }
  }

  // ---------- Confettis ----------
  let confettiParts = [];
  let confettiRaf = 0;
  function confetti(count = 140, origin) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = $('#confetti');
    const ctx = cv.getContext('2d');
    const resize = () => { cv.width = Math.round(innerWidth * devicePixelRatio); cv.height = Math.round(innerHeight * devicePixelRatio); };
    resize();
    const colors = ['#ff2e93', '#8b5cf6', '#22d3ee', '#facc15', '#34d399', '#fb7185'];
    for (let i = 0; i < count; i++) {
      confettiParts.push({
        x: origin ? origin.x : innerWidth * (0.2 + Math.random() * 0.6), y: origin ? origin.y : innerHeight * 0.35,
        vx: (Math.random() - 0.5) * (origin ? 10 : 14), vy: -Math.random() * (origin ? 9 : 14) - 3,
        r: 4 + Math.random() * 5, a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
        c: colors[rand(colors.length)], life: 0,
      });
    }
    cancelAnimationFrame(confettiRaf);
    const step = () => {
      if (cv.width !== Math.round(innerWidth * devicePixelRatio) || cv.height !== Math.round(innerHeight * devicePixelRatio)) resize();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      confettiParts = confettiParts.filter((p) => p.y < innerHeight + 20 && p.life < 300);
      for (const p of confettiParts) {
        p.vy += 0.35; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; p.life++;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
        ctx.restore();
      }
      if (confettiParts.length) confettiRaf = requestAnimationFrame(step);
      else { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); }
    };
    step();
  }

  // ---------- Compte à rebours 3D avant une partie ----------
  function countdown(from = 3) {
    return new Promise((resolve) => {
      const el = $('#countdown');
      el.classList.remove('hidden');
      let n = from;
      const step = () => {
        el.innerHTML = `<span class="cd-num">${n > 0 ? n : 'GO !'}</span>`;
        sfx(n > 0 ? 'tick' : 'good');
        if (n-- > 0) setTimeout(step, 750);
        else setTimeout(() => { el.classList.add('hidden'); el.innerHTML = ''; resolve(); }, 550);
      };
      step();
    });
  }

  // ---------- Fenêtre de confirmation (remplace confirm()) ----------
  function confirmBox(text, { ok = 'Oui', cancel = 'Annuler', danger = false } = {}) {
    return new Promise((resolve) => {
      const d = $('#confirmDialog');
      $('#confirmText').textContent = text;
      const okBtn = $('#confirmOk');
      okBtn.textContent = ok;
      okBtn.classList.toggle('btn-danger', danger);
      $('#confirmCancel').textContent = cancel;
      const finish = (v) => { d.close(); okBtn.onclick = null; $('#confirmCancel').onclick = null; d.onclose = null; resolve(v); };
      okBtn.onclick = () => finish(true);
      $('#confirmCancel').onclick = () => finish(false);
      d.onclose = () => resolve(false);
      d.showModal();
      okBtn.focus();
    });
  }

  // ---------- Compteur animé (score de fin) ----------
  function countUp(el, to, ms = 1200) {
    const start = performance.now();
    const tick = (now) => {
      const k = Math.min(1, (now - start) / ms);
      el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // Effets 3D : remplacés par fx3d.js quand Three.js est chargé
  const FX = { pulse() {}, burst() {}, setCovers() {} };

  // ---------- Profil ----------
  const AVATARS = ['🎧', '🎤', '🦁', '🐺', '🐯', '🦊', '🐼', '🐸', '👽', '🤖', '👑', '🔥', '💎', '🎸', '🥷', '😈', '🐙', '🦄', '🍕', '⚡'];
  const profile = Object.assign({ name: '', avatar: AVATARS[rand(AVATARS.length)] }, store.get('profile', {}));
  const saveProfile = () => store.set('profile', profile);
  const displayName = () => profile.name.trim() || 'Joueur';

  // ---------- Succès ----------
  const BADGES = [
    { id: 'first', icon: '🎧', name: 'Première écoute', desc: 'Termine ta première partie.' },
    { id: 'perfect', icon: '💯', name: 'Sans faute', desc: '100 % de bonnes réponses sur au moins 10 questions.' },
    { id: 'streak10', icon: '🔥', name: 'En feu', desc: '10 bonnes réponses d\'affilée.' },
    { id: 'speed', icon: '⚡', name: 'Shazam humain', desc: 'Trouve un titre en moins de 1,5 seconde.' },
    { id: 'survivor', icon: '❤️', name: 'Survivant', desc: '20 bonnes réponses en mode Survie.' },
    { id: 'flash', icon: '⏱️', name: 'Flash', desc: '20 titres trouvés en mode Chrono.' },
    { id: 'hardcore', icon: '💀', name: 'Hardcore', desc: 'Au moins 80 % en Difficile sur 10 questions ou plus.' },
    { id: 'nojoker', icon: '🧠', name: 'Sans filet', desc: 'Termine une partie de 10 questions ou plus à au moins 80 % sans joker.' },
    { id: 'whois', icon: '🎤', name: 'Oreille absolue', desc: 'Au moins 80 % en « Qui chante ? » sur 10 questions ou plus.' },
    { id: 'online', icon: '🌐', name: 'En réseau', desc: 'Joue une partie en ligne.' },
    { id: 'champion', icon: '👑', name: 'Champion', desc: 'Gagne une partie en ligne contre au moins 1 joueur.' },
    { id: 'battle', icon: '⚔️', name: 'Gladiateur', desc: 'Termine une battle de 5 duels ou plus.' },
    { id: 'mindreader', icon: '🧠', name: 'Télépathe', desc: "Sois d'accord avec l'IA sur tous les duels d'une battle (5 ou plus)." },
    { id: 'explorer', icon: '🧭', name: 'Explorateur', desc: 'Joue avec 10 artistes ou playlists différents.' },
  ];
  const unlocked = store.get('badges', {});
  function unlock(id) {
    if (unlocked[id]) return;
    const b = BADGES.find((x) => x.id === id);
    if (!b) return;
    unlocked[id] = Date.now();
    store.set('badges', unlocked);
    setTimeout(() => { sfx('badge'); toast(`Succès débloqué : ${b.name}`, { icon: b.icon, type: 'gold', ms: 4000 }); }, 600);
  }

  function trackPlayed(sources) {
    const seen = new Set(store.get('playedSources', []));
    sources.forEach((s) => seen.add(sourceKey(s)));
    store.set('playedSources', [...seen]);
    if (seen.size >= 10) unlock('explorer');
  }

  // ---------- Paramètres d'URL (lus une seule fois au démarrage) ----------
  const urlParams = new URLSearchParams(location.search);

  Object.assign(BT, {
    $, $$, rand, shuffle, esc, initials, fmtFans, fmtSec, sleep, norm, store, toast, show,
    jsonp, api, CHARTS, sourceKey, fetchTracks, loadPool, makeQuestion, pointsFor, multiplierFor,
    DIFFICULTY, MODES, sound, sfx, confetti, AVATARS, profile, saveProfile, displayName,
    BADGES, unlocked, unlock, trackPlayed, urlParams, countdown, confirmBox, countUp, FX, pool, freshShuffle, markPlayed,
  });
})();
