/* =========================================================
   online.js : mode multijoueur en ligne.
   Les navigateurs se connectent directement entre eux (WebRTC via
   PeerJS) : pas de serveur à héberger, ça marche sur GitHub Pages.
   - L'hôte crée un salon (code à 6 caractères) et pilote la partie :
     il choisit les morceaux, envoie les questions, compte les points.
   - Les invités reçoivent les questions, envoient leurs réponses et
     voient le classement en direct.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, show, toast, Quiz, DIFFICULTY, sfx, AVATARS } = BT;

  const PREFIX = 'blindtest-fr-v1-';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const REVEAL_DELAY = 5500;  // temps d'affichage de la réponse avant la question suivante
  const GRACE = 3500;         // marge (ms) pour le chargement de l'extrait et le réseau
  const MAX_PLAYERS = 12;
  const FIRST_BONUS = 50;
  const EMOJIS = ['🔥', '😂', '😱', '👏', '💀', '🐐', '😭', '🤯'];
  const PEERJS_URLS = [
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  ];

  const S = {
    peer: null, isHost: false, code: '', hostConn: null, conns: new Map(),
    players: new Map(), myId: null, config: null, summary: null, state: 'idle',
    pool: null, queue: [], total: 0, index: -1, round: null, history: [],
    timers: new Set(), leaving: false, currentQ: null, lastEmoji: 0,
  };

  // ---------- Outils ----------
  const later = (fn, ms) => { const t = setTimeout(() => { S.timers.delete(t); fn(); }, ms); S.timers.add(t); return t; };
  const clearTimers = () => { S.timers.forEach(clearTimeout); S.timers.clear(); };
  const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Joueur';
  const cleanAvatar = (a) => (AVATARS.includes(a) ? a : '🎧');
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[BT.rand(CODE_CHARS.length)]).join('');
  const playerList = () => [...S.players.values()].map(({ id, name, avatar, score, host, correct, lastPoints }) => ({ id, name, avatar, score, host, correct, lastPoints }));
  const sorted = (list) => list.slice().sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  function loadLib() {
    if (window.Peer) return Promise.resolve();
    const tryUrl = (i) => new Promise((resolve, reject) => {
      if (i >= PEERJS_URLS.length) { reject(new Error('Impossible de charger le module en ligne. Vérifie ta connexion.')); return; }
      const s = document.createElement('script');
      s.src = PEERJS_URLS[i];
      s.onload = resolve;
      s.onerror = () => { s.remove(); tryUrl(i + 1).then(resolve, reject); };
      document.head.appendChild(s);
    });
    return tryUrl(0);
  }

  // ?peer=hote:port permet d'utiliser son propre serveur PeerJS (tests en local)
  function peerOptions() {
    const p = BT.urlParams.get('peer');
    if (p) {
      const [host, port] = p.split(':');
      return { host, port: +port || 9000, path: '/', secure: false, debug: 0 };
    }
    return { debug: 0 };
  }

  function openPeer(id) {
    return new Promise((resolve, reject) => {
      const p = id ? new window.Peer(id, peerOptions()) : new window.Peer(peerOptions());
      const timer = setTimeout(() => { p.destroy(); reject(new Error('Le serveur de connexion ne répond pas. Réessaie.')); }, 12000);
      p.once('open', () => { clearTimeout(timer); resolve(p); });
      p.once('error', (e) => { clearTimeout(timer); p.destroy(); reject(e); });
    });
  }

  const configSummary = () => ({
    sources: S.config.sources.map((s) => ({ name: s.name, picture: s.picture || '', emoji: s.emoji || '' })),
    rounds: S.config.opts.rounds, difficulty: S.config.opts.difficulty, guess: S.config.opts.guess, pool: S.config.opts.pool,
  });

  function inviteUrl() {
    const params = new URLSearchParams({ room: S.code });
    if (BT.urlParams.get('peer')) params.set('peer', BT.urlParams.get('peer'));
    return `${location.origin}${location.pathname}?${params}`;
  }

  // =========================================================
  //  HÔTE
  // =========================================================
  async function host(sources, opts) {
    // salon déjà ouvert : on met juste à jour la musique / les réglages
    if (S.peer && S.isHost) {
      S.config = { sources, opts };
      S.summary = configSummary();
      sendLobby();
      show('lobby');
      toast('Réglages du salon mis à jour', { icon: '✅' });
      return;
    }
    show('loading');
    $('#loadingText').textContent = 'Création du salon…';
    try {
      await loadLib();
      let peer = null;
      for (let i = 0; i < 5 && !peer; i++) {
        const code = newCode();
        try { peer = await openPeer(PREFIX + code); S.code = code; } catch (e) { if (e.type !== 'unavailable-id') throw e; }
      }
      if (!peer) throw new Error('Impossible de créer un salon, réessaie.');
      Object.assign(S, { peer, isHost: true, myId: 'host', leaving: false, state: 'lobby', config: { sources, opts } });
      S.summary = configSummary();
      S.players.clear();
      S.players.set('host', { id: 'host', name: BT.displayName(), avatar: BT.profile.avatar, score: 0, streak: 0, correct: 0, host: true, lastPoints: 0 });
      peer.on('connection', onConnection);
      peer.on('disconnected', () => { if (!S.leaving && S.peer === peer) peer.reconnect(); });
      peer.on('error', (e) => { if (e.type === 'network' || e.type === 'server-error') toast('Connexion au serveur instable…', { icon: '⚠️' }); });
      renderLobby();
      show('lobby');
    } catch (err) {
      reset();
      BT.homeError(err.message || 'Impossible de créer le salon.');
    }
  }

  function onConnection(conn) {
    conn.on('data', (msg) => hostHandle(conn, msg));
    const drop = () => removePlayer(conn.peer);
    conn.on('close', drop);
    conn.on('error', drop);
  }

  function send(conn, msg) { try { if (conn && conn.open) conn.send(msg); } catch { /* ignore */ } }
  function broadcast(msg) { S.conns.forEach((c) => send(c, msg)); }

  function hostHandle(conn, msg) {
    if (!msg || typeof msg !== 'object') return;
    const id = conn.peer;
    if (msg.t === 'hello') {
      if (S.players.size >= MAX_PLAYERS) { send(conn, { t: 'full' }); setTimeout(() => conn.close(), 300); return; }
      const player = { id, name: cleanName(msg.name), avatar: cleanAvatar(msg.avatar), score: 0, streak: 0, correct: 0, host: false, lastPoints: 0 };
      S.players.set(id, player);
      S.conns.set(id, conn);
      send(conn, { t: 'welcome', id, code: S.code });
      sendLobby();
      sfx('join');
      toast(`${player.name} a rejoint le salon`, { icon: player.avatar });
      if (S.state === 'end') send(conn, endMessage());
      return;
    }
    if (!S.players.has(id)) return;
    if (msg.t === 'answer') {
      if (S.round && msg.round === S.round.index) registerAnswer(id, msg.choice, msg.time);
    } else if (msg.t === 'emoji' && EMOJIS.includes(msg.e)) {
      const out = { t: 'emoji', from: id, e: msg.e };
      broadcast(out);
      showEmoji(out);
    }
  }

  function removePlayer(id) {
    const p = S.players.get(id);
    S.conns.delete(id);
    if (!p || p.host) return;
    S.players.delete(id);
    toast(`${p.name} a quitté le salon`, { icon: '👋' });
    sendLobby();
    if (S.round && !S.round.finished) checkAllAnswered();
  }

  function sendLobby() {
    const msg = { t: 'lobby', players: playerList(), config: S.summary, state: S.state, code: S.code };
    broadcast(msg);
    applyLobby(msg);
  }

  async function startGame() {
    if (!S.isHost || S.state === 'loading') return;
    S.state = 'loading';
    const text = `Chargement : ${S.config.sources.map((s) => s.name).join(', ')}…`;
    broadcast({ t: 'loading', text });
    show('loading');
    $('#loadingText').textContent = text;
    try {
      S.pool = await BT.loadPool(S.config.sources, S.config.opts, (txt) => { $('#loadingText').textContent = `Chargement de toute la discographie… ${txt}`; });
    } catch (err) {
      S.state = 'lobby';
      sendLobby();
      show('lobby');
      toast(err.message, { icon: '⚠️', ms: 5000 });
      return;
    }
    BT.trackPlayed(S.config.sources);
    BT.addRecent(S.config.sources);
    S.queue = BT.shuffle(S.pool.tracks);
    S.total = Math.min(+S.config.opts.rounds, S.queue.length);
    S.index = -1;
    S.history = [];
    S.players.forEach((p) => Object.assign(p, { score: 0, streak: 0, correct: 0, lastPoints: 0 }));
    // compte à rebours synchronisé chez tout le monde, puis première question
    const msg = { t: 'countdown', total: S.total, count: S.pool.count, players: playerList() };
    broadcast(msg);
    onCountdown(msg);
    later(nextRound, 3400);
  }

  function onCountdown(msg) {
    S.myDots = [];
    if (msg.players) S.players = new Map(msg.players.map((p) => [p.id, { ...(S.players.get(p.id) || {}), ...p }]));
    setupPlayScreen();
    Quiz.updateHud('progress', `1/${msg.total}`);
    Quiz.setDots([], msg.total, 0);
    $('#flip').classList.remove('flipped');
    $('#answers').innerHTML = '';
    $('#reveal').innerHTML = `<span class="r-sub">🎵 ${msg.count} morceaux · ${msg.total} questions</span>`;
    renderScoreboard();
    BT.countdown(3);
  }

  function nextRound() {
    if (!S.isHost || S.leaving) return;
    S.index++;
    if (S.index >= S.total) { endGame(); return; }
    const diff = DIFFICULTY[S.config.opts.difficulty];
    const track = S.queue[S.index];
    const question = BT.makeQuestion(S.pool, track);
    const offset = diff.randomStart ? Math.random() * Math.max(0, 30 - diff.time - 2) : 0;
    S.round = { index: S.index, track, question, answers: new Map(), finished: false, time: diff.time };
    S.state = 'question';
    const msg = {
      t: 'question', round: S.index, total: S.total, preview: track.preview,
      choices: question.choices, prompt: question.prompt, time: diff.time, offset,
      players: playerList(),
    };
    broadcast(msg);
    onQuestion(msg);
    S.round.timer = later(finishRound, diff.time * 1000 + GRACE);
  }

  function registerAnswer(id, choice, time) {
    const r = S.round;
    if (!r || r.finished || r.answers.has(id)) return;
    const c = Number.isInteger(choice) && choice >= 0 && choice < 4 ? choice : null;
    const t = Math.max(0, Math.min(r.time, +time || 0));
    r.answers.set(id, { choice: c, time: t });
    const msg = { t: 'answered', ids: [...r.answers.keys()] };
    broadcast(msg);
    markAnswered(msg.ids);
    checkAllAnswered();
  }

  function checkAllAnswered() {
    const r = S.round;
    if (!r || r.finished) return;
    if ([...S.players.keys()].every((id) => r.answers.has(id))) {
      clearTimeout(r.timer);
      S.timers.delete(r.timer);
      r.timer = later(finishRound, 700);
    }
  }

  function finishRound() {
    const r = S.round;
    if (!r || r.finished) return;
    r.finished = true;
    clearTimeout(r.timer);
    const correct = r.question.correctIndex;
    const good = [...r.answers.entries()].filter(([, a]) => a.choice === correct).sort((a, b) => a[1].time - b[1].time);
    const first = good.length && S.players.size > 1 ? good[0][0] : null;
    const results = [];
    S.players.forEach((p, id) => {
      const a = r.answers.get(id);
      let points = 0;
      if (a && a.choice === correct) {
        p.streak++;
        p.correct++;
        points = BT.pointsFor({ elapsed: a.time, time: r.time, streak: p.streak }) + (id === first ? FIRST_BONUS : 0);
      } else p.streak = 0;
      p.score += points;
      p.lastPoints = points;
      results.push({ id, choice: a ? a.choice : null, points, time: a ? a.time : null });
    });
    const t = r.track;
    const track = { id: t.id, title: t.title, artistName: t.artistName, album: t.album, cover: t.cover, coverSmall: t.coverSmall, link: t.link, preview: t.preview };
    S.history.push({ track, results });
    S.state = 'reveal';
    const msg = { t: 'reveal', round: r.index, correctIndex: correct, track, results, first, players: playerList(), guess: S.pool.guess, last: r.index + 1 >= S.total };
    broadcast(msg);
    onReveal(msg);
    later(nextRound, REVEAL_DELAY);
  }

  const endMessage = () => ({ t: 'end', players: playerList(), history: S.history, summary: S.summary });

  function endGame() {
    S.state = 'end';
    S.round = null;
    const msg = endMessage();
    broadcast(msg);
    onEnd(msg);
  }

  function backToLobby() {
    if (!S.isHost) return;
    clearTimers();
    S.state = 'lobby';
    S.round = null;
    S.players.forEach((p) => Object.assign(p, { score: 0, streak: 0, correct: 0, lastPoints: 0 }));
    sendLobby();
    show('lobby');
  }

  // =========================================================
  //  INVITÉ
  // =========================================================
  async function join(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { toast('Le code doit faire 6 caractères', { icon: '⚠️' }); return; }
    if (S.peer) leave(false);
    show('loading');
    $('#loadingText').textContent = `Connexion au salon ${code}…`;
    try {
      await loadLib();
      const peer = await openPeer();
      Object.assign(S, { peer, isHost: false, code, leaving: false, state: 'joining' });
      await new Promise((resolve, reject) => {
        const conn = peer.connect(PREFIX + code, { reliable: true });
        const timer = setTimeout(() => reject(new Error('Le salon ne répond pas. Vérifie le code ou demande à ton pote de rester sur la page.')), 15000);
        peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') { clearTimeout(timer); reject(new Error(`Salon ${code} introuvable. Vérifie le code.`)); }
        });
        conn.on('open', () => {
          clearTimeout(timer);
          S.hostConn = conn;
          conn.send({ t: 'hello', name: BT.displayName(), avatar: BT.profile.avatar });
          resolve();
        });
        conn.on('data', clientHandle);
        conn.on('close', hostGone);
        conn.on('error', hostGone);
      });
    } catch (err) {
      reset();
      BT.homeError(err.message || 'Connexion impossible.');
    }
  }

  function clientHandle(msg) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome': S.myId = msg.id; S.code = msg.code; S.state = 'lobby'; sfx('join'); break;
      case 'lobby': applyLobby(msg); break;
      case 'loading': S.state = 'loading'; show('loading'); $('#loadingText').textContent = msg.text; break;
      case 'countdown': onCountdown(msg); break;
      case 'question': onQuestion(msg); break;
      case 'answered': markAnswered(msg.ids); break;
      case 'reveal': onReveal(msg); break;
      case 'end': onEnd(msg); break;
      case 'emoji': showEmoji(msg); break;
      case 'full': toast('Ce salon est plein', { icon: '⚠️' }); leave(false); break;
      case 'closed': hostGone(); break;
      default: break;
    }
  }

  function hostGone() {
    if (S.leaving || !S.peer || S.isHost) return;
    toast("L'hôte a fermé le salon", { icon: '🚪', ms: 4000 });
    leave(false);
  }

  // =========================================================
  //  COMMUN (affichage chez l'hôte et chez les invités)
  // =========================================================
  function applyLobby(msg) {
    S.players = new Map(msg.players.map((p) => [p.id, { ...(S.players.get(p.id) || {}), ...p }]));
    S.summary = msg.config;
    if (msg.code) S.code = msg.code;
    renderLobby();
    renderScoreboard();
    if (msg.state === 'lobby') {
      S.state = 'lobby';
      const scr = document.body.dataset.screen;
      if (!S.isHost && scr !== 'lobby') show('lobby');
    } else if (!S.isHost && document.body.dataset.screen === 'loading' && S.state === 'joining') {
      // arrivé pendant une partie : on attend la prochaine question dans le salon
      S.state = msg.state;
      show('lobby');
      $('#lobbyWaiting').innerHTML = '<span class="dots"><i></i><i></i><i></i></span> Partie en cours : tu joues dès la prochaine question !';
    }
  }

  function renderLobby() {
    $('#roomCode').textContent = S.code;
    const list = $('#lobbyPlayers');
    const players = [...S.players.values()];
    $('#playerCount').textContent = `${players.length}/${MAX_PLAYERS}`;
    list.innerHTML = players.map((p) => `
      <li class="${p.id === S.myId ? 'me' : ''}">
        <span class="p-avatar">${esc(p.avatar)}</span>
        <span class="p-name">${esc(p.name)}${p.id === S.myId ? ' <small>(toi)</small>' : ''}</span>
        ${p.host ? '<span class="p-tag">👑 Hôte</span>' : '<span class="p-tag ready">Prêt</span>'}
      </li>`).join('');
    const sm = S.summary;
    if (sm) {
      $('#lobbyConfig').innerHTML = `
        <div class="cfg-sources">${sm.sources.map((s) => `<span class="chip">${s.picture ? `<img src="${esc(s.picture)}" alt="">` : `<span class="mini">${esc(s.emoji || '♪')}</span>`}${esc(s.name)}</span>`).join('')}</div>
        <div class="cfg-tags">
          <span>❓ ${sm.rounds} questions</span>
          <span>${sm.guess === 'artist' ? '🎤 Qui chante ?' : '🎵 Le titre'}</span>
          <span>${{ easy: '😎', normal: '🔥', hard: '💀' }[sm.difficulty]} ${DIFFICULTY[sm.difficulty].label}</span>
          <span>${sm.pool === '100' ? '📀 Toute la disco' : '⭐ Les hits'}</span>
        </div>`;
    }
    $('#lobbyHostActions').classList.toggle('hidden', !S.isHost);
    $('#lobbyWaiting').classList.toggle('hidden', S.isHost);
    if (!S.isHost && S.state === 'lobby') $('#lobbyWaiting').innerHTML = '<span class="dots"><i></i><i></i><i></i></span> En attente que l\'hôte lance la partie…';
    $('#lobbyStart').textContent = players.length > 1 ? `▶ Lancer la partie (${players.length} joueurs)` : '▶ Lancer la partie (seul pour l\'instant)';
  }

  function setupPlayScreen() {
    document.body.dataset.playMode = 'online';
    $('#pauseBtn').classList.add('hidden');
    $('#scoreboardWrap').classList.remove('hidden');
    $('#playEmojiBar').classList.remove('hidden');
    Quiz.setHud([
      { id: 'progress', label: 'Question', value: '' },
      { id: 'score', label: 'Ton score', value: 0 },
      { id: 'rank', label: 'Rang', value: '-' },
      { id: 'players', label: 'Joueurs', value: S.players.size },
    ]);
    Quiz.combo(null);
    show('play');
  }

  function myStats() {
    const list = sorted([...S.players.values()]);
    const idx = list.findIndex((p) => p.id === S.myId);
    return { me: list[idx], rank: idx + 1, count: list.length };
  }

  function updateHud(bump) {
    const { me, rank, count } = myStats();
    Quiz.updateHud('score', me ? me.score : 0, bump);
    const medal = { 1: '🥇 ', 2: '🥈 ', 3: '🥉 ' }[rank] || '';
    Quiz.updateHud('rank', rank ? `${medal}${rank}/${count}` : '-');
    Quiz.updateHud('players', count);
  }

  function onQuestion(msg) {
    S.state = 'question';
    S.currentQ = msg;
    if (msg.players) S.players = new Map(msg.players.map((p) => [p.id, { ...(S.players.get(p.id) || {}), ...p, lastPoints: 0 }]));
    if (document.body.dataset.screen !== 'play' || document.body.dataset.playMode !== 'online') setupPlayScreen();
    Quiz.updateHud('progress', `${msg.round + 1}/${msg.total}`);
    S.myDots = S.myDots || [];
    S.total = msg.total;
    Quiz.setDots(S.myDots, msg.total, msg.round);
    updateHud();
    renderScoreboard(new Set());
    Quiz.ask({
      preview: msg.preview, choices: msg.choices, prompt: msg.prompt, time: msg.time, offset: msg.offset, jokers: null,
      onAnswer: (choice, elapsed) => {
        const c = typeof choice === 'number' ? choice : null;
        if (S.isHost) registerAnswer('host', c, elapsed);
        else send(S.hostConn, { t: 'answer', round: msg.round, choice: c, time: elapsed });
        Quiz.setMessage(c === null ? '<span class="r-points bad">⏰ Temps écoulé !</span><div class="r-sub">On attend les autres…</div>'
          : '<span class="r-points">✅ Réponse envoyée</span><div class="r-sub">On attend les autres…</div>');
      },
      onError: () => {
        Quiz.setMessage('<span class="r-points bad">Extrait indisponible</span><div class="r-sub">On attend les autres…</div>');
        if (S.isHost) registerAnswer('host', null, 0);
        else send(S.hostConn, { t: 'answer', round: msg.round, choice: null, time: 0 });
      },
    });
  }

  function markAnswered(ids) {
    renderScoreboard(new Set(ids));
  }

  function onReveal(msg) {
    S.players = new Map(msg.players.map((p) => [p.id, { ...(S.players.get(p.id) || {}), ...p }]));
    const mine = msg.results.find((r) => r.id === S.myId);
    let status = 'none';
    if (mine) status = mine.points > 0 ? 'ok' : mine.choice === null ? 'timeout' : 'ko';
    S.myDots = S.myDots || [];
    S.myDots[msg.round] = status === 'none' ? 'skip' : status === 'timeout' ? 'ko' : status;
    Quiz.setDots(S.myDots, S.total, -1);
    const t = msg.track;
    const isFirst = msg.first && msg.first === S.myId;
    const message = status === 'ok'
      ? `<span class="r-points good">+${mine.points} pts${isFirst ? ' · ⚡ Premier !' : ''}</span>`
      : undefined;
    Quiz.reveal({
      correctIndex: msg.correctIndex, status, points: mine ? mine.points : 0, message,
      title: msg.guess === 'artist' ? t.artistName : t.title,
      sub: msg.guess === 'artist' ? `« ${t.title} »` : `${t.artistName}${t.album ? ' · ' + t.album : ''}`,
      cover: t.cover,
    });
    const firstP = msg.first && S.players.get(msg.first);
    if (firstP && !isFirst) Quiz.combo(`⚡ ${firstP.name}`); else if (isFirst) Quiz.combo('⚡ Premier !'); else Quiz.combo(null);
    updateHud(status === 'ok');
    renderScoreboard(null, true);
    // petit compte à rebours avant la question suivante
    const nextLabel = msg.last ? 'Résultats dans' : 'Question suivante dans';
    let left = Math.round(REVEAL_DELAY / 1000);
    const el = document.createElement('div');
    el.className = 'r-next';
    $('#reveal').appendChild(el);
    const tick = () => { if (!el.isConnected) return; el.textContent = `${nextLabel} ${left} s…`; if (left-- > 0) setTimeout(tick, 1000); };
    tick();
  }

  function renderScoreboard(answered, showPoints) {
    const list = sorted([...S.players.values()]);
    $('#scoreboard').innerHTML = list.map((p, i) => {
      let tag = '';
      if (showPoints) tag = p.lastPoints > 0 ? `<span class="sb-delta">+${p.lastPoints}</span>` : '<span class="sb-delta zero">+0</span>';
      else if (answered && answered.has(p.id)) tag = '<span class="sb-ok" title="A répondu">✔</span>';
      else if (answered) tag = '<span class="sb-wait"><span class="dots"><i></i><i></i><i></i></span></span>';
      return `<li class="${p.id === S.myId ? 'me' : ''}"><span class="sb-rank">${i + 1}</span><span class="sb-avatar">${esc(p.avatar)}</span><span class="sb-name">${esc(p.name)}</span>${tag}<span class="sb-score">${p.score}</span></li>`;
    }).join('');
  }

  function onEnd(msg) {
    S.state = 'end';
    Quiz.stop();
    clearTimeout(S.revealTimer);
    const list = sorted(msg.players);
    S.players = new Map(msg.players.map((p) => [p.id, p]));
    const myRank = list.findIndex((p) => p.id === S.myId) + 1;
    const me = list[myRank - 1];

    // podium
    const order = [list[1], list[0], list[2]];
    $('#podium').innerHTML = order.map((p, i) => {
      if (!p) return '<div class="podium-col empty"></div>';
      const place = [2, 1, 3][i];
      return `<div class="podium-col p${place}${p.id === S.myId ? ' me' : ''}">
        <div class="podium-avatar">${esc(p.avatar)}${place === 1 ? '<span class="crown">👑</span>' : ''}</div>
        <div class="podium-name">${esc(p.name)}</div>
        <div class="podium-score">${p.score} pts</div>
        <div class="podium-block">${place}</div>
      </div>`;
    }).join('');
    $('#ranking').innerHTML = list.slice(3).map((p, i) => `<li class="${p.id === S.myId ? 'me' : ''}"><span class="sb-rank">${i + 4}</span><span class="sb-avatar">${esc(p.avatar)}</span><span class="sb-name">${esc(p.name)}</span><span class="sb-score">${p.score} pts</span></li>`).join('');
    const total = msg.history.length;
    $('#podiumSub').textContent = me ? `Tu termines ${myRank === 1 ? '1er 🏆' : myRank + 'e'} sur ${list.length} avec ${me.score} pts (${me.correct}/${total} bonnes réponses).` : '';

    // récap avec ta réponse pour chaque morceau
    const history = msg.history.map((h) => {
      const mine = h.results.find((r) => r.id === S.myId);
      const winners = h.results.filter((r) => r.points > 0).length;
      const status = !mine ? 'none' : mine.points > 0 ? 'ok' : 'ko';
      const detail = `${status === 'ok' ? `+${mine.points} pts · ` : status === 'ko' ? (mine.choice === null ? 'Temps écoulé · ' : 'Raté · ') : ''}${winners}/${h.results.length} ont trouvé`;
      return { track: h.track, status, detail };
    });
    BT.renderRecap($('#podiumRecap'), history);

    $('#podiumReplay').classList.toggle('hidden', !S.isHost);
    $('#podiumWaiting').classList.toggle('hidden', S.isHost);
    show('podium');
    BT.sfx('end');

    if (me && total > 0) {
      BT.unlock('online');
      if (myRank === 1 && list.length > 1 && me.score > 0) { BT.unlock('champion'); setTimeout(() => BT.confetti(200), 300); }
      BT.saveScore({
        name: me.name, avatar: me.avatar, score: me.score, correct: me.correct, answered: total, mode: 'online',
        difficulty: msg.summary ? msg.summary.difficulty : 'normal', guess: msg.summary ? msg.summary.guess : 'title',
        artists: msg.summary ? msg.summary.sources.map((s) => s.name) : [], bestStreak: 0, rank: myRank, players: list.length,
      });
    }
  }

  // ---------- Réactions emoji ----------
  function showEmoji(msg) {
    const p = S.players.get(msg.from);
    const el = document.createElement('div');
    el.className = 'float-emoji';
    el.style.left = `${10 + Math.random() * 80}%`;
    el.innerHTML = `<span class="fe">${esc(msg.e)}</span><span class="fe-name">${esc(p ? p.name : '')}</span>`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
    sfx('pop');
  }
  function sendEmoji(e) {
    const now = Date.now();
    if (now - S.lastEmoji < 500 || !S.peer) return;
    S.lastEmoji = now;
    if (S.isHost) { const out = { t: 'emoji', from: 'host', e }; broadcast(out); showEmoji(out); }
    else send(S.hostConn, { t: 'emoji', e });
  }
  $$('[data-emoji-bar]').forEach((bar) => {
    bar.innerHTML = EMOJIS.map((e) => `<button type="button" data-emoji="${e}">${e}</button>`).join('');
    bar.addEventListener('click', (ev) => { const b = ev.target.closest('[data-emoji]'); if (b) sendEmoji(b.dataset.emoji); });
  });

  // ---------- Quitter ----------
  function reset() {
    clearTimers();
    if (S.peer) { try { S.peer.destroy(); } catch { /* ignore */ } }
    Object.assign(S, { peer: null, isHost: false, code: '', hostConn: null, myId: null, state: 'idle', round: null, pool: null, currentQ: null });
    S.conns = new Map();
    S.players = new Map();
  }

  async function leave(confirmFirst) {
    if (confirmFirst && !(await BT.confirmBox(S.isHost ? 'Fermer le salon ? Tous les joueurs seront déconnectés.' : 'Quitter le salon ?', { ok: S.isHost ? 'Fermer le salon' : 'Quitter', danger: true }))) return;
    S.leaving = true;
    if (S.isHost) broadcast({ t: 'closed' });
    Quiz.stop();
    const peer = S.peer;
    clearTimers();
    Object.assign(S, { peer: null });
    setTimeout(() => { try { if (peer) peer.destroy(); } catch { /* ignore */ } }, 300);
    reset();
    S.leaving = false;
    document.body.dataset.playMode = '';
    BT.onLeaveRoom && BT.onLeaveRoom();
    show('home');
  }
  window.addEventListener('beforeunload', () => { if (S.isHost && S.peer) broadcast({ t: 'closed' }); });

  // ---------- Boutons ----------
  $('#lobbyStart').addEventListener('click', startGame);
  $('#lobbyEdit').addEventListener('click', () => BT.editRoom(S.config));
  $('#lobbyLeave').addEventListener('click', () => leave(true));
  $('#podiumLeave').addEventListener('click', () => leave(true));
  $('#podiumReplay').addEventListener('click', backToLobby);
  $('#roomCode').addEventListener('click', () => BT.shareOrCopy(null, null, 'Lien d\'invitation copié !', inviteUrl()));
  $('#copyInvite').addEventListener('click', () => BT.shareOrCopy(null, null, 'Lien d\'invitation copié !', inviteUrl()));
  $('#shareInvite').addEventListener('click', () => BT.shareOrCopy({ title: 'BlindTest en ligne', text: `🎧 Rejoins mon blind test ! Code : ${S.code}`, url: inviteUrl() }, null, 'Lien d\'invitation copié !'));

  BT.Online = {
    host, join, leave,
    active: () => !!S.peer,
    isHosting: () => !!S.peer && S.isHost,
    state: () => S.state,
    _state: S, // pour le débogage
  };
})();
