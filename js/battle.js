/* =========================================================
   battle.js : modes ⚔️ Battle et 🎲 Battle à thème.
   - Deux sons s'affrontent (même artiste ou artistes différents).
   - On écoute les deux extraits et on vote pour le meilleur.
   - En Battle à thème, un thème est tiré au hasard
     (« pour la salle de sport », « pour un chagrin d'amour »…).
   - Une IA donne son verdict :
       • par défaut, l'IA intégrée (gratuite, hors ligne) analyse le tempo
         (BPM), la popularité, l'année et les paroles de chaque son ;
       • si le joueur a ajouté sa clé d'API Claude dans son profil,
         c'est Claude qui juge et explique son choix.
   Ce fichier contient aussi l'écran du duel, réutilisé en ligne.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, store, show, toast, shuffle, rand } = BT;

  // ---------- Thèmes ----------
  // crit : critères de l'IA intégrée. k = info du son, dir = +1 (plus c'est haut, mieux c'est) ou -1,
  // target = valeur idéale (tempo), w = importance.
  const THEMES = [
    { emoji: '🏋️', label: 'Pour se motiver à la salle', crit: [{ k: 'bpm', dir: 1, w: 2 }, { k: 'pop', dir: 1, w: 0.5 }] },
    { emoji: '🎉', label: 'Pour ambiancer une soirée', crit: [{ k: 'bpm', target: 122, w: 1.5 }, { k: 'pop', dir: 1, w: 1.2 }] },
    { emoji: '🌙', label: 'Pour rouler de nuit', crit: [{ k: 'bpm', target: 95, w: 1.2 }, { k: 'year', dir: 1, w: 0.4 }] },
    { emoji: '💔', label: "Pour un chagrin d'amour", crit: [{ k: 'bpm', dir: -1, w: 1.5 }, { k: 'explicit', dir: -1, w: 0.3 }] },
    { emoji: '🕰️', label: 'Le plus nostalgique', crit: [{ k: 'year', dir: -1, w: 2 }, { k: 'pop', dir: 1, w: 0.4 }] },
    { emoji: '🔥', label: 'Le plus gros banger', crit: [{ k: 'pop', dir: 1, w: 1.6 }, { k: 'bpm', dir: 1, w: 0.8 }] },
    { emoji: '☀️', label: "Le son de l'été", crit: [{ k: 'bpm', target: 110, w: 1.2 }, { k: 'year', dir: 1, w: 0.6 }, { k: 'pop', dir: 1, w: 0.6 }] },
    { emoji: '😌', label: 'Pour se détendre', crit: [{ k: 'bpm', dir: -1, w: 1.6 }, { k: 'explicit', dir: -1, w: 0.4 }] },
    { emoji: '🚿', label: 'À chanter sous la douche', crit: [{ k: 'pop', dir: 1, w: 2 }] },
    { emoji: '👑', label: 'Le plus culte', crit: [{ k: 'pop', dir: 1, w: 1.4 }, { k: 'year', dir: -1, w: 1 }] },
    { emoji: '🆕', label: 'Le plus frais, le plus actuel', crit: [{ k: 'year', dir: 1, w: 2 }] },
    { emoji: '🎮', label: 'Pour jouer à la console', crit: [{ k: 'bpm', dir: 1, w: 1.4 }, { k: 'explicit', dir: 1, w: 0.3 }] },
    { emoji: '📚', label: 'Pour réviser', crit: [{ k: 'bpm', dir: -1, w: 1.2 }, { k: 'explicit', dir: -1, w: 1 }] },
    { emoji: '👨‍👩‍👧', label: 'À passer en famille', crit: [{ k: 'explicit', dir: -1, w: 2 }, { k: 'pop', dir: 1, w: 0.8 }] },
    { emoji: '😤', label: 'Le plus sombre, le plus dur', crit: [{ k: 'explicit', dir: 1, w: 1.4 }, { k: 'bpm', dir: -1, w: 0.5 }] },
    { emoji: '💃', label: 'Pour danser', crit: [{ k: 'bpm', target: 118, w: 2 }] },
    { emoji: '🚗', label: 'Pour un road trip', crit: [{ k: 'pop', dir: 1, w: 1 }, { k: 'bpm', target: 105, w: 1 }] },
    { emoji: '🌧️', label: 'Pour un jour de pluie', crit: [{ k: 'bpm', dir: -1, w: 1.2 }, { k: 'year', dir: -1, w: 0.5 }] },
    { emoji: '🎤', label: 'Le meilleur refrain', crit: [{ k: 'pop', dir: 1, w: 1.8 }] },
    { emoji: '🛌', label: "Pour s'endormir", crit: [{ k: 'bpm', dir: -1, w: 2 }, { k: 'dur', dir: 1, w: 0.5 }] },
    { emoji: '💪', label: 'Pour se donner de la force', crit: [{ k: 'bpm', dir: 1, w: 1 }, { k: 'pop', dir: 1, w: 0.7 }, { k: 'explicit', dir: 1, w: 0.3 }] },
    { emoji: '🎬', label: 'Pour une scène de film', crit: [{ k: 'dur', dir: 1, w: 0.8 }, { k: 'pop', dir: 1, w: 0.8 }, { k: 'bpm', target: 100, w: 0.5 }] },
  ];
  const CLASSIC = { emoji: '⚔️', label: 'Le meilleur son', crit: [{ k: 'pop', dir: 1, w: 1.5 }, { k: 'bpm', target: 115, w: 0.5 }, { k: 'year', dir: 1, w: 0.2 }] };
  const randomTheme = () => THEMES[rand(THEMES.length)];

  // ---------- Préparation des duels ----------
  /** Construit un duel. mode 'same' = deux sons du même artiste, 'diff' = deux artistes différents. */
  function buildDuel(pool, mode, used) {
    const free = pool.tracks.filter((t) => !used.has(t.id));
    const byArtist = new Map();
    free.forEach((t) => { const k = BT.norm(t.artistName); if (!byArtist.has(k)) byArtist.set(k, []); byArtist.get(k).push(t); });
    // les « hits » d'abord : on pioche parmi les mieux classés
    const hits = (list) => list.slice().sort((x, y) => (y.rank || 0) - (x.rank || 0)).slice(0, Math.max(8, Math.ceil(list.length * 0.6)));
    let a; let b;
    if (mode === 'same') {
      const groups = [...byArtist.values()].filter((l) => l.length >= 2);
      if (!groups.length) return null;
      const g = hits(groups[rand(groups.length)]);
      [a, b] = shuffle(g).slice(0, 2);
    } else {
      const artists = [...byArtist.keys()];
      if (artists.length < 2) return null;
      const [ka, kb] = shuffle(artists).slice(0, 2);
      a = shuffle(hits(byArtist.get(ka)))[0];
      b = shuffle(hits(byArtist.get(kb)))[0];
    }
    if (!a || !b) return null;
    used.add(a.id); used.add(b.id);
    return { a, b };
  }

  function checkPool(pool, mode) {
    const artists = new Set(pool.tracks.map((t) => BT.norm(t.artistName)));
    if (mode === 'diff' && artists.size < 2) throw new Error('Pour des duels entre artistes différents, choisis au moins 2 artistes (ou une playlist).');
    if (pool.tracks.length < 2) throw new Error('Pas assez de morceaux pour une battle.');
  }

  const slim = (t) => ({ id: t.id, title: t.title, artistName: t.artistName, album: t.album, cover: t.cover, coverSmall: t.coverSmall, link: t.link, preview: t.preview, rank: t.rank || 0, explicit: !!t.explicit, duration: t.duration || 0 });

  // =========================================================
  //  L'IA JUGE
  // =========================================================
  async function details(t) {
    const d = await BT.api.track(t.id);
    const year = d && d.release_date ? +d.release_date.slice(0, 4) : 0;
    return {
      bpm: d && d.bpm > 40 ? Math.round(d.bpm) : 0,
      year: year > 1900 ? year : 0,
      rank: (d && d.rank) || t.rank || 0,
      explicit: d ? !!d.explicit_lyrics : !!t.explicit,
      dur: (d && d.duration) || t.duration || 0,
    };
  }

  const PHRASES = {
    'pop+': () => 'il est plus populaire, plus écouté sur Deezer',
    'pop-': () => 'il est moins connu, plus pointu',
    'bpm+': (w, l) => `il envoie plus d'énergie (${w.bpm} BPM contre ${l.bpm})`,
    'bpm-': (w, l) => `il est plus posé (${w.bpm} BPM contre ${l.bpm})`,
    'bpm=': (w, l) => `son tempo colle mieux à l'ambiance (${w.bpm} BPM contre ${l.bpm})`,
    'year+': (w, l) => `il est plus récent (${w.year} contre ${l.year})`,
    'year-': (w, l) => `il a plus le parfum d'époque (${w.year} contre ${l.year})`,
    'explicit-': () => 'il est plus « propre », sans paroles explicites',
    'explicit+': () => 'il est plus brut, sans filtre',
    'dur+': () => 'il prend plus son temps, plus planant',
    'dur-': () => 'il est plus court et efficace',
  };

  /** Valeur (0 à 1) d'un son pour un critère du thème, ou null si l'info manque. */
  function critVal(c, f) {
    if (c.k === 'pop') return Math.min(1, Math.log10((f.rank || 0) + 10) / 6.2);
    if (c.k === 'bpm') {
      if (!f.bpm) return null;
      return c.target ? Math.max(0, 1 - Math.abs(f.bpm - c.target) / 70) : Math.min(1, f.bpm / 190);
    }
    if (c.k === 'year') return f.year ? Math.min(1, Math.max(0, (f.year - 1960) / 70)) : null;
    if (c.k === 'explicit') return f.explicit ? 1 : 0;
    if (c.k === 'dur') return f.dur ? Math.min(1, f.dur / 420) : null;
    return null;
  }

  /** L'IA intégrée : un score par critère du thème, puis une explication. */
  function localJudge(theme, a, b, fa, fb) {
    const val = critVal;
    let sa = (Math.random() - 0.5) * 0.04;
    let sb = (Math.random() - 0.5) * 0.04;
    let best = null;
    for (const c of theme.crit) {
      const va = val(c, fa);
      const vb = val(c, fb);
      if (va === null || vb === null) continue;
      const dir = c.target ? 1 : c.dir;
      sa += c.w * dir * va;
      sb += c.w * dir * vb;
      const gap = c.w * dir * (va - vb);
      if (!best || Math.abs(gap) > Math.abs(best.gap)) best = { c, gap };
    }
    const pick = sa >= sb ? 'a' : 'b';
    const [w, l, fw, fl] = pick === 'a' ? [a, b, fa, fb] : [b, a, fb, fa];
    let why = 'il a ce petit truc en plus';
    if (best && Math.abs(best.gap) > 0.01) {
      const c = best.c;
      const key = c.target ? `${c.k}=` : `${c.k}${c.dir > 0 ? '+' : '-'}`;
      if (PHRASES[key]) why = PHRASES[key](fw, fl);
    }
    const close = Math.abs(sa - sb) < 0.08;
    const intro = close ? ['Ça se joue à rien, mais', 'Duel serré ! Je dirais', 'Dur dur… allez,'][rand(3)] : ['Sans hésiter :', 'Pour moi, c\'est clair :', 'Verdict :'][rand(3)];
    const because = /^[aeiouyéèh]/i.test(why) ? "parce qu'" : 'parce que ';
    return { pick, reason: `${intro} « ${w.title} » de ${w.artistName}, ${because}${why}.`, by: 'local' };
  }

  // ---------- Claude (si le joueur a mis sa clé d'API dans son profil) ----------
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.5.0/+esm';
  let clientPromise = null;
  let clientKey = '';
  function claudeClient(key) {
    if (!clientPromise || clientKey !== key) {
      clientKey = key;
      clientPromise = import(SDK_URL).then((mod) => {
        const Anthropic = mod.default || mod.Anthropic;
        // la clé reste dans le navigateur du joueur (jamais envoyée ailleurs qu'à l'API Anthropic)
        return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
      });
    }
    return clientPromise;
  }

  const describe = (t, f) => `« ${t.title} » de ${t.artistName}${t.album ? ` (album « ${t.album} »)` : ''}${f.year ? `, sorti en ${f.year}` : ''}${f.bpm ? `, ${f.bpm} BPM` : ''}, popularité Deezer ${f.rank || 'inconnue'}${f.explicit ? ', paroles explicites' : ''}`;

  async function claudeJudge(key, theme, a, b, fa, fb) {
    const client = await claudeClient(key);
    const prompt = `Tu es le juge d'un jeu de « battle musicale » entre amis.
Thème du duel : ${theme.label}.
Son A : ${describe(a, fa)}.
Son B : ${describe(b, fb)}.
Choisis le son qui correspond le mieux au thème, en t'appuyant sur ce que tu sais de ces morceaux (ambiance, paroles, énergie, place dans la culture). Donne la raison en français, en une phrase courte, fun et précise (25 mots maximum), en tutoyant les joueurs.`;
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { winner: { type: 'string', enum: ['A', 'B'] }, reason: { type: 'string' } },
            required: ['winner', 'reason'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') throw new Error('refusal');
    const block = res.content.find((x) => x.type === 'text');
    const out = JSON.parse(block.text);
    return { pick: out.winner === 'B' ? 'b' : 'a', reason: String(out.reason).slice(0, 220), by: 'claude' };
  }

  /** Verdict complet : IA (Claude ou intégrée) + avis du public (popularité Deezer). */
  async function judge(theme, a, b) {
    const [fa, fb] = await Promise.all([details(a), details(b)]);
    const th = theme || CLASSIC;
    const pub = (fa.rank || 0) === (fb.rank || 0) ? (Math.random() < 0.5 ? 'a' : 'b') : (fa.rank > fb.rank ? 'a' : 'b');
    const key = store.get('aiKey', '');
    let ai = null;
    if (key) {
      try {
        ai = await Promise.race([claudeJudge(key, th, a, b, fa, fb), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))]);
      } catch (e) {
        if (!judge.warned) { judge.warned = true; toast("L'IA Claude ne répond pas (clé invalide ou pas de réseau) : l'IA intégrée prend le relais.", { icon: '🤖', ms: 5000 }); }
      }
    }
    if (!ai) ai = localJudge(th, a, b, fa, fb);
    return { ai, public: pub, info: { a: fa, b: fb } };
  }

  // =========================================================
  //  NOTER PLUSIEURS SONS EN % (mode Défi thème)
  // =========================================================
  const LETTERS = 'ABCDEFGHIJKL';

  /** Répartit 100 % entre les sons, en corrigeant les arrondis. */
  function toPercents(values) {
    const sum = values.reduce((x, y) => x + Math.max(0, y), 0) || 1;
    const raw = values.map((v) => (Math.max(0, v) / sum) * 100);
    const out = raw.map(Math.floor);
    let rest = 100 - out.reduce((x, y) => x + y, 0);
    raw.map((v, i) => [v - Math.floor(v), i]).sort((x, y) => y[0] - x[0]).forEach(([, i]) => { if (rest > 0) { out[i]++; rest--; } });
    return out;
  }

  function localMany(theme, tracks, feats) {
    const scores = feats.map((f) => {
      let sc = (Math.random() - 0.5) * 0.04;
      theme.crit.forEach((c) => { const v = critVal(c, f); if (v !== null) sc += c.w * (c.target ? 1 : c.dir) * v; });
      return sc;
    });
    const mx = Math.max(...scores);
    const percents = toPercents(scores.map((x) => Math.exp(3.2 * (x - mx))));
    const order = percents.map((p, i) => i).sort((x, y) => percents[y] - percents[x]);
    const w = order[0];
    let reason;
    if (tracks.length === 1) reason = `Un seul son proposé : « ${tracks[0].title} » remporte la manche.`;
    else {
      const l = order[1];
      // on réutilise l'explication du duel entre les deux premiers
      const duel = localJudge(theme, tracks[w], tracks[l], feats[w], feats[l]);
      reason = duel.pick === 'a' ? duel.reason : `« ${tracks[w].title} » de ${tracks[w].artistName} a le meilleur score global pour ce thème.`;
    }
    return { percents, reason, by: 'local' };
  }

  async function claudeMany(key, theme, tracks, feats) {
    const client = await claudeClient(key);
    const letters = tracks.map((_, i) => LETTERS[i]);
    const list = tracks.map((t, i) => `Son ${letters[i]} : ${describe(t, feats[i])}.`).join('\n');
    const prompt = `Tu es le juge d'un jeu musical entre amis : chaque joueur a choisi le son qui, selon lui, colle le mieux au thème.
Thème : ${theme.label}.
${list}
Donne à chaque son un pourcentage (le total doit faire 100) selon à quel point il correspond au thème, en t'appuyant sur ce que tu sais de ces morceaux (ambiance, paroles, énergie, place dans la culture). Explique ton choix du gagnant en français, en une phrase courte, fun et précise (30 mots maximum), en tutoyant les joueurs.`;
    const props = {};
    letters.forEach((l) => { props[l] = { type: 'integer' }; });
    const res = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: { percents: { type: 'object', properties: props, required: letters, additionalProperties: false }, reason: { type: 'string' } },
            required: ['percents', 'reason'],
            additionalProperties: false,
          },
        },
      },
      messages: [{ role: 'user', content: prompt }],
    });
    if (res.stop_reason === 'refusal') throw new Error('refusal');
    const block = res.content.find((x) => x.type === 'text');
    const out = JSON.parse(block.text);
    return { percents: toPercents(letters.map((l) => +out.percents[l] || 0)), reason: String(out.reason).slice(0, 240), by: 'claude' };
  }

  /** Note plusieurs sons pour un thème : { percents:[…], reason, by }. */
  async function judgeMany(theme, tracks) {
    if (!tracks.length) return { percents: [], reason: 'Aucun son proposé…', by: 'local' };
    const feats = await Promise.all(tracks.map(details));
    const key = store.get('aiKey', '');
    if (key && tracks.length > 1) {
      try {
        return await Promise.race([claudeMany(key, theme, tracks, feats), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 25000))]);
      } catch (e) {
        if (!judge.warned) { judge.warned = true; toast("L'IA Claude ne répond pas (clé invalide ou pas de réseau) : l'IA intégrée prend le relais.", { icon: '🤖', ms: 5000 }); }
      }
    }
    return localMany(theme, tracks, feats);
  }

  /** Le bot choisit un bon son pour le thème parmi quelques morceaux de la sélection (il peut se tromper). */
  async function botPick(theme, pool, avoid) {
    const cands = shuffle(pool.tracks.filter((t) => !avoid.has(t.id))).slice(0, 6);
    if (!cands.length) return null;
    const feats = await Promise.all(cands.map(details));
    const scored = cands.map((t, i) => {
      let sc = 0;
      theme.crit.forEach((c) => { const v = critVal(c, feats[i]); if (v !== null) sc += c.w * (c.target ? 1 : c.dir) * v; });
      return { t, sc };
    }).sort((x, y) => y.sc - x.sc);
    return Math.random() < 0.6 ? scored[0].t : scored[Math.min(1, scored.length - 1)].t;
  }

  // =========================================================
  //  ÉCRAN DU DUEL (solo et en ligne)
  // =========================================================
  const audio = $('#audio');
  const SEG = 12; // secondes d'écoute par son dans l'enchaînement automatique
  let duel = null;
  let raf = 0;

  function cardHtml(side, t, online) {
    return `
      <div class="dc-art">
        ${t.cover ? `<img src="${esc(t.cover)}" alt="">` : '<div class="dc-noart">♪</div>'}
        <button class="dc-play" type="button" aria-label="Écouter le son ${side.toUpperCase()}">▶</button>
        <span class="dc-side">${side.toUpperCase()}</span>
      </div>
      <div class="dc-bar"><i></i></div>
      <div class="dc-info"><b class="dc-title">${esc(t.title)}</b><span class="dc-artist">${esc(t.artistName)}${t.album ? ' · ' + esc(t.album) : ''}</span></div>
      <button class="btn dc-vote" type="button">${online ? 'Je vote' : 'Je choisis'} ${side.toUpperCase()}</button>
      <div class="dc-votes"></div>
      <div class="dc-crown">👑</div>`;
  }

  function playSide(side, sequence) {
    if (!duel) return;
    duel.playing = side;
    duel.sequence = sequence;
    const t = duel[side];
    audio.src = t.preview;
    audio.currentTime = 0;
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
    $$('.duel-card').forEach((c) => c.classList.toggle('playing', c.dataset.side === side));
    duel.segStart = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  }

  function tick() {
    if (!duel || !duel.playing) return;
    const side = duel.playing;
    const k = Math.min(1, (audio.currentTime || 0) / SEG);
    const bar = $(`.duel-card[data-side="${side}"] .dc-bar i`);
    if (bar) bar.style.width = `${k * 100}%`;
    if (k >= 1 || audio.ended) {
      if (duel.sequence && side === 'a') { playSide('b', true); return; }
      audio.pause();
      duel.playing = null;
      $$('.duel-card').forEach((c) => c.classList.remove('playing'));
      return;
    }
    raf = requestAnimationFrame(tick);
  }

  const UI = {
    /** opts : { round, total, theme, a, b, online, onVote(side) } */
    showDuel(opts) {
      duel = { ...opts, voted: null, playing: null };
      $('#bProgress').textContent = `Duel ${opts.round + 1}/${opts.total}`;
      const th = $('#bTheme');
      if (opts.theme) {
        th.classList.remove('hidden');
        th.innerHTML = `<span class="theme-emoji">${esc(opts.theme.emoji)}</span><div><small>Thème du duel</small><b>${esc(opts.theme.label)}</b></div>`;
        th.style.animation = 'none'; void th.offsetWidth; th.style.animation = '';
      } else th.classList.add('hidden');
      ['a', 'b'].forEach((side) => {
        const card = $(`#duel${side.toUpperCase()}`);
        card.className = 'duel-card';
        card.dataset.side = side;
        card.innerHTML = cardHtml(side, opts[side], opts.online);
        card.querySelector('.dc-play').addEventListener('click', () => playSide(side, false));
        card.querySelector('.dc-vote').addEventListener('click', () => UI.vote(side));
      });
      $('#verdicts').innerHTML = '';
      $('#duelStatus').innerHTML = '🎧 Écoute les deux sons… tu peux voter quand tu veux.';
      $('#bNext').classList.add('hidden');
      setTimeout(() => { if (duel && duel.a === opts.a) playSide('a', true); }, 400);
    },
    vote(side) {
      if (!duel || duel.voted || duel.locked) return;
      duel.voted = side;
      $$('.duel-card').forEach((c) => { c.classList.toggle('chosen', c.dataset.side === side); c.querySelector('.dc-vote').disabled = true; });
      BT.sfx('pop');
      $('#duelStatus').innerHTML = duel.online ? '✅ Vote envoyé ! On attend les autres…' : '🤖 L\'IA réfléchit…';
      if (duel.onVote) duel.onVote(side);
    },
    lock() { if (duel) { duel.locked = true; $$('.dc-vote').forEach((b) => (b.disabled = true)); } },
    setStatus(html) { $('#duelStatus').innerHTML = html; },
    /** res : { winner, myPick, ai, public, votes:{a:[players], b:[players]}, points, room } */
    showResult(res) {
      UI.lock();
      ['a', 'b'].forEach((side) => {
        const card = $(`#duel${side.toUpperCase()}`);
        card.classList.toggle('winner', res.winner === side);
        card.classList.toggle('loser', res.winner !== side);
        const v = (res.votes && res.votes[side]) || [];
        card.querySelector('.dc-votes').innerHTML = v.map((p) => `<span class="vote-chip" title="${esc(p.name)}">${esc(p.avatar)}</span>`).join('');
      });
      const name = (side) => `${side.toUpperCase()} · « ${esc(duel[side].title)} »`;
      const lines = [];
      if (res.room) lines.push(`<div class="verdict"><span class="v-ico">👥</span><div><small>Le salon</small><b>${res.room}</b></div></div>`);
      lines.push(`<div class="verdict ai"><span class="v-ico">🤖</span><div><small>${res.ai.by === 'claude' ? 'IA Claude' : 'IA du jeu'} : ${name(res.ai.pick)}</small><b>${esc(res.ai.reason)}</b></div></div>`);
      lines.push(`<div class="verdict"><span class="v-ico">🌍</span><div><small>Le public Deezer</small><b>${name(res.public)} est le plus écouté</b></div></div>`);
      $('#verdicts').innerHTML = lines.join('');
      const crowned = $(`#duel${res.winner.toUpperCase()}`);
      const r = crowned.getBoundingClientRect();
      BT.confetti(60, { x: r.left + r.width / 2, y: r.top + 40 });
      BT.FX.pulse(res.myPick && res.myPick === res.winner ? 'ok' : 'none');
      $('#duelStatus').innerHTML = res.message || '';
      BT.sfx(res.points > 0 ? 'good' : 'pop');
    },
    next(label, fn) {
      const b = $('#bNext');
      b.textContent = label;
      b.onclick = () => { b.classList.add('hidden'); fn(); };
      b.classList.remove('hidden');
    },
    stop() { cancelAnimationFrame(raf); duel = null; audio.pause(); },
    setHud(items) {
      $('#bHud').innerHTML = items.map((it) => `<div class="hud-item" data-bhud="${it.id}"><span class="hud-label">${esc(it.label)}</span><b>${esc(it.value)}</b></div>`).join('');
    },
    updateHud(id, value) { const el = $(`[data-bhud="${id}"] b`); if (el) el.textContent = value; },
  };

  // =========================================================
  //  BATTLE EN SOLO
  // =========================================================
  let game = null;

  async function start(sources, opts) {
    BT.Quiz.stop();
    show('loading');
    $('#loadingText').textContent = `Préparation de la battle : ${sources.map((s) => s.name).join(', ')}…`;
    let pool;
    try {
      pool = await BT.loadPool(sources, { pool: opts.pool, guess: 'title' }, (txt) => { $('#loadingText').textContent = `Chargement… ${txt}`; });
      checkPool(pool, opts.duel);
    } catch (err) { BT.homeError(err.message); return; }
    BT.trackPlayed(sources);
    BT.addRecent(sources);
    const themed = opts.game === 'theme';
    game = { sources, opts, pool, themed, used: new Set(), index: -1, total: +opts.rounds, score: 0, agreeAI: 0, agreePublic: 0, history: [], over: false };
    BT.lastGame = { type: 'battle', sources, opts };
    document.body.dataset.playMode = 'solo';
    $('#bScoreboardWrap').classList.add('hidden');
    $('#bEmojiBar').classList.add('hidden');
    UI.setHud([
      { id: 'progress', label: 'Duel', value: `1/${game.total}` },
      { id: 'score', label: 'Score', value: 0 },
      { id: 'ai', label: 'Accord IA', value: 0 },
    ]);
    $('#duelA').innerHTML = ''; $('#duelB').innerHTML = ''; $('#bTheme').classList.add('hidden');
    $('#verdicts').innerHTML = '';
    $('#duelStatus').innerHTML = `🎵 ${pool.count} morceaux chargés`;
    show('battle');
    const g = game;
    await BT.countdown(3);
    if (game === g && !g.over) next();
  }

  function next() {
    const g = game;
    if (!g || g.over) return;
    UI.stop();
    g.index++;
    const d = g.index < g.total ? buildDuel(g.pool, g.opts.duel, g.used) : null;
    if (!d) { end(); return; }
    g.current = { ...d, theme: g.themed ? randomTheme() : null };
    UI.updateHud('progress', `${g.index + 1}/${g.total}`);
    UI.showDuel({ round: g.index, total: g.total, theme: g.current.theme, a: d.a, b: d.b, online: false, onVote: (side) => onVote(g, side) });
  }

  async function onVote(g, side) {
    const c = g.current;
    const verdict = await judge(c.theme, c.a, c.b);
    if (game !== g || g.over) return;
    const agreeAI = verdict.ai.pick === side;
    const agreePub = verdict.public === side;
    const points = g.themed ? (agreeAI ? 100 : 0) + (agreePub ? 50 : 0) : (agreePub ? 100 : 0) + (agreeAI ? 50 : 0);
    g.score += points;
    if (agreeAI) g.agreeAI++;
    if (agreePub) g.agreePublic++;
    const winner = g.themed ? verdict.ai.pick : verdict.public;
    const msgs = [];
    msgs.push(agreeAI ? "✅ Tu es d'accord avec l'IA" : "❌ L'IA n'est pas d'accord avec toi");
    msgs.push(agreePub ? '✅ Le public te donne raison' : '❌ Le public a préféré l\'autre');
    UI.showResult({ winner, myPick: side, ai: verdict.ai, public: verdict.public, points, message: `${msgs.join(' · ')}${points ? ` <b class="good">+${points} pts</b>` : ''}` });
    UI.updateHud('score', g.score);
    UI.updateHud('ai', `${g.agreeAI}/${g.index + 1}`);
    g.history.push({ c, side, verdict, points, winner });
    UI.next(g.index + 1 >= g.total ? 'Voir les résultats 🏁' : 'Duel suivant ➜', next);
  }

  function end() {
    const g = game;
    if (!g || g.over) return;
    g.over = true;
    UI.stop();
    BT.sfx('end');
    BT.markPlayed(g.history.flatMap((h) => [h.c.a.id, h.c.b.id]));
    const n = g.history.length;
    BT.saveScore({ name: BT.displayName(), avatar: BT.profile.avatar, score: g.score, correct: g.agreeAI, answered: n, mode: g.themed ? 'theme' : 'battle', difficulty: 'normal', artists: g.sources.map((s) => s.name), bestStreak: 0 });
    BT.unlock('first');
    if (n >= 5) BT.unlock('battle');
    if (n >= 5 && g.agreeAI === n) BT.unlock('mindreader');
    const pct = n ? Math.round((g.agreeAI / n) * 100) : 0;
    BT.Solo.showResults({
      emoji: pct >= 80 ? '🧠' : pct >= 50 ? '⚔️' : '🎲',
      title: pct >= 80 ? "En symbiose avec l'IA !" : pct >= 50 ? 'Belle battle !' : 'Tu as tes propres goûts 😎',
      sub: `${g.themed ? 'Battle à thème' : 'Battle'} · ${g.opts.duel === 'same' ? 'même artiste' : 'artistes différents'} · ${g.sources.map((s) => s.name).join(', ')}`,
      score: g.score,
      stats: [
        [`${g.agreeAI}/${n}`, "D'accord avec l'IA"],
        [`${g.agreePublic}/${n}`, 'D\'accord avec le public'],
        [`${n}`, 'Duels joués'],
        [`${pct}%`, 'Accord IA'],
      ],
      recap: g.history.map((h) => {
        const mine = h.c[h.side];
        return { track: h.c[h.winner], status: h.side === h.winner ? 'ok' : 'ko', detail: `${esc(h.c.a.title)} 🆚 ${esc(h.c.b.title)}${h.c.theme ? ` · ${esc(h.c.theme.emoji)} ${esc(h.c.theme.label)}` : ''} · ton choix : ${esc(mine.title)}${h.points ? ` · +${h.points} pts` : ''}` };
      }),
      confetti: pct >= 60,
    });
  }

  async function quit() {
    if (document.body.dataset.playMode === 'online') { BT.Online.leave(true); return; }
    if (!(await BT.confirmBox('Quitter la battle ?', { ok: 'Quitter', cancel: 'Continuer', danger: true }))) return;
    if (game) game.over = true;
    UI.stop();
    show('home');
  }
  $('#bQuit').addEventListener('click', quit);

  BT.Battle = { start, quit, UI, judge, judgeMany, botPick, buildDuel, checkPool, randomTheme, slim, THEMES, isRunning: () => !!game && !game.over };
})();
