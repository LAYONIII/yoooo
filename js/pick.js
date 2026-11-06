/* =========================================================
   pick.js : mode 🏆 Défi thème.
   Un thème est tiré au hasard (« pour la salle de sport »…).
   Chaque joueur cherche LUI-MÊME le son qui colle le mieux au thème
   (n'importe quel titre de Deezer). À la fin de la manche, l'IA donne
   un pourcentage à chaque son : ce pourcentage, ce sont les points.
   En solo, on affronte le bot, qui pioche dans la sélection d'artistes.
   L'écran (PickUI) sert aussi au mode en ligne (online.js).
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, show, toast, shuffle } = BT;

  const PICK_TIME = 60;  // secondes pour choisir son son
  const audio = $('#audio');

  // =========================================================
  //  ÉCRAN
  // =========================================================
  let cur = null;        // manche en cours (côté écran)
  let timer = 0;
  let searchSeq = 0;
  let debounce = 0;

  function row(t) {
    return `<div class="pick-row" data-id="${t.id}">
      ${t.coverSmall ? `<img src="${esc(t.coverSmall)}" alt="" loading="lazy">` : '<span class="pr-noart">♪</span>'}
      <div class="pr-text"><b>${esc(t.title)}</b><span>${esc(t.artistName)}</span></div>
      <button class="pr-play" type="button" aria-label="Écouter">▶</button>
      <button class="btn btn-sm pr-choose" type="button">Choisir</button>
    </div>`;
  }

  function renderList(list, title) {
    if (!cur) return;
    cur.list = new Map(list.map((t) => [String(t.id), t]));
    $('#pResults').innerHTML = (title ? `<p class="pr-title">${esc(title)}</p>` : '') + (list.length ? list.map(row).join('') : '<p class="empty">Aucun son trouvé. Essaie un autre nom.</p>');
  }

  function playPreview(t, btn) {
    const same = audio.dataset.pid === String(t.id) && !audio.paused;
    $$('.pr-play, .pc-play').forEach((b) => (b.textContent = '▶'));
    if (same) { audio.pause(); return; }
    audio.src = t.preview;
    audio.dataset.pid = String(t.id);
    const p = audio.play();
    if (p && p.catch) p.catch(() => {});
    if (btn) btn.textContent = '⏸';
  }

  function setChoice(t) {
    if (!cur || cur.locked) return;
    cur.choice = t;
    $('#pCurrent').innerHTML = `<span class="pc-label">Ton son</span>
      ${t.coverSmall ? `<img src="${esc(t.coverSmall)}" alt="">` : ''}
      <div class="pr-text"><b>${esc(t.title)}</b><span>${esc(t.artistName)}</span></div>`;
    $('#pCurrent').classList.add('chosen');
    $('#pValidate').disabled = false;
    BT.sfx('pop');
  }

  async function search(q) {
    const seq = ++searchSeq;
    const local = (cur.ideas || []).filter((t) => BT.norm(`${t.title} ${t.artistName}`).includes(BT.norm(q)));
    $('#pResults').innerHTML = '<p class="empty"><span class="dots"><i></i><i></i><i></i></span> Recherche…</p>';
    let found = [];
    try { found = await BT.api.searchTracks(q); } catch (e) { toast(e.message, { icon: '⚠️' }); }
    if (seq !== searchSeq || !cur || cur.locked) return;
    const ids = new Set(local.map((t) => t.id));
    renderList([...local, ...found.filter((t) => !ids.has(t.id))].slice(0, 30), `Résultats pour « ${q} »`);
  }

  function submit() {
    if (!cur || cur.locked) return;
    cur.locked = true;
    clearInterval(timer);
    audio.pause();
    $('#pValidate').disabled = true;
    $('#pSearch').disabled = true;
    $('#pChoose').classList.add('locked');
    const t = cur.choice || null;
    $('#pStatus').innerHTML = t ? '✅ Son validé ! On attend les autres…' : '⏰ Temps écoulé, aucun son choisi…';
    if (cur.onPick) cur.onPick(t);
  }

  const PickUI = {
    /** opts : { round, total, theme, time, ideas:[tracks], online, onPick(track|null) } */
    start(opts) {
      PickUI.stopTimer();
      cur = { ...opts, choice: null, locked: false, left: opts.time || PICK_TIME };
      $('#pChoose').classList.remove('hidden', 'locked');
      $('#pReveal').classList.add('hidden');
      $('#pNext').classList.add('hidden');
      $('#pProgress').textContent = `Manche ${opts.round + 1}/${opts.total}`;
      const th = $('#pTheme');
      th.innerHTML = `<span class="theme-emoji">${esc(opts.theme.emoji)}</span><div><small>Trouve le meilleur son…</small><b>${esc(opts.theme.label)}</b></div>`;
      th.style.animation = 'none'; void th.offsetWidth; th.style.animation = '';
      $('#pCurrent').classList.remove('chosen');
      $('#pCurrent').innerHTML = '<span class="pc-label">Ton son</span><span class="muted">Aucun son choisi pour l\'instant : cherche, écoute et clique sur « Choisir ».</span>';
      $('#pSearch').value = '';
      $('#pSearch').disabled = false;
      $('#pValidate').disabled = true;
      $('#pStatus').innerHTML = '';
      renderList(shuffle(opts.ideas || []).slice(0, 12), opts.ideas && opts.ideas.length ? '💡 Des idées parmi ta sélection (tu peux chercher n\'importe quel autre son)' : '');
      const total = cur.left;
      const tick = () => {
        if (!cur || cur.locked) return;
        cur.left = Math.max(0, cur.left - 0.2);
        $('#pTimerBar').style.width = `${(cur.left / total) * 100}%`;
        $('#pTimerBar').classList.toggle('danger', cur.left < 10);
        $('#pTime').textContent = `${Math.ceil(cur.left)} s`;
        if (Math.ceil(cur.left) !== Math.ceil(cur.left + 0.2) && cur.left <= 5 && cur.left > 0) BT.sfx('tick');
        if (cur.left <= 0) submit();
      };
      tick();
      timer = setInterval(tick, 200);
      setTimeout(() => $('#pSearch').focus({ preventScroll: true }), 300);
    },
    setStatus(html) { $('#pStatus').innerHTML = html; },
    /** res : { entries:[{ name, avatar, track, percent, me }], reason, by } */
    reveal(res) {
      PickUI.stopTimer();
      if (cur) cur.locked = true;
      $('#pChoose').classList.add('hidden');
      $('#pReveal').classList.remove('hidden');
      const entries = res.entries.slice().sort((a, b) => b.percent - a.percent);
      $('#pVerdict').innerHTML = `<span class="v-ico">🤖</span><div><small>${res.by === 'claude' ? 'IA Claude' : 'IA du jeu'}</small><b>${esc(res.reason)}</b></div>`;
      $('#pCards').innerHTML = entries.length ? entries.map((e, i) => `
        <div class="pick-card${i === 0 ? ' winner' : ''}${e.me ? ' me' : ''}" style="animation-delay:${i * 120}ms" data-i="${i}">
          ${i === 0 ? '<span class="pc-crown">👑</span>' : ''}
          <div class="pc-art">${e.track.cover ? `<img src="${esc(e.track.cover)}" alt="">` : '<span class="pr-noart">♪</span>'}<button class="pc-play" type="button" aria-label="Écouter">▶</button></div>
          <div class="pc-who">${esc(e.avatar)} ${esc(e.name)}${e.me ? ' <small>(toi)</small>' : ''}</div>
          <div class="pc-title"><b>${esc(e.track.title)}</b><span>${esc(e.track.artistName)}</span></div>
          <div class="pc-meter"><i style="--p:${e.percent}%"></i></div>
          <div class="pc-percent"><span data-to="${e.percent}">0</span> %</div>
        </div>`).join('') : '<p class="empty">Personne n\'a choisi de son…</p>';
      $$('#pCards .pick-card').forEach((card) => {
        const e = entries[+card.dataset.i];
        card.querySelector('.pc-play').addEventListener('click', (ev) => playPreview(e.track, ev.currentTarget));
      });
      requestAnimationFrame(() => $$('#pCards .pc-meter i').forEach((i) => i.classList.add('go')));
      $$('#pCards [data-to]').forEach((el) => BT.countUp(el, +el.dataset.to, 1200));
      if (entries[0]) {
        setTimeout(() => { if ($('#pCards .pick-card.winner')) playPreview(entries[0].track, $('#pCards .pick-card.winner .pc-play')); }, 500);
        const w = $('#pCards .pick-card.winner');
        if (w) { const r = w.getBoundingClientRect(); BT.confetti(70, { x: r.left + r.width / 2, y: r.top + 30 }); }
      }
      const mine = entries.find((e) => e.me);
      BT.FX.pulse(mine && entries[0] === mine ? 'ok' : 'none');
      BT.sfx(mine && entries[0] === mine ? 'good' : 'pop');
      $('#pStatus').innerHTML = res.message || '';
    },
    next(label, fn) {
      const b = $('#pNext');
      b.textContent = label;
      b.onclick = () => { b.classList.add('hidden'); fn(); };
      b.classList.remove('hidden');
    },
    stopTimer() { clearInterval(timer); },
    stop() { PickUI.stopTimer(); cur = null; audio.pause(); },
    setHud(items) {
      $('#pHud').innerHTML = items.map((it) => `<div class="hud-item" data-phud="${it.id}"><span class="hud-label">${esc(it.label)}</span><b>${esc(it.value)}</b></div>`).join('');
    },
    updateHud(id, value) { const el = $(`[data-phud="${id}"] b`); if (el) el.textContent = value; },
  };

  // événements de l'écran
  $('#pResults').addEventListener('click', (e) => {
    const r = e.target.closest('.pick-row');
    if (!r || !cur) return;
    const t = cur.list.get(r.dataset.id);
    if (!t) return;
    if (e.target.closest('.pr-play')) playPreview(t, e.target.closest('.pr-play'));
    else if (e.target.closest('.pr-choose')) setChoice(t);
  });
  $('#pSearchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(debounce); const q = $('#pSearch').value.trim(); if (q && cur && !cur.locked) search(q); });
  $('#pSearch').addEventListener('input', (e) => {
    clearTimeout(debounce);
    const q = e.target.value.trim();
    if (!cur || cur.locked) return;
    if (!q) { renderList(shuffle(cur.ideas || []).slice(0, 12), '💡 Des idées parmi ta sélection'); return; }
    if (q.length >= 2) debounce = setTimeout(() => search(q), 400);
  });
  $('#pValidate').addEventListener('click', submit);
  audio.addEventListener('ended', () => $$('.pr-play, .pc-play').forEach((b) => (b.textContent = '▶')));

  // =========================================================
  //  PARTIE SOLO (contre le bot)
  // =========================================================
  let game = null;

  async function start(sources, opts) {
    BT.Quiz.stop();
    show('loading');
    $('#loadingText').textContent = `Préparation du défi : ${sources.map((s) => s.name).join(', ')}…`;
    let pool;
    try {
      pool = await BT.loadPool(sources, { pool: opts.pool, guess: 'title' }, (txt) => { $('#loadingText').textContent = `Chargement… ${txt}`; });
    } catch (err) { BT.homeError(err.message); return; }
    BT.trackPlayed(sources);
    BT.addRecent(sources);
    BT.lastGame = { type: 'pick', sources, opts };
    game = { sources, opts, pool, index: -1, total: +opts.rounds, score: 0, bot: 0, wins: 0, best: 0, history: [], usedThemes: new Set(), botUsed: new Set(), over: false };
    document.body.dataset.playMode = 'solo';
    $('#pScoreboardWrap').classList.add('hidden');
    $('#pEmojiBar').classList.add('hidden');
    $('#pChoose').classList.add('hidden');
    $('#pReveal').classList.add('hidden');
    $('#pTheme').innerHTML = '';
    $('#pProgress').textContent = '';
    $('#pStatus').innerHTML = `🎵 ${pool.count} morceaux chargés : le bot est prêt !`;
    PickUI.setHud([
      { id: 'progress', label: 'Manche', value: `1/${game.total}` },
      { id: 'score', label: 'Toi', value: 0 },
      { id: 'bot', label: '🤖 Bot', value: 0 },
    ]);
    show('pick');
    const g = game;
    await BT.countdown(3);
    if (game === g && !g.over) next();
  }

  function pickTheme(used) {
    const free = BT.Battle.THEMES.filter((t) => !used.has(t.label));
    const th = (free.length ? free : BT.Battle.THEMES)[BT.rand(free.length || BT.Battle.THEMES.length)];
    used.add(th.label);
    return th;
  }

  function next() {
    const g = game;
    if (!g || g.over) return;
    g.index++;
    if (g.index >= g.total) { end(); return; }
    const theme = pickTheme(g.usedThemes);
    PickUI.updateHud('progress', `${g.index + 1}/${g.total}`);
    const botPromise = BT.Battle.botPick(theme, g.pool, g.botUsed);
    PickUI.start({ round: g.index, total: g.total, theme, time: PICK_TIME, ideas: g.pool.tracks, onPick: (t) => finishRound(g, theme, t, botPromise) });
  }

  async function finishRound(g, theme, mine, botPromise) {
    PickUI.setStatus('<span class="dots"><i></i><i></i><i></i></span> 🤖 Le bot a fait son choix… l\'IA compare les sons');
    const bot = await botPromise;
    if (bot) g.botUsed.add(bot.id);
    const entries = [];
    if (mine) entries.push({ name: BT.displayName(), avatar: BT.profile.avatar, track: mine, me: true });
    if (bot) entries.push({ name: 'Le bot', avatar: '🤖', track: bot, me: false });
    const res = await BT.Battle.judgeMany(theme, entries.map((e) => e.track));
    if (game !== g || g.over) return;
    entries.forEach((e, i) => { e.percent = res.percents[i] || 0; });
    const me = entries.find((e) => e.me);
    const botE = entries.find((e) => !e.me);
    const pts = me ? me.percent : 0;
    g.score += pts;
    g.bot += botE ? botE.percent : 0;
    g.best = Math.max(g.best, pts);
    const won = me && (!botE || me.percent > botE.percent);
    if (won) g.wins++;
    g.history.push({ theme, mine, bot, pts, won, botPts: botE ? botE.percent : 0 });
    PickUI.reveal({ entries, reason: res.reason, by: res.by, message: me ? `${won ? '🏆 Tu remportes la manche !' : '😤 Le bot l\'emporte cette fois.'} <b class="good">+${pts} pts</b>` : '⏰ Tu n\'as pas choisi de son : 0 pt.' });
    PickUI.updateHud('score', g.score);
    PickUI.updateHud('bot', g.bot);
    PickUI.next(g.index + 1 >= g.total ? 'Voir les résultats 🏁' : 'Manche suivante ➜', next);
  }

  function end() {
    const g = game;
    if (!g || g.over) return;
    g.over = true;
    PickUI.stop();
    BT.sfx('end');
    const n = g.history.length;
    BT.saveScore({ name: BT.displayName(), avatar: BT.profile.avatar, score: g.score, correct: g.wins, answered: n, mode: 'pick', difficulty: 'normal', artists: g.sources.map((s) => s.name), bestStreak: 0 });
    BT.unlock('first');
    if (n >= 5 && g.wins === n) BT.unlock('curator');
    const beat = g.score > g.bot;
    BT.Solo.showResults({
      emoji: beat ? '🏆' : '🤖',
      title: beat ? 'Tu as battu le bot !' : 'Le bot a gagné…',
      sub: `Défi thème · ${g.sources.map((s) => s.name).join(', ')} · toi ${g.score} pts contre ${g.bot} pts pour le bot`,
      score: g.score,
      stats: [
        [`${g.wins}/${n}`, 'Manches gagnées'],
        [`${n ? Math.round(g.score / n) : 0} %`, 'Note moyenne'],
        [`${g.best} %`, 'Meilleure note'],
        [`${g.bot}`, 'Points du bot'],
      ],
      recap: g.history.filter((h) => h.mine || h.bot).map((h) => ({
        track: h.mine || h.bot,
        status: h.won ? 'ok' : 'ko',
        detail: `${esc(h.theme.emoji)} ${esc(h.theme.label)} · ${h.mine ? `ton son : ${h.pts} %` : 'pas de son'}${h.bot ? ` · bot (${esc(h.bot.title)}) : ${h.botPts} %` : ''}`,
      })),
      confetti: beat,
    });
  }

  async function quit() {
    if (document.body.dataset.playMode === 'online') { BT.Online.leave(true); return; }
    if (!(await BT.confirmBox('Quitter le défi ?', { ok: 'Quitter', cancel: 'Continuer', danger: true }))) return;
    if (game) game.over = true;
    PickUI.stop();
    show('home');
  }
  $('#pQuit').addEventListener('click', quit);

  BT.Pick = { start, quit, UI: PickUI, PICK_TIME, pickTheme, isRunning: () => !!game && !game.over };
})();
