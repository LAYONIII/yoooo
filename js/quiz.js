/* =========================================================
   quiz.js : l'écran de question (extrait audio, vinyle, chrono
   circulaire, 4 réponses, jokers). Utilisé par le solo ET le mode
   en ligne : le « moteur » de jeu lui donne une question et reçoit
   la réponse via onAnswer.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, sfx } = BT;

  const audio = $('#audio');
  const ringFg = $('#ringFg');
  const RING = 2 * Math.PI * 56;
  ringFg.style.strokeDasharray = RING;

  let q = null;       // question en cours
  let rafId = 0;
  let lastFrame = 0;
  let startTimer = 0; // sécurité si l'audio ne démarre jamais

  function setRing(ratio, text) {
    ratio = Math.max(0, Math.min(1, ratio));
    ringFg.style.strokeDashoffset = RING * (1 - ratio);
    ringFg.classList.toggle('warn', ratio < 0.5 && ratio >= 0.25);
    ringFg.classList.toggle('danger', ratio < 0.25);
    if (text !== undefined) $('#timeLeft').textContent = text;
  }

  function renderAnswers() {
    const box = $('#answers');
    box.innerHTML = '';
    q.choices.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'answer';
      b.type = 'button';
      b.style.animationDelay = `${i * 60}ms`;
      b.innerHTML = `<span class="key">${i + 1}</span><span class="a-text">${esc(c.label)}${c.sub ? `<span class="a-sub">${esc(c.sub)}</span>` : ''}</span>`;
      b.addEventListener('click', () => Quiz.answer(i));
      box.appendChild(b);
    });
  }

  function beginTimer() {
    if (!q || q.started || q.locked) return;
    clearTimeout(startTimer);
    q.started = true;
    q.startAt = performance.now();
    lastFrame = q.startAt;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(loop);
  }

  function loop(now) {
    if (!q || q.locked) return;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    const prev = q.elapsed;
    q.elapsed = (now - q.startAt) / 1000;
    if (q.time) {
      const left = Math.max(0, q.time - q.elapsed);
      const prevLeft = q.time - prev;
      if (Math.ceil(left) !== Math.ceil(prevLeft) && left <= 3 && left > 0) sfx('tick');
      setRing(left / q.time, Math.ceil(left));
      if (left <= 0) { Quiz.answer(null); return; }
    }
    if (q.onTick) q.onTick(dt, q.elapsed);
    if (q && !q.locked) rafId = requestAnimationFrame(loop);
  }

  function playAudio(fresh) {
    if (!q) return;
    if (fresh) {
      audio.src = q.preview;
      audio.load();
      audio.addEventListener('loadedmetadata', () => {
        if (!q) return;
        const dur = isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 30;
        if (q.offset === 'random') q.offset = Math.random() * Math.max(0, dur - (q.time || 10) - 1);
        q.offset = Math.min(+q.offset || 0, Math.max(0, dur - 2));
        try { audio.currentTime = q.offset; } catch { /* ignore */ }
      }, { once: true });
    } else {
      try { audio.currentTime = typeof q.offset === 'number' ? q.offset : 0; } catch { /* ignore */ }
    }
    const p = audio.play();
    if (p && p.catch) p.catch((err) => {
      if (err && err.name === 'NotAllowedError' && q) {
        // lecture automatique bloquée par le navigateur : on demande un clic
        $('#reveal').innerHTML = '<button class="btn" id="tapToPlay">▶ Lancer l\'extrait</button>';
        $('#tapToPlay').addEventListener('click', () => { $('#reveal').innerHTML = ''; playAudio(false); });
      }
    });
  }

  // ---------- Événements audio ----------
  audio.addEventListener('playing', () => { document.body.classList.add('is-playing'); beginTimer(); });
  ['pause', 'ended', 'emptied'].forEach((ev) => audio.addEventListener(ev, () => document.body.classList.remove('is-playing')));
  audio.addEventListener('error', () => {
    if (!q || q.locked || !audio.getAttribute('src')) return;
    const cb = q.onError;
    q.locked = true;
    cancelAnimationFrame(rafId);
    if (cb) cb();
  });

  // ---------- Barres animées (visualiseur décoratif) ----------
  const bars = $('#bars');
  const bctx = bars.getContext('2d');
  const N = 48;
  const heights = new Array(N).fill(2);
  function drawBars(t) {
    if (document.body.dataset.screen === 'play') {
      const playing = document.body.classList.contains('is-playing');
      const w = bars.width; const h = bars.height;
      bctx.clearRect(0, 0, w, h);
      const grad = bctx.createLinearGradient(0, 0, w, 0);
      grad.addColorStop(0, '#ff2e93'); grad.addColorStop(0.5, '#8b5cf6'); grad.addColorStop(1, '#22d3ee');
      bctx.fillStyle = grad;
      const bw = w / N;
      for (let i = 0; i < N; i++) {
        const target = playing
          ? 6 + (h - 8) * Math.abs(Math.sin(t / 260 + i * 0.55) * Math.cos(t / 410 + i * 0.23)) * (0.55 + 0.45 * Math.sin(t / 900 + i))
          : 3;
        heights[i] += (target - heights[i]) * 0.2;
        const bh = Math.max(3, heights[i]);
        const x = i * bw + bw * 0.2;
        bctx.beginPath();
        if (bctx.roundRect) bctx.roundRect(x, (h - bh) / 2, bw * 0.6, bh, 3); else bctx.rect(x, (h - bh) / 2, bw * 0.6, bh);
        bctx.fill();
      }
    }
    requestAnimationFrame(drawBars);
  }
  requestAnimationFrame(drawBars);

  // ---------- API publique ----------
  const Quiz = {
    /**
     * opts : { preview, choices:[{label, sub}], time (s, ou null pour un chrono externe),
     *          offset (s ou 'random'), prompt, jokers:{fifty,hint,skip}|null,
     *          onAnswer(choice, elapsed), onJoker(type), onTick(dt), onError() }
     */
    ask(opts) {
      Quiz.stopTimer();
      q = Object.assign({ locked: false, started: false, elapsed: 0, startAt: 0, removed: new Set(), picked: null }, opts);
      $('#cover').classList.add('hidden');
      $('#cover').removeAttribute('src');
      $('#vinylLabel').classList.remove('hidden');
      $('#vinylLabel').textContent = '?';
      $('#vinyl').classList.remove('revealed');
      $('#reveal').innerHTML = '';
      $('#questionLabel').textContent = opts.prompt || 'Quel est ce titre ?';
      $('#nextBtn').classList.add('hidden');
      const j = opts.jokers;
      $('#jokerFifty').classList.toggle('hidden', !j);
      $('#jokerHint').classList.toggle('hidden', !j);
      $('#jokerSkip').classList.toggle('hidden', !j);
      if (j) {
        $('#jokerFifty').disabled = !j.fifty;
        $('#jokerHint').disabled = !j.hint;
        $('#jokerSkip').disabled = !j.skip;
      }
      $('#replayBtn').disabled = false;
      setRing(1, opts.time ? opts.time : '');
      renderAnswers();
      playAudio(true);
      // si le son met trop de temps à démarrer (connexion lente), on lance quand même le chrono
      startTimer = setTimeout(beginTimer, 7000);
    },

    answer(choice) {
      if (!q || q.locked) return;
      if (typeof choice === 'number' && q.removed.has(choice)) return;
      q.locked = true;
      Quiz.stopTimer();
      q.picked = choice;
      const elapsed = q.started ? q.elapsed : 0;
      $$('#answers .answer').forEach((b, i) => { b.disabled = true; if (i === choice) b.classList.add('picked'); });
      $('#jokerFifty').disabled = $('#jokerHint').disabled = $('#jokerSkip').disabled = true;
      if (q.onAnswer) q.onAnswer(choice, elapsed);
    },

    /** Affiche la bonne réponse. */
    reveal({ correctIndex, status, points = 0, title, sub, cover, message }) {
      const buttons = $$('#answers .answer');
      buttons.forEach((b) => (b.disabled = true));
      if (buttons[correctIndex]) buttons[correctIndex].classList.add('correct');
      const picked = q ? q.picked : null;
      if (typeof picked === 'number' && picked !== correctIndex && buttons[picked]) buttons[picked].classList.add('wrong');
      if (cover) {
        const img = $('#cover');
        img.src = cover;
        img.classList.remove('hidden');
        $('#vinylLabel').classList.add('hidden');
        $('#vinyl').classList.add('revealed');
      }
      const head = message || (status === 'ok' ? `<span class="r-points good">+${points} pts</span>`
        : status === 'skip' ? '<span class="r-points">Question passée</span>'
        : status === 'timeout' ? '<span class="r-points bad">⏰ Temps écoulé !</span>'
        : status === 'none' ? '<span class="r-points">Bonne réponse :</span>'
        : '<span class="r-points bad">Raté !</span>');
      $('#reveal').innerHTML = `${head}<div class="r-title">${esc(title)}</div>${sub ? `<div class="r-sub">${esc(sub)}</div>` : ''}`;
      if (status === 'ok') sfx('good'); else if (status === 'ko' || status === 'timeout') sfx('bad');
      if (q) q.locked = true;
      Quiz.stopTimer();
    },

    removeChoices(indexes) {
      if (!q) return;
      const buttons = $$('#answers .answer');
      indexes.forEach((i) => { q.removed.add(i); buttons[i].classList.add('removed'); buttons[i].disabled = true; });
    },
    showHint(text) { $('#reveal').innerHTML = `<span class="hint-chip">💡 ${esc(text)}</span>`; },
    setMessage(html) { $('#reveal').innerHTML = html; },
    setRing,
    combo(text) {
      const el = $('#combo');
      if (!text) { el.classList.add('hidden'); return; }
      el.textContent = text;
      el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    },
    next(label, fn) {
      const b = $('#nextBtn');
      b.textContent = label;
      b.onclick = () => { b.classList.add('hidden'); fn(); };
      b.classList.remove('hidden');
      b.focus({ preventScroll: true });
    },
    hideNext() { $('#nextBtn').classList.add('hidden'); },
    setHud(items) {
      $('#hud').innerHTML = items.map((it) => `<div class="hud-item${it.hidden ? ' hidden' : ''}" data-hud="${it.id}"><span class="hud-label">${esc(it.label)}</span><b>${esc(it.value)}</b></div>`).join('');
    },
    updateHud(id, value, bump) {
      const el = $(`[data-hud="${id}"] b`);
      if (!el) return;
      el.textContent = value;
      if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
    },
    replay() { if (q) playAudio(false); },
    elapsed() { return q ? q.elapsed : 0; },
    isLocked() { return !q || q.locked; },
    stopTimer() { cancelAnimationFrame(rafId); clearTimeout(startTimer); },
    stop() {
      Quiz.stopTimer();
      q = null;
      audio.pause();
      audio.removeAttribute('src');
      try { audio.load(); } catch { /* ignore */ }
    },
    pauseAudio() { audio.pause(); },
    get current() { return q; },
  };

  // Boutons
  $('#replayBtn').addEventListener('click', () => Quiz.replay());
  $('#jokerFifty').addEventListener('click', () => q && !q.locked && q.onJoker && q.onJoker('fifty'));
  $('#jokerHint').addEventListener('click', () => q && !q.locked && q.onJoker && q.onJoker('hint'));
  $('#jokerSkip').addEventListener('click', () => q && !q.locked && q.onJoker && q.onJoker('skip'));

  // Raccourcis clavier
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'play' || document.querySelector('dialog[open]')) return;
    if (e.target.matches('input, textarea')) return;
    const map = { 1: 0, 2: 1, 3: 2, 4: 3, '&': 0, 'é': 1, '"': 2, "'": 3 };
    if (e.key in map && q && !q.locked) { e.preventDefault(); Quiz.answer(map[e.key]); }
    else if (e.key === ' ') { e.preventDefault(); Quiz.replay(); }
    else if (e.key === 'Enter' && !$('#nextBtn').classList.contains('hidden')) { e.preventDefault(); $('#nextBtn').click(); }
  });

  BT.Quiz = Quiz;
})();
