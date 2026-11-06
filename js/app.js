/* =========================================================
   app.js : écran d'accueil (choix de la musique, réglages),
   profil, classement, succès, liens de défi / d'invitation.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, store, show, toast, api, CHARTS, sourceKey, initials, fmtFans, DIFFICULTY, MODES, AVATARS, profile } = BT;

  const MAX_SELECTED = 8;
  const PRESETS = {
    fr: ['Ninho', 'Jul', 'PNL', 'Damso', 'SCH', 'Booba', 'Gazo', 'Tiakola', 'Nekfeu', 'Orelsan', 'Niska', 'Werenoi', 'Hamza', 'Naps', 'Lacrim', 'Kaaris', 'Gims', 'Soolking'],
    us: ['Drake', 'Kendrick Lamar', 'Travis Scott', 'Eminem', 'Kanye West', 'Future', 'J. Cole', '21 Savage', 'Lil Baby', 'Post Malone', 'Nicki Minaj', 'Tyler, The Creator'],
    pop: ['Aya Nakamura', 'Angèle', 'Stromae', 'Dua Lipa', 'The Weeknd', 'Rihanna', 'Beyoncé', 'Taylor Swift', 'Bad Bunny', 'Billie Eilish', 'Ed Sheeran', 'Indila'],
  };

  const selected = new Map(); // clé -> source (artiste ou playlist)
  const settings = Object.assign({ play: 'solo', mode: 'classic', rounds: '10', guess: 'title', difficulty: 'normal', pool: '25' }, store.get('settings2', {}));
  const saveSettings = () => store.set('settings2', settings);

  // ---------- Fonctions partagées ----------
  BT.homeError = (msg) => {
    show('home');
    const el = $('#homeError');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  };

  BT.addRecent = (sources) => {
    const slim = sources.map(({ type, id, name, picture, fans, emoji, desc }) => ({ type, id, name, picture, fans, emoji, desc }));
    const keys = new Set(slim.map(sourceKey));
    store.set('recent2', [...slim, ...store.get('recent2', []).filter((r) => !keys.has(sourceKey(r)))].slice(0, 16));
  };

  BT.saveScore = (entry) => {
    const scores = store.get('scores2', []);
    scores.push({ ...entry, date: Date.now() });
    scores.sort((a, b) => b.score - a.score);
    store.set('scores2', scores.slice(0, 300));
  };

  BT.shareOrCopy = async (shareData, msgEl, copiedText, rawUrl) => {
    const text = shareData ? `${shareData.text}\n${shareData.url}` : rawUrl;
    try {
      if (shareData && navigator.share && location.protocol.startsWith('http')) { await navigator.share(shareData); return; }
      await navigator.clipboard.writeText(text);
      if (msgEl) { msgEl.textContent = `✅ ${copiedText}`; msgEl.classList.remove('hidden'); }
      else toast(copiedText, { icon: '🔗' });
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (msgEl) { msgEl.textContent = text; msgEl.classList.remove('hidden'); }
      else prompt('Copie ce lien :', shareData ? shareData.url : rawUrl);
    }
  };

  BT.editRoom = (config) => {
    selected.clear();
    config.sources.forEach((s) => selected.set(sourceKey(s), s));
    Object.assign(settings, config.opts, { play: 'online' });
    renderSettings();
    renderSelected();
    show('home');
    setTimeout(() => $('#setup').scrollIntoView({ behavior: 'smooth' }), 250);
  };
  BT.onLeaveRoom = () => renderSelected();

  // ---------- Volume ----------
  const audioEls = [$('#audio'), $('#recapAudio')];
  function applyVolume() {
    const { volume, muted } = BT.sound;
    audioEls.forEach((a) => { a.volume = volume; a.muted = muted; });
    $('#volume').value = volume;
    $('#volume').style.setProperty('--v', `${volume * 100}%`);
    $('#muteBtn').textContent = muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊';
  }
  $('#volume').addEventListener('input', (e) => {
    BT.sound.volume = +e.target.value; BT.sound.muted = false;
    store.set('volume', BT.sound.volume); store.set('muted', false); applyVolume();
  });
  $('#muteBtn').addEventListener('click', () => { BT.sound.muted = !BT.sound.muted; store.set('muted', BT.sound.muted); applyVolume(); });
  applyVolume();

  // ---------- Cartes artistes / playlists ----------
  function sourceCard(src, { preset } = {}) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `artist${src.type === 'chart' ? ' chart' : ''}`;
    if (src.id !== undefined) btn.dataset.key = sourceKey(src);
    btn.dataset.name = src.name;
    let pic;
    if (src.type === 'chart') pic = `<div class="avatar chart-ico">${esc(src.emoji)}</div>`;
    else if (src.picture) pic = `<img class="avatar" src="${esc(src.picture)}" alt="" loading="lazy">`;
    else pic = `<div class="avatar">${esc(initials(src.name))}</div>`;
    btn.innerHTML = `${pic}<div class="artist-name">${esc(src.name)}</div><div class="artist-fans">${src.type === 'chart' ? esc(src.desc) : src.fans ? fmtFans(src.fans) : '&nbsp;'}</div>`;
    btn.addEventListener('click', async () => {
      let s = src;
      if (preset && s.id === undefined) {
        btn.classList.add('loading');
        try { s = await api.resolve(src.name); } catch (err) { toast(err.message, { icon: '⚠️' }); btn.classList.remove('loading'); return; }
        btn.classList.remove('loading');
        btn.dataset.key = sourceKey(s);
      }
      toggle(s);
    });
    return btn;
  }

  function toggle(s) {
    const key = sourceKey(s);
    if (selected.has(key)) selected.delete(key);
    else {
      if (selected.size >= MAX_SELECTED) { toast(`${MAX_SELECTED} choix maximum par partie`, { icon: '⚠️' }); return; }
      selected.set(key, s);
      BT.sfx('pop');
    }
    renderSelected();
  }

  function renderSelected() {
    const chips = $('#selected');
    $('#selectedWrap').classList.toggle('hidden', selected.size === 0);
    $('#selectedCount').textContent = `${selected.size}/${MAX_SELECTED}`;
    chips.innerHTML = '';
    for (const [key, s] of selected) {
      const chip = document.createElement('span');
      chip.className = 'chip';
      const pic = s.type === 'chart' ? `<span class="mini">${esc(s.emoji)}</span>` : s.picture ? `<img src="${esc(s.picture)}" alt="">` : `<span class="mini">${esc(initials(s.name))}</span>`;
      chip.innerHTML = `${pic}${esc(s.name)}<button type="button" aria-label="Retirer ${esc(s.name)}">✕</button>`;
      chip.querySelector('button').addEventListener('click', () => { selected.delete(key); renderSelected(); });
      chips.appendChild(chip);
    }
    $$('.artist').forEach((card) => {
      const key = card.dataset.key || (api.presetCache[card.dataset.name] && sourceKey(api.presetCache[card.dataset.name]));
      card.classList.toggle('selected', !!key && selected.has(key));
    });
    renderStartBtn();
  }

  function renderStartBtn() {
    const btn = $('#startBtn');
    const n = selected.size;
    btn.disabled = n === 0;
    const names = [...selected.values()].map((s) => s.name);
    const what = n === 1 ? names[0] : `${n} choix (mix)`;
    if (n === 0) btn.textContent = 'Choisis au moins un artiste ou une playlist';
    else if (settings.play === 'online') btn.textContent = BT.Online.isHosting() ? '✔ Mettre à jour le salon' : `🌐 Créer le salon · ${what}`;
    else btn.textContent = `▶ Jouer · ${what}`;
  }

  let currentCat = 'fr';
  function renderPresets() {
    const grid = $('#presets');
    grid.innerHTML = '';
    if (currentCat === 'recent') {
      const recents = store.get('recent2', []);
      if (!recents.length) { grid.innerHTML = '<p class="empty">Les artistes et playlists avec lesquels tu as joué apparaîtront ici.</p>'; return; }
      recents.forEach((s) => grid.appendChild(sourceCard(s)));
    } else if (currentCat === 'charts') {
      CHARTS.forEach((c) => grid.appendChild(sourceCard(c)));
    } else {
      const names = PRESETS[currentCat];
      names.forEach((name) => grid.appendChild(sourceCard(api.presetCache[name] || { type: 'artist', name }, { preset: true })));
      loadPresetPictures(names);
    }
    renderSelected();
  }

  // Charge les photos des suggestions en tâche de fond (une par une)
  async function loadPresetPictures(names) {
    for (const name of names) {
      if (api.presetCache[name]) continue;
      try {
        const a = await api.resolve(name);
        const old = $(`#presets .artist[data-name="${CSS.escape(name)}"]`);
        if (old) { old.replaceWith(sourceCard(a, { preset: true })); renderSelected(); }
      } catch { /* on garde les initiales */ }
    }
  }

  $$('.tab').forEach((tab) => tab.addEventListener('click', () => {
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    currentCat = tab.dataset.cat;
    renderPresets();
  }));
  $('#clearSel').addEventListener('click', () => { selected.clear(); renderSelected(); });

  // ---------- Recherche ----------
  let searchSeq = 0;
  async function doSearch() {
    const q = $('#searchInput').value.trim();
    const box = $('#searchResults');
    if (!q) { box.innerHTML = ''; return; }
    const seq = ++searchSeq;
    box.innerHTML = '<p class="empty"><span class="dots"><i></i><i></i><i></i></span> Recherche…</p>';
    try {
      const results = await api.search(q);
      if (seq !== searchSeq) return;
      box.innerHTML = '';
      if (!results.length) { box.innerHTML = `<p class="empty">Aucun artiste trouvé pour « ${esc(q)} »</p>`; return; }
      results.forEach((a) => box.appendChild(sourceCard(a)));
      renderSelected();
    } catch (err) {
      if (seq === searchSeq) box.innerHTML = `<p class="empty">${esc(err.message)}</p>`;
    }
  }
  let debounce;
  $('#searchForm').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(debounce); doSearch(); });
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(debounce);
    const v = e.target.value.trim();
    if (!v) { $('#searchResults').innerHTML = ''; return; }
    if (v.length >= 2) debounce = setTimeout(doSearch, 400);
  });

  // ---------- Réglages ----------
  const HELP = {
    classic: 'Un nombre fixe de questions. Vise le meilleur score !',
    survival: "3 vies. Chaque erreur en coûte une : tiens le plus longtemps possible.",
    chrono: '90 secondes pour trouver un maximum de titres. Une erreur coûte 5 s.',
    online: "Tu crées un salon et tu donnes le code à tes potes. Tout le monde entend le même extrait en même temps, et le premier à trouver gagne +50 pts.",
  };
  function renderSettings() {
    $$('.settings .seg').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings[key]));
    });
    const online = settings.play === 'online';
    $$('[data-only="solo"]').forEach((el) => el.classList.toggle('hidden', online));
    $$('[data-only="rounds"]').forEach((el) => el.classList.toggle('hidden', !online && settings.mode !== 'classic'));
    $('#settingHelp').textContent = online ? HELP.online : HELP[settings.mode];
    renderStartBtn();
  }
  $$('.settings .seg').forEach((seg) => seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    settings[seg.dataset.setting] = b.dataset.value;
    saveSettings();
    renderSettings();
  }));

  $$('[data-play]').forEach((b) => b.addEventListener('click', () => {
    settings.play = b.dataset.play;
    saveSettings();
    renderSettings();
    $('#setup').scrollIntoView({ behavior: 'smooth' });
  }));

  $('#startBtn').addEventListener('click', () => {
    $('#homeError').classList.add('hidden');
    const sources = [...selected.values()];
    if (!sources.length) return;
    if (settings.play === 'online') BT.Online.host(sources, { ...settings, mode: 'online' });
    else BT.Solo.start(sources, { ...settings });
  });

  $('#logoBtn').addEventListener('click', () => {
    if (BT.Online.active()) { BT.Online.leave(true); return; }
    if (BT.Solo.isRunning() && document.body.dataset.screen === 'play') {
      if (!confirm('Quitter la partie en cours ?')) return;
      BT.Solo.abort();
    }
    show('home');
  });

  // ---------- Profil ----------
  function renderProfile() {
    $('#profileAvatar').textContent = profile.avatar;
    $('#profileName').textContent = BT.displayName();
  }
  function avatarPicker(box, onPick) {
    box.innerHTML = AVATARS.map((a) => `<button type="button" class="${a === profile.avatar ? 'active' : ''}" data-a="${a}">${a}</button>`).join('');
    box.onclick = (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      profile.avatar = b.dataset.a;
      BT.saveProfile();
      box.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
      renderProfile();
      if (onPick) onPick();
    };
  }
  $('#profileBtn').addEventListener('click', () => {
    $('#nameInput').value = profile.name;
    avatarPicker($('#avatars'));
    $('#profileDialog').showModal();
  });
  $('#nameInput').addEventListener('input', (e) => { profile.name = e.target.value.trim().slice(0, 16); BT.saveProfile(); renderProfile(); });

  // ---------- Rejoindre un salon ----------
  let pendingCode = '';
  function openJoin(code) {
    pendingCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (pendingCode.length !== 6) { toast('Le code doit faire 6 caractères', { icon: '⚠️' }); return; }
    $('#joinDialogCode').textContent = pendingCode;
    $('#joinName').value = profile.name;
    avatarPicker($('#joinAvatars'));
    $('#joinDialog').showModal();
    setTimeout(() => $('#joinName').focus(), 50);
  }
  $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); openJoin($('#joinCode').value); });
  $('#joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
  $('#joinConfirm').addEventListener('click', () => {
    const name = $('#joinName').value.trim().slice(0, 16);
    if (!name) { toast('Choisis un pseudo', { icon: '✏️' }); $('#joinName').focus(); return; }
    profile.name = name;
    BT.saveProfile();
    renderProfile();
    $('#joinDialog').close();
    if (BT.Solo.isRunning()) BT.Solo.abort();
    BT.Online.join(pendingCode);
  });
  $('#joinName').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#joinConfirm').click(); } });

  // ---------- Classement & stats ----------
  let lbFilter = 'all';
  function renderLeaderboard() {
    const scores = store.get('scores2', []);
    const list = $('#leaderboard');
    const filtered = scores.filter((s) => lbFilter === 'all' || s.mode === lbFilter).slice(0, 10);
    list.innerHTML = filtered.length ? '' : '<p class="muted">Aucune partie pour l\'instant. Lance-toi !</p>';
    filtered.forEach((s) => {
      const li = document.createElement('li');
      const date = new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      const extra = s.mode === 'online' && s.rank ? ` · ${s.rank === 1 ? '🥇' : '#' + s.rank}/${s.players}` : '';
      li.innerHTML = `<span class="lb-avatar">${esc(s.avatar || '🎧')}</span><div><div class="lb-name">${esc(s.name)}</div><div class="lb-sub">${esc((s.artists || []).join(', '))} · ${MODES[s.mode] || ''} · ${DIFFICULTY[s.difficulty]?.label || ''}${extra} · ${date}</div></div><div class="lb-score">${s.score}</div>`;
      list.appendChild(li);
    });
    const games = scores.length;
    const correct = scores.reduce((a, s) => a + (s.correct || 0), 0);
    const answered = scores.reduce((a, s) => a + (s.answered || 0), 0);
    const best = scores.reduce((a, s) => Math.max(a, s.score), 0);
    const counts = {};
    scores.forEach((s) => (s.artists || []).forEach((n) => (counts[n] = (counts[n] || 0) + 1)));
    const fav = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    $('#globalStats').innerHTML = `
      <div><b>${games}</b><span>Parties</span></div>
      <div><b>${best}</b><span>Meilleur score</span></div>
      <div><b>${answered ? Math.round((correct / answered) * 100) : 0}%</b><span>Précision</span></div>
      <div><b class="ellipsis">${fav ? esc(fav[0]) : '—'}</b><span>Ton artiste n°1</span></div>`;
  }
  $('#lbFilter').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    lbFilter = b.dataset.value;
    $$('#lbFilter button').forEach((x) => x.classList.toggle('active', x === b));
    renderLeaderboard();
  });
  $('#resetStats').addEventListener('click', () => {
    if (!confirm('Effacer tous tes scores et records ?')) return;
    store.set('scores2', []); store.set('records', {});
    renderLeaderboard();
  });

  function renderBadges() {
    const n = BT.BADGES.filter((b) => BT.unlocked[b.id]).length;
    $('#badgeCount').textContent = `${n}/${BT.BADGES.length}`;
    $('#badges').innerHTML = BT.BADGES.map((b) => {
      const on = BT.unlocked[b.id];
      return `<div class="badge ${on ? 'on' : ''}"><div class="badge-ico">${on ? b.icon : '🔒'}</div><b>${esc(b.name)}</b><span>${esc(b.desc)}</span>${on ? `<small>${new Date(on).toLocaleDateString('fr-FR')}</small>` : ''}</div>`;
    }).join('');
  }

  $$('[data-open]').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.open;
    if (id === 'statsDialog') renderLeaderboard();
    if (id === 'badgesDialog') renderBadges();
    $(`#${id}`).showModal();
  }));
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // ---------- Liens partagés : défi ou invitation ----------
  async function readUrl() {
    const p = BT.urlParams;
    const room = p.get('room');
    if (room) {
      $('#joinCode').value = room.toUpperCase();
      openJoin(room);
      return;
    }
    const artistIds = (p.get('a') || '').split(',').map(Number).filter(Boolean);
    const chartIds = (p.get('c') || '').split(',').filter((x) => x !== '').map(Number);
    if (!artistIds.length && !chartIds.length) return;
    if (MODES[p.get('m')] && p.get('m') !== 'online') settings.mode = p.get('m');
    if (DIFFICULTY[p.get('d')]) settings.difficulty = p.get('d');
    if (['5', '10', '15', '20'].includes(p.get('r'))) settings.rounds = p.get('r');
    if (['25', '100'].includes(p.get('p'))) settings.pool = p.get('p');
    if (['title', 'artist'].includes(p.get('g'))) settings.guess = p.get('g');
    settings.play = 'solo';
    renderSettings();
    chartIds.forEach((id) => { const c = CHARTS.find((x) => x.id === id); if (c) selected.set(sourceKey(c), c); });
    try {
      const artists = await Promise.all(artistIds.slice(0, MAX_SELECTED).map((id) => api.artist(id)));
      artists.forEach((a) => a && a.id && selected.set(sourceKey(a), a));
    } catch { /* lien invalide */ }
    renderSelected();
    const score = parseInt(p.get('s'), 10);
    if (score >= 0) {
      BT.challenge = { score, name: (p.get('n') || 'Un ami').slice(0, 16) };
      const banner = document.createElement('div');
      banner.id = 'challengeBanner';
      banner.className = 'panel challenge';
      banner.innerHTML = `<div class="challenge-ico">⚔️</div><div><h2>Défi reçu !</h2><p><b>${esc(BT.challenge.name)}</b> a fait <b>${score} pts</b> sur ${esc([...selected.values()].map((s) => s.name).join(', '))} en mode ${MODES[settings.mode]} (${DIFFICULTY[settings.difficulty].label}). Tout est réglé : à toi de le battre !</p></div><button class="btn" id="challengeGo">Relever le défi ➜</button>`;
      $('.features').after(banner);
      $('#challengeGo').addEventListener('click', () => $('#startBtn').click());
    }
    history.replaceState(null, '', location.pathname + (p.get('peer') ? `?peer=${encodeURIComponent(p.get('peer'))}` : ''));
  }

  // ---------- Application installable (PWA) ----------
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // ---------- Démarrage ----------
  document.body.dataset.screen = 'home';
  renderProfile();
  renderSettings();
  renderPresets();
  renderSelected();
  readUrl();
})();
