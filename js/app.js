/* =========================================================
   app.js : écran d'accueil (choix de la musique, réglages),
   profil, classement, succès, liens de défi / d'invitation.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, store, show, toast, api, CHARTS, sourceKey, initials, fmtFans, DIFFICULTY, MODES, AVATARS, profile } = BT;

  const MAX_SELECTED = 8;
  const CATS = BT.CATEGORIES;

  const selected = new Map(); // clé -> source (artiste ou playlist)
  const settings = Object.assign({ play: 'solo', game: 'quiz', duel: 'diff', mode: 'classic', rounds: '10', guess: 'title', difficulty: 'normal', pool: 'all' }, store.get('settings3', store.get('settings2', {})));
  if (!settings.game) settings.game = 'quiz';
  if (!settings.duel) settings.duel = 'diff';

  // Les modes de jeu affichés en cartes. « set » = les réglages appliqués quand on choisit la carte.
  const GAME_MODES = [
    { id: 'classic', icon: '🎯', name: 'Blind test', desc: "Écoute l'extrait et trouve le titre parmi 4 propositions.", set: { game: 'quiz', mode: 'classic', guess: 'title' }, online: true },
    { id: 'whois', icon: '🎤', name: 'Qui chante ?', desc: "Écoute l'extrait et trouve l'artiste.", set: { game: 'quiz', mode: 'classic', guess: 'artist' }, online: true },
    { id: 'survival', icon: '❤️', name: 'Survie', desc: '3 vies : tiens le plus longtemps possible.', set: { game: 'quiz', mode: 'survival', guess: 'title' }, online: false },
    { id: 'chrono', icon: '⏱️', name: 'Chrono', desc: '90 secondes pour trouver un maximum de titres.', set: { game: 'quiz', mode: 'chrono', guess: 'title' }, online: false },
    { id: 'battle', icon: '⚔️', name: 'Battle', desc: "Deux hits s'affrontent : vote pour le meilleur.", set: { game: 'battle' }, online: true },
    { id: 'theme', icon: '🎲', name: 'Battle à thème', desc: 'Un thème au hasard, deux sons : lequel colle le mieux ?', set: { game: 'theme' }, online: true },
    { id: 'pick', icon: '🏆', name: 'Défi thème', desc: "Un thème au hasard : trouve TOI-MÊME le son parfait. L'IA note chaque son en %.", set: { game: 'pick' }, online: true, isNew: true },
  ];
  if (!GAME_MODES.some((m) => m.id === settings.gm)) {
    settings.gm = settings.game === 'battle' ? 'battle' : settings.game === 'theme' ? 'theme'
      : settings.mode === 'survival' ? 'survival' : settings.mode === 'chrono' ? 'chrono' : settings.guess === 'artist' ? 'whois' : 'classic';
  }
  function applyMode(id) {
    const m = GAME_MODES.find((x) => x.id === id);
    settings.gm = m.id;
    Object.assign(settings, { mode: 'classic', guess: 'title' }, m.set);
  }
  applyMode(settings.gm);
  if (!['50', '100', 'all'].includes(settings.pool)) settings.pool = '50';
  const saveSettings = () => store.set('settings3', settings);

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
    btn.dataset.tilt = '16';
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
    renderActionBar();
    BT.refreshCovers();
  }

  BT.refreshCovers = () => BT.FX.setCovers([...selected.values()].map((s) => s.picture).filter(Boolean));

  // ---------- Barre « Jouer » toujours visible ----------
  let startVisible = false;
  function renderActionBar() {
    const bar = $('#actionBar');
    const n = selected.size;
    bar.classList.toggle('hidden', n === 0 || startVisible);
    if (!n) return;
    const list = [...selected.values()];
    $('#abFaces').innerHTML = list.slice(0, 4).map((s) => s.type === 'chart' ? `<span class="face-mini">${esc(s.emoji)}</span>` : s.picture ? `<img src="${esc(s.picture)}" alt="">` : `<span class="face-mini">${esc(initials(s.name))}</span>`).join('') + (n > 4 ? `<span class="face-mini more">+${n - 4}</span>` : '');
    $('#abTitle').textContent = n === 1 ? list[0].name : `${n} artistes / playlists`;
    const poolLabel = { 50: 'Les hits', 100: 'Top 100', all: 'Toute la disco' }[settings.pool];
    const battle = settings.game !== 'quiz';
    const gameLabel = { quiz: 'Blind test', battle: 'Battle', theme: 'Battle à thème', pick: 'Défi thème' }[settings.game];
    $('#abSub').textContent = battle ? `${gameLabel}${settings.play === 'online' ? ' en ligne' : ''} · ${settings.rounds} ${settings.game === 'pick' ? 'manches' : 'duels'} · ${poolLabel}`
      : settings.play === 'online' ? `En ligne · ${settings.rounds} questions · ${poolLabel}`
      : `${MODES[settings.mode]}${settings.mode === 'classic' ? ` · ${settings.rounds} questions` : ''} · ${DIFFICULTY[settings.difficulty].label} · ${poolLabel}`;
    $('#abPlay').textContent = settings.play === 'online' ? (BT.Online.isHosting() ? '✔ Salon' : '🌐 Créer') : '▶ Jouer';
  }
  $('#abPlay').addEventListener('click', () => $('#startBtn').click());

  function renderStartBtn() {
    const btn = $('#startBtn');
    const n = selected.size;
    btn.disabled = n === 0;
    const names = [...selected.values()].map((s) => s.name);
    const what = n === 1 ? names[0] : `${n} choix (mix)`;
    if (n === 0) btn.textContent = 'Choisis au moins un artiste ou une playlist';
    else if (settings.play === 'online') btn.textContent = BT.Online.isHosting() ? '✔ Mettre à jour le salon' : `🌐 Créer le salon · ${what}`;
    else btn.textContent = `${{ quiz: '▶ Jouer', battle: '⚔️ Lancer la battle', theme: '⚔️ Lancer la battle', pick: '🏆 Lancer le défi' }[settings.game]} · ${what}`;
  }

  let currentCat = 'all';
  const ALL = [...new Set(CATS.flatMap((c) => c.artists))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
  const TABS = [{ id: 'all', label: '⭐ Tous', desc: `Tous les artistes, de A à Z · ${ALL.length} artistes` },
    ...CATS.map((c) => ({ id: c.id, label: c.label, desc: `${c.desc} · ${c.artists.length} artistes` })),
    { id: 'charts', label: '📈 Playlists', desc: 'Les classements Deezer du moment' },
    { id: 'recent', label: '🕘 Récents', desc: 'Les artistes avec qui tu as joué' }];
  $('#tabs').innerHTML = TABS.map((t) => `<button class="tab${t.id === currentCat ? ' active' : ''}" data-cat="${t.id}" role="tab">${esc(t.label)}</button>`).join('');

  let loadSeq = 0;
  function renderPresets() {
    const grid = $('#presets');
    grid.innerHTML = '';
    const tab = TABS.find((t) => t.id === currentCat);
    $('#catDesc').textContent = tab ? tab.desc : '';
    $('#randomPick').classList.toggle('hidden', currentCat === 'recent' || currentCat === 'charts');
    if (currentCat === 'recent') {
      const recents = store.get('recent2', []);
      if (!recents.length) { grid.innerHTML = '<p class="empty">Les artistes et playlists avec lesquels tu as joué apparaîtront ici.</p>'; return; }
      recents.forEach((s) => grid.appendChild(sourceCard(s)));
    } else if (currentCat === 'charts') {
      CHARTS.forEach((c) => grid.appendChild(sourceCard(c)));
    } else {
      const names = currentCat === 'all' ? ALL : CATS.find((c) => c.id === currentCat).artists;
      names.forEach((name, i) => {
        const card = sourceCard(api.presetCache[name] || { type: 'artist', name }, { preset: true });
        card.style.animationDelay = `${Math.min(i, 20) * 25}ms`;
        grid.appendChild(card);
      });
      loadPresetPictures();
    }
    applyFilter();
    renderLetters();
    renderSelected();
    grid.scrollTop = 0;
  }

  // A, B, C… : saute directement à la lettre dans la liste « Tous »
  const firstLetter = (name) => { const c = BT.norm(name).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
  function renderLetters() {
    const bar = $('#letterBar');
    bar.classList.toggle('hidden', currentCat !== 'all');
    if (currentCat !== 'all') return;
    const present = new Set(ALL.map(firstLetter));
    bar.innerHTML = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `<button type="button" data-letter="${l}" ${present.has(l) ? '' : 'disabled'}>${l}</button>`).join('');
  }
  $('#letterBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-letter]');
    if (!b) return;
    const grid = $('#presets');
    const card = $$('#presets .artist:not(.hidden)').find((c) => firstLetter(c.dataset.name) === b.dataset.letter);
    if (!card) return;
    grid.scrollTo({ top: card.offsetTop - 8, behavior: 'smooth' });
    $$('#letterBar button').forEach((x) => x.classList.toggle('active', x === b));
  });

  // filtre la liste affichée en tapant un nom
  function applyFilter() {
    const q = BT.norm($('#catFilter').value);
    $$('#presets .artist').forEach((c) => c.classList.toggle('hidden', !!q && !BT.norm(c.dataset.name).includes(q)));
  }
  $('#catFilter').addEventListener('input', applyFilter);

  // Charge les photos des suggestions en tâche de fond (4 à la fois, mises en cache)
  const picQueue = [];
  let picRunning = 0;
  function pumpPictures() {
    while (picRunning < 4 && picQueue.length) {
      const { name, seq } = picQueue.shift();
      if (seq !== loadSeq || api.presetCache[name]) { if (api.presetCache[name]) swapCard(name); continue; }
      picRunning++;
      api.resolve(name).then(() => { if (seq === loadSeq) swapCard(name); }).catch(() => {}).finally(() => { picRunning--; pumpPictures(); });
    }
  }
  function swapCard(name) {
    const old = $(`#presets .artist[data-name="${CSS.escape(name)}"]`);
    if (!old || old.dataset.key) return;
    const card = sourceCard(api.presetCache[name], { preset: true });
    card.style.animation = 'none';
    if (old.classList.contains('hidden')) card.classList.add('hidden');
    old.replaceWith(card);
    renderSelected();
  }
  let picObserver = null;
  function loadPresetPictures() {
    const seq = ++loadSeq;
    picQueue.length = 0;
    if (picObserver) picObserver.disconnect();
    picObserver = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        picObserver.unobserve(e.target);
        if (!e.target.dataset.key) picQueue.push({ name: e.target.dataset.name, seq });
      });
      pumpPictures();
    }, { rootMargin: '200px' });
    $$('#presets .artist:not([data-key])').forEach((c) => picObserver.observe(c));
  }

  $('#tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    $$('.tab').forEach((t) => t.classList.toggle('active', t === tab));
    tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    currentCat = tab.dataset.cat;
    $('#catFilter').value = '';
    renderPresets();
  });

  // 🎲 ajoute un artiste au hasard de la catégorie affichée
  $('#randomPick').addEventListener('click', async () => {
    const cat = currentCat === 'all' ? { artists: ALL } : CATS.find((c) => c.id === currentCat);
    if (!cat) return;
    const free = cat.artists.filter((n) => !(api.presetCache[n] && selected.has(sourceKey(api.presetCache[n]))));
    if (!free.length) return;
    const name = free[BT.rand(free.length)];
    try { toggle(await api.resolve(name)); toast(`${name} ajouté !`, { icon: '🎲' }); } catch (err) { toast(err.message, { icon: '⚠️' }); }
  });

  // ⚡ partie rapide : un artiste connu au hasard, réglages classiques, on lance tout de suite
  $('#quickPlay').addEventListener('click', async () => {
    const names = CATS.filter((c) => ['fr', 'us', 'frpop', 'pop', 'legend'].includes(c.id)).flatMap((c) => c.artists);
    const name = names[BT.rand(names.length)];
    try {
      const a = await api.resolve(name);
      toast(`Partie rapide : ${a.name}`, { icon: '⚡' });
      BT.Solo.start([a], { ...settings, play: 'solo', mode: 'classic', rounds: '10' });
    } catch (err) { toast(err.message, { icon: '⚠️' }); }
  });

  $('#clearSel').addEventListener('click', () => { selected.clear(); renderSelected(); });
  new IntersectionObserver(([e]) => { startVisible = e.isIntersecting; renderActionBar(); }).observe($('#startBtn'));

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
    battle: "Deux sons s'affrontent : écoute-les et choisis le meilleur. Tu gagnes des points si le public (le son le plus écouté) et l'IA sont d'accord avec toi. En ligne, la majorité du salon décide.",
    pick: "Un thème est tiré au hasard. Tu as 60 secondes pour chercher n'importe quel son sur Deezer et choisir celui qui colle le mieux. En solo, tu affrontes le bot (il pioche dans ta sélection). À la fin de la manche, l'IA donne un pourcentage à chaque son : ce pourcentage, ce sont tes points.",
    theme: "Un thème est tiré au hasard (« pour la salle de sport », « pour un chagrin d'amour »…). Choisis le son qui colle le mieux au thème. L'IA donne son verdict et l'explique.",
  };
  function renderModes() {
    const online = settings.play === 'online';
    $('#gameModes').innerHTML = GAME_MODES.map((m) => {
      const off = online && !m.online;
      return `<button class="gm-card${m.id === settings.gm ? ' active' : ''}${off ? ' off' : ''}" data-gm="${m.id}" data-tilt="10" ${off ? 'aria-disabled="true"' : ''}>
        ${m.isNew ? '<span class="gm-new">Nouveau</span>' : ''}
        <span class="gm-icon">${m.icon}</span>
        <b>${esc(m.name)}</b>
        <span class="gm-desc">${esc(m.desc)}</span>
        <span class="gm-tags">${m.online ? '<i>🎧 Solo</i><i>🌐 En ligne</i>' : '<i>🎧 Solo uniquement</i>'}</span>
      </button>`;
    }).join('');
  }
  $('#gameModes').addEventListener('click', (e) => {
    const card = e.target.closest('.gm-card');
    if (!card) return;
    const m = GAME_MODES.find((x) => x.id === card.dataset.gm);
    if (settings.play === 'online' && !m.online) { toast(`${m.name} se joue seulement en solo`, { icon: '🎧' }); return; }
    applyMode(m.id);
    saveSettings();
    BT.sfx('pop');
    renderSettings();
  });

  function renderSettings() {
    if (settings.play === 'online' && !GAME_MODES.find((m) => m.id === settings.gm).online) applyMode('classic');
    renderModes();
    $$('[data-setting]').forEach((seg) => {
      const key = seg.dataset.setting;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === settings[key]));
    });
    const online = settings.play === 'online';
    const quiz = settings.game === 'quiz';
    $$('[data-only="solo"]').forEach((el) => el.classList.toggle('hidden', online || !quiz));
    $$('[data-only="quiz"]').forEach((el) => el.classList.toggle('hidden', !quiz));
    $$('[data-only="battle"]').forEach((el) => el.classList.toggle('hidden', quiz));
    $$('[data-only="battle"]').forEach((el) => el.classList.toggle('hidden', !['battle', 'theme'].includes(settings.game)));
    $$('[data-only="rounds"]').forEach((el) => el.classList.toggle('hidden', quiz && !online && settings.mode !== 'classic'));
    $('#roundsLabel').textContent = quiz ? 'Questions' : settings.game === 'pick' ? 'Manches' : 'Duels';
    $('#settingHelp').textContent = !quiz ? HELP[settings.game] : online ? HELP.online : HELP[settings.mode];
    renderStartBtn();
    renderActionBar();
  }
  $$('.seg[data-setting]').forEach((seg) => seg.addEventListener('click', (e) => {
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
    else if (settings.game === 'pick') BT.Pick.start(sources, { ...settings });
    else if (settings.game !== 'quiz') BT.Battle.start(sources, { ...settings });
    else BT.Solo.start(sources, { ...settings });
  });

  $('#logoBtn').addEventListener('click', () => {
    if (BT.Online.active()) { BT.Online.leave(true); return; }
    if (BT.Solo.isRunning() && document.body.dataset.screen === 'play') { BT.Solo.quit(); return; }
    if (BT.Battle.isRunning() && document.body.dataset.screen === 'battle') { BT.Battle.quit(); return; }
    if (BT.Pick.isRunning() && document.body.dataset.screen === 'pick') { BT.Pick.quit(); return; }
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
  function renderAi() {
    const on = !!store.get('aiKey', '');
    $('#aiStatus').textContent = on ? '· Claude activé ✅' : '· IA du jeu (gratuite)';
    $('#aiClear').classList.toggle('hidden', !on);
  }
  $('#profileBtn').addEventListener('click', () => {
    $('#nameInput').value = profile.name;
    $('#aiKey').value = store.get('aiKey', '');
    renderAi();
    avatarPicker($('#avatars'));
    $('#profileDialog').showModal();
  });
  $('#aiKey').addEventListener('input', (e) => { store.set('aiKey', e.target.value.trim()); renderAi(); });
  $('#aiClear').addEventListener('click', () => { store.set('aiKey', ''); $('#aiKey').value = ''; renderAi(); });
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
    const filtered = scores.filter((s) => lbFilter === 'all' || s.mode === lbFilter || (lbFilter === 'battle' && s.mode === 'theme')).slice(0, 10);
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
  $('#resetStats').addEventListener('click', async () => {
    if (!(await BT.confirmBox('Effacer tous tes scores et records ?', { ok: 'Effacer', danger: true }))) return;
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
    if (['5', '10', '15', '20', '30'].includes(p.get('r'))) settings.rounds = p.get('r');
    if (['50', '100', 'all'].includes(p.get('p'))) settings.pool = p.get('p');
    if (['title', 'artist'].includes(p.get('g'))) settings.guess = p.get('g');
    settings.play = 'solo';
    applyMode(settings.mode === 'survival' ? 'survival' : settings.mode === 'chrono' ? 'chrono' : settings.guess === 'artist' ? 'whois' : 'classic');
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
      $('.hero').after(banner);
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
