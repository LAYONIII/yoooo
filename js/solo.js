/* =========================================================
   solo.js : déroulement d'une partie solo (Classique, Survie, Chrono),
   écran de résultats, récap et lien de défi.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, store, show, toast, Quiz, DIFFICULTY, MODES, fmtSec } = BT;

  const CHRONO_TIME = 90;
  const CHRONO_PENALTY = 5;
  const LIVES = 3;
  let game = null;

  async function start(sources, opts) {
    BT.Quiz.stop();
    show('loading');
    $('#loadingText').textContent = `Chargement : ${sources.map((s) => s.name).join(', ')}…`;
    let pool;
    try {
      pool = await BT.loadPool(sources, opts, (txt) => { $('#loadingText').textContent = `Chargement de toute la discographie… ${txt}`; });
    } catch (err) {
      BT.homeError(err.message);
      return;
    }
    BT.trackPlayed(sources);
    BT.addRecent(sources);
    BT.lastGame = { type: 'quiz', sources, opts };

    const diff = DIFFICULTY[opts.difficulty];
    const queue = BT.freshShuffle(pool.tracks);
    game = {
      sources, opts, diff, pool, queue,
      total: opts.mode === 'classic' ? Math.min(+opts.rounds, queue.length) : queue.length,
      index: -1, score: 0, streak: 0, bestStreak: 0, lives: LIVES, chronoLeft: CHRONO_TIME,
      correct: 0, answered: 0, times: [], history: [],
      jokers: { fifty: true, hint: true, skip: true }, usedJoker: false, dots: [],
      over: false,
    };
    if (opts.mode === 'classic' && queue.length < +opts.rounds) toast(`Seulement ${queue.length} morceaux disponibles : la partie sera plus courte.`);

    Quiz.setHud([
      { id: 'progress', label: opts.mode === 'classic' ? 'Question' : 'Trouvés', value: '' },
      { id: 'score', label: 'Score', value: 0 },
      { id: 'streak', label: 'Série', value: 0 },
      { id: 'lives', label: 'Vies', value: '', hidden: opts.mode !== 'survival' },
      { id: 'chrono', label: 'Temps', value: CHRONO_TIME, hidden: opts.mode !== 'chrono' },
    ]);
    $('#scoreboardWrap').classList.add('hidden');
    $('#playEmojiBar').classList.add('hidden');
    $('#replayBtn').classList.remove('hidden');
    document.body.dataset.playMode = 'solo';
    $('#pauseBtn').classList.remove('hidden');
    Quiz.setDots([], opts.mode === 'classic' ? game.total : 0, 0);
    $('#flip').classList.remove('flipped');
    $('#answers').innerHTML = '';
    $('#reveal').innerHTML = `<span class="r-sub">🎵 ${pool.count} morceaux chargés</span>`;
    show('play');
    Quiz.combo(null);
    const g = game;
    await BT.countdown(3);
    if (game === g && !g.over) next();
  }

  function finished() {
    const g = game;
    if (g.index + 1 >= g.queue.length) return true;
    if (g.opts.mode === 'classic') return g.index + 1 >= g.total;
    if (g.opts.mode === 'survival') return g.lives <= 0;
    if (g.opts.mode === 'chrono') return g.chronoLeft <= 0;
    return false;
  }

  function updateHud(bump) {
    const g = game;
    Quiz.updateHud('progress', g.opts.mode === 'classic' ? `${Math.max(1, g.index + 1)}/${g.total}` : g.correct);
    Quiz.updateHud('score', g.score, bump);
    Quiz.updateHud('streak', g.streak >= 3 ? `${g.streak} 🔥` : g.streak);
    Quiz.updateHud('lives', '❤️'.repeat(Math.max(0, g.lives)) + '🖤'.repeat(LIVES - Math.max(0, g.lives)));
    Quiz.updateHud('chrono', Math.ceil(g.chronoLeft));
  }

  function next() {
    const g = game;
    if (!g || g.over) return;
    Quiz.pauseAudio();
    if (finished()) { end(); return; }
    g.index++;
    const track = g.queue[g.index];
    const question = BT.makeQuestion(g.pool, track);
    g.current = { track, question, hinted: false };
    updateHud();
    if (g.opts.mode === 'classic') Quiz.setDots(g.dots, g.total, g.index);
    const chrono = g.opts.mode === 'chrono';
    Quiz.ask({
      preview: track.preview,
      choices: question.choices,
      prompt: question.prompt,
      time: chrono ? null : g.diff.time,
      offset: g.diff.randomStart ? 'random' : 0,
      jokers: { ...g.jokers },
      onAnswer: (choice, elapsed) => onAnswer(g, choice, elapsed),
      onJoker: (type) => onJoker(g, type),
      onPause: () => Quiz.pause(),
      onError: () => {
        if (game !== g || g.over) return;
        toast('Extrait indisponible, morceau suivant…');
        if (g.opts.mode === 'classic') g.total = Math.min(g.total + 1, g.queue.length);
        setTimeout(next, 700);
      },
      onTick: chrono ? (dt) => {
        const before = Math.ceil(g.chronoLeft);
        g.chronoLeft = Math.max(0, g.chronoLeft - dt);
        const after = Math.ceil(g.chronoLeft);
        Quiz.setRing(g.chronoLeft / CHRONO_TIME, after);
        if (after !== before) { Quiz.updateHud('chrono', after); if (after <= 5 && after > 0) BT.sfx('tick'); }
        if (g.chronoLeft <= 0) { Quiz.stopTimer(); end(); }
      } : null,
    });
    if (chrono) Quiz.setRing(g.chronoLeft / CHRONO_TIME, Math.ceil(g.chronoLeft));
  }

  function onJoker(g, type) {
    const { question } = g.current;
    if (!g.jokers[type]) return;
    g.jokers[type] = false;
    g.usedJoker = true;
    if (type === 'fifty') {
      const wrong = BT.shuffle([0, 1, 2, 3].filter((i) => i !== question.correctIndex)).slice(0, 2);
      Quiz.removeChoices(wrong);
      $('#jokerFifty').disabled = true;
    } else if (type === 'hint') {
      g.current.hinted = true;
      Quiz.showHint(question.hint);
      $('#jokerHint').disabled = true;
    } else if (type === 'skip') {
      Quiz.answer('skip');
    }
  }

  function onAnswer(g, choice, elapsed) {
    if (game !== g || g.over) return;
    const { track, question, hinted } = g.current;
    const chrono = g.opts.mode === 'chrono';
    let status;
    let points = 0;
    if (choice === 'skip') status = 'skip';
    else if (choice === null) status = 'timeout';
    else if (choice === question.correctIndex) status = 'ok';
    else status = 'ko';

    if (status === 'ok') {
      g.streak++;
      g.bestStreak = Math.max(g.bestStreak, g.streak);
      g.correct++;
      points = BT.pointsFor({ elapsed, time: chrono ? 10 : g.diff.time, streak: g.streak, hinted });
      g.score += points;
      g.times.push(elapsed);
      if (elapsed > 0 && elapsed < 1.5) BT.unlock('speed');
      if (g.streak >= 10) BT.unlock('streak10');
    } else if (status !== 'skip') {
      g.streak = 0;
      if (g.opts.mode === 'survival') g.lives--;
      if (chrono) g.chronoLeft = Math.max(0, g.chronoLeft - CHRONO_PENALTY);
    }
    if (status !== 'skip') g.answered++;

    g.dots[g.index] = status;
    if (g.opts.mode === 'classic') Quiz.setDots(g.dots, g.total, -1);
    g.history.push({ track, status, points, time: elapsed, picked: typeof choice === 'number' ? question.choices[choice].label : null });

    Quiz.reveal({
      correctIndex: question.correctIndex, status, points,
      title: g.pool.guess === 'artist' ? track.artistName : track.title,
      sub: g.pool.guess === 'artist' ? `« ${track.title} »${track.album ? ' · ' + track.album : ''}` : `${track.artistName}${track.album ? ' · ' + track.album : ''}`,
      cover: track.cover,
    });
    const mult = BT.multiplierFor(g.streak);
    if (status === 'ok' && mult > 1) Quiz.combo(`🔥 ×${String(mult).replace('.', ',')}`);
    else if (g.streak === 0) Quiz.combo(null);
    updateHud(status === 'ok');

    const done = finished();
    if (chrono) {
      setTimeout(() => { if (game === g && !g.over) next(); }, done ? 500 : 1000);
    } else {
      Quiz.next(done ? 'Voir les résultats 🏁' : 'Suivant ➜', next);
    }
  }

  function scoreKey(g) {
    return [g.opts.mode, g.opts.difficulty, g.opts.mode === 'classic' ? g.opts.rounds : '', g.opts.pool, g.opts.guess, g.sources.map(BT.sourceKey).sort().join('-')].join('|');
  }

  function end() {
    const g = game;
    if (!g || g.over) return;
    g.over = true;
    Quiz.stop();
    BT.sfx('end');
    BT.markPlayed(g.history.map((h) => h.track.id));

    const acc = g.answered ? Math.round((g.correct / g.answered) * 100) : 0;
    const avg = g.times.length ? g.times.reduce((a, b) => a + b, 0) / g.times.length : 0;

    const records = store.get('records', {});
    const key = scoreKey(g);
    const isRecord = g.score > 0 && g.score > (records[key] || 0);
    if (isRecord) { records[key] = g.score; store.set('records', records); }

    BT.saveScore({
      name: BT.displayName(), avatar: BT.profile.avatar, score: g.score, correct: g.correct, answered: g.answered,
      mode: g.opts.mode, difficulty: g.opts.difficulty, guess: g.opts.guess, artists: g.sources.map((s) => s.name), bestStreak: g.bestStreak,
    });

    // succès
    const n = g.answered;
    BT.unlock('first');
    if (n >= 10 && acc === 100) BT.unlock('perfect');
    if (g.opts.mode === 'survival' && g.correct >= 20) BT.unlock('survivor');
    if (g.opts.mode === 'chrono' && g.correct >= 20) BT.unlock('flash');
    if (g.opts.difficulty === 'hard' && n >= 10 && acc >= 80) BT.unlock('hardcore');
    if (!g.usedJoker && n >= 10 && acc >= 80) BT.unlock('nojoker');
    if (g.opts.guess === 'artist' && n >= 10 && acc >= 80) BT.unlock('whois');

    const ranks = [
      [90, '👑', 'Légende !', 'Tu connais tout par cœur.'],
      [70, '🔥', 'Gros niveau !', 'Un vrai fan, ça se voit.'],
      [50, '😎', 'Pas mal du tout', 'Encore quelques écoutes et tu seras au top.'],
      [25, '🎧', 'Ça vient…', 'Il est temps de réécouter les albums.'],
      [0, '🙈', 'Aïe…', "T'es sûr que tu écoutes ça ?"],
    ];
    const [, emoji, title, sub] = ranks.find(([min]) => acc >= min);
    $('.results .stats-row').innerHTML = DEFAULT_STATS;
    $('#rankEmoji').textContent = emoji;
    $('#rankTitle').textContent = title;
    $('#rankSub').textContent = `${sub} · ${g.sources.map((s) => s.name).join(', ')} · ${MODES[g.opts.mode]} · ${DIFFICULTY[g.opts.difficulty].label}`;
    BT.countUp($('#finalScore'), g.score);
    $('#newRecord').classList.toggle('hidden', !isRecord);
    $('#statCorrect').textContent = `${g.correct}/${g.answered}`;
    $('#statAccuracy').textContent = `${acc}%`;
    $('#statBestStreak').textContent = g.bestStreak;
    $('#statAvgTime').textContent = fmtSec(avg);
    $('#shareMsg').classList.add('hidden');

    const ch = BT.challenge;
    if (ch) {
      const won = g.score > ch.score;
      toast(won ? `Tu as battu ${ch.name} (${ch.score} pts) !` : `${ch.name} reste devant avec ${ch.score} pts…`, { icon: won ? '🏆' : '😤', ms: 5000 });
      BT.challenge = null;
      $('#challengeBanner')?.remove();
    }

    renderRecap($('#recap'), g.history);
    show('results');
    if (acc >= 70 || (isRecord && acc >= 50)) setTimeout(() => BT.confetti(), 300);
  }

  // ---------- Écran de résultats générique (utilisé par les battles) ----------
  const DEFAULT_STATS = $('.results .stats-row').innerHTML;
  function showResults({ emoji, title, sub, score, stats, recap, confetti }) {
    $('#rankEmoji').textContent = emoji;
    $('#rankTitle').textContent = title;
    $('#rankSub').textContent = sub;
    BT.countUp($('#finalScore'), score);
    $('#newRecord').classList.add('hidden');
    $('#shareMsg').classList.add('hidden');
    $('.results .stats-row').innerHTML = stats.map(([v, l]) => `<div data-tilt="10"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
    renderRecap($('#recap'), recap);
    show('results');
    if (confetti) setTimeout(() => BT.confetti(), 300);
  }

  // ---------- Récap (partagé avec le mode en ligne) ----------
  const recapAudio = $('#recapAudio');
  function renderRecap(list, history) {
    list.innerHTML = '';
    history.forEach((h) => {
      const li = document.createElement('li');
      li.className = h.status;
      const icon = h.status === 'ok' ? '✅' : h.status === 'skip' ? '⏭️' : h.status === 'none' ? '🎵' : '❌';
      const detail = h.detail || (h.status === 'ok' ? `+${h.points} pts · ${fmtSec(h.time)}`
        : h.status === 'skip' ? 'Passée'
        : h.picked ? `Tu as répondu : ${esc(h.picked)}` : 'Temps écoulé');
      li.innerHTML = `
        ${h.track.coverSmall ? `<img src="${esc(h.track.coverSmall)}" alt="" loading="lazy">` : '<span class="no-cover">♪</span>'}
        <div class="recap-text"><div class="t">${icon} ${esc(h.track.title)}</div><div class="s">${esc(h.track.artistName)} · ${detail}</div></div>
        <button class="play" type="button" aria-label="Écouter">▶</button>
        <a href="${esc(h.track.link)}" target="_blank" rel="noopener">Deezer ↗</a>`;
      const play = li.querySelector('.play');
      play.addEventListener('click', () => {
        const playingThis = recapAudio.dataset.id === String(h.track.id) && !recapAudio.paused;
        $$('.recap .play').forEach((b) => (b.textContent = '▶'));
        if (playingThis) { recapAudio.pause(); return; }
        recapAudio.src = h.track.preview;
        recapAudio.dataset.id = h.track.id;
        recapAudio.play().catch(() => toast('Impossible de lire cet extrait'));
        play.textContent = '⏸';
      });
      list.appendChild(li);
    });
  }
  recapAudio.addEventListener('ended', () => $$('.recap .play').forEach((b) => (b.textContent = '▶')));

  // ---------- Boutons de l'écran de résultats ----------
  $('#replaySameBtn').addEventListener('click', () => {
    recapAudio.pause();
    const last = BT.lastGame;
    if (last && last.type === 'battle') BT.Battle.start(last.sources, last.opts);
    else if (last && last.type === 'pick') BT.Pick.start(last.sources, last.opts);
    else start(game.sources, game.opts);
  });
  $('#homeBtn').addEventListener('click', () => { recapAudio.pause(); show('home'); });
  $('#shareBtn').addEventListener('click', async () => {
    const last = BT.lastGame;
    if (last && (last.type === 'battle' || last.type === 'pick')) {
      const url = `${location.origin}${location.pathname}`;
      const text = `${last.type === 'pick' ? '🏆' : '⚔️'} J'ai fait ${$('#finalScore').textContent} pts en ${last.type === 'pick' ? 'Défi thème' : 'Battle'} sur BlindTest (${last.sources.map((s) => s.name).join(' / ')}). À toi de jouer !`;
      await BT.shareOrCopy({ title: 'BlindTest', text, url }, $('#shareMsg'), 'Message copié ! Envoie-le à tes potes.');
      return;
    }
    const g = game;
    const params = new URLSearchParams({
      a: g.sources.filter((s) => s.type === 'artist').map((s) => s.id).join(','),
      c: g.sources.filter((s) => s.type === 'chart').map((s) => s.id).join(','),
      m: g.opts.mode, d: g.opts.difficulty, r: g.opts.rounds, p: g.opts.pool, g: g.opts.guess,
      s: g.score, n: BT.displayName(),
    });
    const url = `${location.origin}${location.pathname}?${params}`;
    const text = `🎧 J'ai fait ${g.score} pts au BlindTest ${g.sources.map((s) => s.name).join(' / ')} (${g.correct}/${g.answered}). Tu fais mieux ?`;
    await BT.shareOrCopy({ title: 'BlindTest', text, url }, $('#shareMsg'), 'Lien du défi copié ! Envoie-le à tes potes.');
  });

  async function quit() {
    if (document.body.dataset.playMode === 'online') { BT.Online.leave(true); return; }
    const wasPaused = Quiz.isPaused();
    if (!wasPaused) Quiz.pause();
    const ok = await BT.confirmBox('Quitter la partie ? Ton score ne sera pas enregistré.', { ok: 'Quitter', cancel: 'Continuer', danger: true });
    if (!ok) { if (!wasPaused) Quiz.resume(); return; }
    if (game) game.over = true;
    Quiz.stop();
    show('home');
  }
  $('#quitBtn').addEventListener('click', quit);
  $('#pauseQuit').addEventListener('click', quit);
  $('#pauseBtn').addEventListener('click', () => Quiz.pause());
  $('#pauseResume').addEventListener('click', () => Quiz.resume());

  BT.Solo = { start, quit, showResults, isRunning: () => !!game && !game.over, abort: () => { if (game) game.over = true; Quiz.stop(); } };
  BT.renderRecap = renderRecap;
})();
