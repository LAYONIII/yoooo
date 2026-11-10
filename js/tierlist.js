/* =========================================================
   tierlist.js : le jeu TierList.
   On choisit un artiste, ses sons arrivent un par un (pochette +
   extrait Deezer) et on les range de S à F.
   - Solo : classement libre, glisser-déposer, sauvegarde automatique,
     export en image, lien de partage.
   - En ligne : l'hôte crée un salon. Tout le monde entend le même
     extrait en même temps (lecture / pause / réécoute synchronisées),
     chacun vote un rang et le son va dans le rang moyen du groupe.
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, store, show, toast, sourceKey, CHARTS, api } = BT;

  const PREFIX = 'tierlist-fr-v1-';
  const TIERS = [
    { id: 'S', name: 'Légendaire', color: '#ff5d7a', v: 5 },
    { id: 'A', name: 'Excellent', color: '#ff9f45', v: 4 },
    { id: 'B', name: 'Bon', color: '#ffd84a', v: 3 },
    { id: 'C', name: 'Moyen', color: '#7be07b', v: 2 },
    { id: 'D', name: 'Bof', color: '#4fc3f7', v: 1 },
    { id: 'F', name: 'À jeter', color: '#a78bfa', v: 0 },
  ];
  const TIER = Object.fromEntries(TIERS.map((t) => [t.id, t]));
  const emptyTiers = () => Object.fromEntries(TIERS.map((t) => [t.id, []]));
  const audio = $('#tlAudio');

  let G = null;   // partie : { source, count, tracks:Map, tiers, queue, current, online, viewer, log }
  let R = null;   // salon en ligne : { room, isHost, myId, players:Map, votes:Map, phase, myVote }
  let pending = null; // artiste choisi, en attente des réglages

  // ---------- Petits outils ----------
  const slim = (t) => ({ id: t.id, title: t.title, artistName: t.artistName, album: t.album || '', cover: t.cover || '', coverSmall: t.coverSmall || '', preview: t.preview, link: t.link || '', rank: t.rank || 0 });
  const slimSource = (s) => ({ type: s.type, id: s.id, name: s.name, picture: s.picture || '', emoji: s.emoji || '', desc: s.desc || '', fans: s.fans || 0 });
  /** Pochette à la bonne taille (les images Deezer acceptent n'importe quelle taille dans l'adresse). */
  const art = (t, size) => (t.cover || t.coverSmall || '').replace(/\/\d+x\d+-/, `/${size}x${size}-`);
  const tierOf = (id) => TIERS.find((t) => G.tiers[t.id].includes(id));
  const placedCount = () => TIERS.reduce((n, t) => n + G.tiers[t.id].length, 0);
  const total = () => placedCount() + G.queue.length;
  const sourcePic = (s, cls = 'avatar') => (s.type === 'chart' ? `<span class="${cls} chart-ico">${esc(s.emoji || '📈')}</span>` : s.picture ? `<img class="${cls}" src="${esc(s.picture)}" alt="">` : `<span class="${cls}">${esc(BT.initials(s.name))}</span>`);

  function homeError(msg) {
    show('home');
    const el = $('#homeError');
    el.textContent = msg;
    el.classList.remove('hidden');
    setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 200);
  }

  /** Charge les sons d'un artiste : les N plus écoutés, ou toute la discographie. */
  async function loadTracks(source, count) {
    const size = count === 'all' ? 'all' : (+count <= 50 ? '50' : '100');
    let list = await BT.fetchTracks(source, size, (txt) => { $('#loadingText').textContent = `Chargement… ${txt}`; });
    if (count !== 'all') list = list.slice().sort((a, b) => (b.rank || 0) - (a.rank || 0)).slice(0, +count);
    if (list.length < 3) throw new Error('Pas assez de sons avec un extrait pour cet artiste. Essaie « Toute la disco » ou un autre artiste.');
    return list.map(slim);
  }

  // =========================================================
  //  VOLUME ET PROFIL
  // =========================================================
  function applyVolume() {
    audio.volume = BT.sound.volume;
    audio.muted = BT.sound.muted;
    $('#volume').value = BT.sound.volume;
    $('#volume').style.setProperty('--v', `${BT.sound.volume * 100}%`);
    $('#muteBtn').textContent = BT.sound.muted || BT.sound.volume === 0 ? '🔇' : BT.sound.volume < 0.5 ? '🔉' : '🔊';
  }
  $('#volume').addEventListener('input', (e) => { BT.sound.volume = +e.target.value; BT.sound.muted = false; store.set('volume', BT.sound.volume); store.set('muted', false); applyVolume(); });
  $('#muteBtn').addEventListener('click', () => { BT.sound.muted = !BT.sound.muted; store.set('muted', BT.sound.muted); applyVolume(); });

  function renderProfile() {
    $('#profileAvatar').textContent = BT.profile.avatar;
    $('#profileName').textContent = BT.displayName();
  }
  /** Ouvre le profil. Avec `required`, la promesse ne se résout que si un pseudo est saisi. */
  function openProfile(title, required) {
    return new Promise((resolve) => {
      const d = $('#profileDialog');
      $('#profileTitle').textContent = title || '👤 Mon profil';
      $('#nameInput').value = BT.profile.name;
      const box = $('#avatars');
      box.innerHTML = BT.AVATARS.map((a) => `<button type="button" class="${a === BT.profile.avatar ? 'active' : ''}" data-a="${a}">${a}</button>`).join('');
      box.onclick = (e) => {
        const b = e.target.closest('[data-a]');
        if (!b) return;
        BT.profile.avatar = b.dataset.a;
        $$('button', box).forEach((x) => x.classList.toggle('active', x === b));
      };
      let ok = false;
      $('#profileOk').onclick = () => {
        const name = $('#nameInput').value.trim().slice(0, 16);
        if (required && !name) { toast('Choisis un pseudo', { icon: '✏️' }); $('#nameInput').focus(); return; }
        BT.profile.name = name;
        BT.saveProfile();
        renderProfile();
        ok = true;
        d.close();
      };
      d.onclose = () => resolve(ok);
      d.showModal();
      setTimeout(() => $('#nameInput').focus(), 50);
    });
  }
  $('#profileBtn').addEventListener('click', () => openProfile());
  $('#nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#profileOk').click(); } });
  $('#helpBtn').addEventListener('click', () => $('#helpDialog').showModal());
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  // =========================================================
  //  ACCUEIL : choix de l'artiste, réglages, sauvegardes
  // =========================================================
  const picker = BT.ArtistPicker($('#picker'), { onPick: openSetup });

  const COUNT_HELP = {
    15: 'Ses 15 plus gros hits : rapide, environ 5 minutes.',
    30: 'Ses 30 sons les plus écoutés.',
    50: 'Ses 50 sons les plus écoutés.',
    100: 'Son top 100.',
    all: 'Tous ses albums, EP, singles et featurings. Pour les vrais fans (ça peut être long !).',
  };
  let count = store.get('tl_count', '30');
  function renderCount() {
    $$('#countSeg button').forEach((b) => b.classList.toggle('active', b.dataset.value === String(count)));
    $('#countHelp').textContent = COUNT_HELP[count];
  }
  $('#countSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    count = b.dataset.value;
    store.set('tl_count', count);
    renderCount();
  });

  function openSetup(source) {
    pending = source;
    $('#homeError').classList.add('hidden');
    $('#setupArtist').innerHTML = `${sourcePic(source, 'avatar big')}<div><small>Tier list de</small><h2>${esc(source.name)}</h2></div>`;
    renderCount();
    $('#setupDialog').showModal();
  }
  $('#setupSolo').addEventListener('click', () => { $('#setupDialog').close(); startSolo(pending, count); });
  $('#setupOnline').addEventListener('click', () => { $('#setupDialog').close(); startOnline(pending, count); });

  function addRecent(source) {
    const s = slimSource(source);
    store.set('tl_recent', [s, ...store.get('tl_recent', []).filter((r) => sourceKey(r) !== sourceKey(s))].slice(0, 16));
  }

  // ---------- Sauvegardes ----------
  const saveKey = () => `${sourceKey(G.source)}:${G.count}`;
  function save() {
    if (!G || G.online || G.viewer) return;
    const saves = store.get('tl_saves', {});
    saves[saveKey()] = { source: slimSource(G.source), count: G.count, tiers: G.tiers, queue: G.queue, tracks: [...G.tracks.values()], date: Date.now() };
    const keep = Object.entries(saves).sort((a, b) => b[1].date - a[1].date).slice(0, 10);
    store.set('tl_saves', Object.fromEntries(keep));
  }
  function renderSaved() {
    const saves = Object.entries(store.get('tl_saves', {})).sort((a, b) => b[1].date - a[1].date);
    $('#savedPanel').classList.toggle('hidden', !saves.length);
    $('#savedList').innerHTML = saves.map(([key, s]) => {
      const done = TIERS.reduce((n, t) => n + (s.tiers[t.id] || []).length, 0);
      const all = done + s.queue.length;
      return `<div class="saved" data-key="${esc(key)}" data-tilt="8">
        ${sourcePic(s.source)}
        <div class="saved-text"><b>${esc(s.source.name)}</b><span>${done}/${all} classés · ${new Date(s.date).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
          <div class="saved-bar"><i style="width:${all ? (done / all) * 100 : 0}%"></i></div></div>
        <button class="btn btn-sm" data-act="resume">${s.queue.length ? 'Reprendre' : 'Voir'}</button>
        <button class="ctl-btn" data-act="del" title="Supprimer" aria-label="Supprimer">🗑</button>
      </div>`;
    }).join('');
  }
  $('#savedList').addEventListener('click', async (e) => {
    const row = e.target.closest('.saved');
    const act = e.target.closest('[data-act]');
    if (!row || !act) return;
    const saves = store.get('tl_saves', {});
    const s = saves[row.dataset.key];
    if (!s) return;
    if (act.dataset.act === 'del') {
      if (!(await BT.confirmBox(`Supprimer la tier list de ${s.source.name} ?`, { ok: 'Supprimer', danger: true }))) return;
      delete saves[row.dataset.key];
      store.set('tl_saves', saves);
      renderSaved();
    } else startSolo(s.source, s.count, s);
  });

  // =========================================================
  //  LECTURE AUDIO
  // =========================================================
  function playTrack(t, from = 0) {
    if (!t) return;
    if (audio.dataset.id !== String(t.id)) {
      audio.src = t.preview;
      audio.dataset.id = String(t.id);
    }
    try { audio.currentTime = from; } catch { /* pas encore chargé */ }
    const p = audio.play();
    if (p && p.catch) p.catch(() => { $('#tlPlay').textContent = '▶'; });
  }
  audio.addEventListener('playing', () => { document.body.classList.add('is-playing'); $('#sleeve').classList.add('playing'); $('#tlPlay').textContent = '⏸'; });
  ['pause', 'ended', 'emptied'].forEach((ev) => audio.addEventListener(ev, () => { document.body.classList.remove('is-playing'); $('#sleeve').classList.remove('playing'); $('#tlPlay').textContent = '▶'; }));
  audio.addEventListener('timeupdate', () => { $('#nowBar').style.width = `${Math.min(100, ((audio.currentTime || 0) / (audio.duration || 30)) * 100)}%`; });
  audio.addEventListener('error', () => { if (audio.getAttribute('src') && G && !G.viewer) toast('Extrait indisponible pour ce son', { icon: '⚠️' }); });

  function ctl(action) {
    if (R && G && G.online && R.phase !== 'end') {
      if (R.isHost) hostCtl(action); else R.room.send({ t: 'ctl', a: action });
      return;
    }
    localCtl(action, audio.currentTime || 0);
  }
  function localCtl(action, pos) {
    const t = G && G.tracks.get(G.current);
    if (action === 'replay') playTrack(t, 0);
    else if (action === 'play') {
      if (t && audio.dataset.id !== String(t.id)) playTrack(t, pos);
      else {
        if (Math.abs((audio.currentTime || 0) - pos) > 1.5) { try { audio.currentTime = pos; } catch { /* ignore */ } }
        const p = audio.play();
        if (p && p.catch) p.catch(() => {});
      }
    } else if (action === 'pause') audio.pause();
  }
  $('#tlPlay').addEventListener('click', () => ctl(audio.paused ? 'play' : 'pause'));
  $('#tlReplay').addEventListener('click', () => ctl('replay'));

  // =========================================================
  //  TABLEAU
  // =========================================================
  function tileHtml(id) {
    const t = G.tracks.get(id);
    if (!t) return '';
    const cur = id === G.current ? ' current' : '';
    return `<button type="button" class="tile${cur}" data-id="${id}" draggable="${G.online || G.viewer ? 'false' : 'true'}" title="${esc(t.title)} · ${esc(t.artistName)}">
      ${art(t, 120) ? `<img src="${esc(art(t, 120))}" alt="" loading="lazy" draggable="false">` : '<span class="tile-noart">♪</span>'}
      <span class="tile-title">${esc(t.title)}</span>
    </button>`;
  }

  function renderBoard(target = $('#board')) {
    target.innerHTML = TIERS.map((t) => `
      <div class="tier-row" data-tier="${t.id}" style="--c:${t.color}">
        <div class="tier-label"><b>${t.id}</b><small>${t.name}</small></div>
        <div class="tier-items">${G.tiers[t.id].map(tileHtml).join('')}</div>
      </div>`).join('');
  }
  function renderPool() {
    $('#pool').innerHTML = G.queue.map(tileHtml).join('') || '<p class="empty">Plus rien à classer 🎉</p>';
    $('#poolCount').textContent = G.queue.length;
    $('#poolWrap').classList.toggle('hidden', !!G.online);
  }
  function renderProgress() {
    const done = placedCount();
    const all = total();
    $('#tlProgressBar').style.width = `${all ? (done / all) * 100 : 0}%`;
    $('#tlProgressText').textContent = `${done} / ${all} classés`;
  }
  function renderAll() { renderBoard(); renderPool(); renderProgress(); }

  function renderTierButtons() {
    $('#tierBtns').innerHTML = TIERS.map((t) => `<button type="button" class="tier-btn" data-tier="${t.id}" style="--c:${t.color}"><b>${t.id}</b><small>${t.name}</small></button>`).join('');
  }

  function setupBoardScreen() {
    $('#tlArtist').innerHTML = `${sourcePic(G.source, 'avatar mini')}<div><small>${G.online ? 'Tier list du groupe' : 'Tier list'}</small><b>${esc(G.source.name)}</b></div>`;
    renderTierButtons();
    $('#nowDone').classList.add('hidden');
    $('#now').classList.remove('done');
    $('#nowSync').classList.toggle('hidden', !G.online);
    $('#nowOnline').classList.toggle('hidden', !G.online);
    $('#tlFinish').classList.toggle('hidden', !!G.online && !(R && R.isHost));
    $('#tlSkip').classList.toggle('hidden', !!G.online && !(R && R.isHost));
    $('#tlForce').classList.toggle('hidden', !(G.online && R && R.isHost));
    $('#nowAsk').textContent = G.online ? 'Vote : dans quel rang tu le mets ?' : 'Dans quel rang tu le mets ?';
    document.body.dataset.tlMode = G.online ? 'online' : 'solo';
    renderAll();
  }

  /** Affiche un son dans le panneau « en cours » et lance son extrait. */
  function setCurrent(id, { autoplay = true } = {}) {
    G.current = id;
    const t = G.tracks.get(id);
    $$('.tile.current').forEach((x) => x.classList.remove('current'));
    if (!t) { showDone(); return; }
    $('#nowDone').classList.add('hidden');
    $('#now').classList.remove('done');
    $$(`.tile[data-id="${id}"]`).forEach((x) => x.classList.add('current'));
    const img = $('#nowCover');
    img.src = art(t, 500);
    const sl = $('#sleeve');
    sl.classList.remove('in'); void sl.offsetWidth; sl.classList.add('in');
    $('#nowTitle').textContent = t.title;
    $('#nowSub').textContent = `${t.artistName}${t.album ? ' · ' + t.album : ''}`;
    const placed = tierOf(id);
    $('#nowCount').textContent = placed ? `Déjà classé en ${placed.id} : choisis un autre rang pour le déplacer` : `Son ${placedCount() + 1} sur ${total()}`;
    $$('.tier-btn').forEach((b) => b.classList.toggle('active', !!placed && b.dataset.tier === placed.id));
    $('#nowBar').style.width = '0%';
    if (autoplay) playTrack(t, 0);
  }

  function showDone() {
    G.current = null;
    audio.pause();
    $('#now').classList.add('done');
    $('#nowDone').classList.remove('hidden');
    BT.confetti(120);
    BT.sfx('end');
  }

  /** Petite animation : la pochette s'envole du panneau vers sa case. */
  function fly(fromRect, id) {
    const tile = $(`#board .tile[data-id="${id}"]`);
    if (!tile || !fromRect || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (tile) tile.classList.add('landed'); return; }
    const to = tile.getBoundingClientRect();
    const src = tile.querySelector('img');
    if (!src) { tile.classList.add('landed'); return; }
    const img = document.createElement('img');
    img.src = src.src;
    img.className = 'fly';
    Object.assign(img.style, { left: `${fromRect.left}px`, top: `${fromRect.top}px`, width: `${fromRect.width}px`, height: `${fromRect.height}px` });
    document.body.appendChild(img);
    tile.style.visibility = 'hidden';
    const anim = img.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', borderRadius: '18px' },
      { transform: `translate(${to.left - fromRect.left}px, ${to.top - fromRect.top}px) scale(${to.width / fromRect.width}) rotate(-8deg)`, borderRadius: '40px', offset: 0.7 },
      { transform: `translate(${to.left - fromRect.left}px, ${to.top - fromRect.top}px) scale(${to.width / fromRect.width}) rotate(0deg)`, borderRadius: '40px' },
    ], { duration: 520, easing: 'cubic-bezier(.3,.9,.3,1)' });
    anim.onfinish = () => { img.remove(); tile.style.visibility = ''; tile.classList.add('landed'); };
  }

  /** Range un son dans un rang (index = position dans le rang, à la fin par défaut). */
  function place(id, tierId, index, { advance = true } = {}) {
    if (!G.tracks.has(id) || !TIER[tierId]) return;
    const wasCurrent = id === G.current;
    const from = wasCurrent ? $('#nowCover').getBoundingClientRect() : ($(`.tile[data-id="${id}"]`) || { getBoundingClientRect: () => null }).getBoundingClientRect();
    G.queue = G.queue.filter((x) => x !== id);
    TIERS.forEach((t) => { G.tiers[t.id] = G.tiers[t.id].filter((x) => x !== id); });
    const arr = G.tiers[tierId];
    if (typeof index === 'number' && index >= 0 && index <= arr.length) arr.splice(index, 0, id); else arr.push(id);
    renderAll();
    fly(from, id);
    const row = $(`#board .tier-row[data-tier="${tierId}"]`);
    if (row) { row.classList.remove('hit'); void row.offsetWidth; row.classList.add('hit'); }
    if (tierId === 'S') { BT.sfx('good'); BT.FX.burst(); const r = row.getBoundingClientRect(); BT.confetti(40, { x: r.left + 80, y: r.top + r.height / 2 }); } else BT.sfx('pop');
    save();
    if (advance && wasCurrent) setCurrent(G.queue[0] ?? null);
    else if (G.current && !G.online) setCurrent(G.current, { autoplay: false });
  }

  function unplace(id) {
    if (!G.tracks.has(id) || G.queue.includes(id)) return;
    TIERS.forEach((t) => { G.tiers[t.id] = G.tiers[t.id].filter((x) => x !== id); });
    G.queue.unshift(id);
    renderAll();
    save();
    setCurrent(G.current || id, { autoplay: false });
  }

  function skip() {
    if (!G || !G.current) return;
    if (G.online) { if (R && R.isHost) hostSkip(); return; }
    if (G.queue.includes(G.current) && G.queue.length > 1) {
      G.queue = [...G.queue.filter((x) => x !== G.current), G.current];
      renderPool();
      save();
    }
    setCurrent(G.queue[0] ?? null);
  }
  $('#tlSkip').addEventListener('click', skip);

  function chooseTier(tierId) {
    if (!G || !G.current || G.viewer) return;
    if (G.online) { vote(tierId); return; }
    place(G.current, tierId);
  }
  $('#tierBtns').addEventListener('click', (e) => { const b = e.target.closest('.tier-btn'); if (b) chooseTier(b.dataset.tier); });

  // clic sur une pochette : on l'écoute (et on peut la reclasser)
  function onTileClick(e) {
    const tile = e.target.closest('.tile');
    if (!tile || !G) return;
    const id = +tile.dataset.id;
    if (G.viewer || (G.online && R && R.phase === 'end') || document.body.dataset.screen === 'result') {
      const t = G.tracks.get(id);
      const same = audio.dataset.id === String(id) && !audio.paused;
      $$('.tile.current').forEach((x) => x.classList.remove('current'));
      if (same) { audio.pause(); return; }
      tile.classList.add('current');
      playTrack(t, 0);
      return;
    }
    if (G.online) return; // en ligne, c'est l'hôte qui fait défiler les sons
    setCurrent(id);
    if (innerWidth < 960) $('#now').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  $('#board').addEventListener('click', onTileClick);
  $('#pool').addEventListener('click', onTileClick);
  $('#finalBoard').addEventListener('click', onTileClick);

  // glisser-déposer (ordinateur)
  let dragId = null;
  document.addEventListener('dragstart', (e) => {
    const tile = e.target.closest && e.target.closest('.tile');
    if (!tile || !G || G.online || G.viewer) return;
    dragId = +tile.dataset.id;
    e.dataTransfer.setData('text/plain', String(dragId));
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => tile.classList.add('dragging'), 0);
  });
  document.addEventListener('dragend', () => { dragId = null; $$('.dragging').forEach((x) => x.classList.remove('dragging')); $$('.over').forEach((x) => x.classList.remove('over')); });
  const dropZone = (e) => e.target.closest && (e.target.closest('.tier-row') || e.target.closest('#pool'));
  document.addEventListener('dragover', (e) => {
    if (dragId === null) return;
    const zone = dropZone(e);
    $$('.over').forEach((x) => { if (x !== zone) x.classList.remove('over'); });
    if (zone && zone.closest('#screen-board')) { e.preventDefault(); zone.classList.add('over'); }
  });
  document.addEventListener('drop', (e) => {
    if (dragId === null) return;
    const zone = dropZone(e);
    if (!zone || !zone.closest('#screen-board')) return;
    e.preventDefault();
    const id = dragId;
    if (zone.id === 'pool') { unplace(id); return; }
    const tierId = zone.dataset.tier;
    const over = e.target.closest('.tile');
    let index;
    if (over && +over.dataset.id !== id) {
      const without = G.tiers[tierId].filter((x) => x !== id);
      index = without.indexOf(+over.dataset.id);
      const r = over.getBoundingClientRect();
      if (e.clientX > r.left + r.width / 2) index++;
    }
    place(id, tierId, index, { advance: id === G.current });
  });

  // raccourcis clavier
  document.addEventListener('keydown', (e) => {
    if (document.body.dataset.screen !== 'board' || !G || document.querySelector('dialog[open]') || e.target.matches('input, textarea')) return;
    const k = e.key.toUpperCase();
    if (TIER[k] && !e.ctrlKey && !e.metaKey) { e.preventDefault(); chooseTier(k); }
    else if (e.key === ' ') { e.preventDefault(); ctl(audio.paused ? 'play' : 'pause'); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); skip(); }
  });

  // =========================================================
  //  PARTIE SOLO
  // =========================================================
  async function startSolo(source, cnt, saved) {
    audio.pause();
    show('loading');
    $('#loadingText').textContent = `Chargement des sons de ${source.name}…`;
    let list;
    try {
      list = await loadTracks(source, cnt);
    } catch (err) {
      if (!saved) { homeError(err.message); return; }
      list = saved.tracks; // hors ligne : on reprend avec les sons sauvegardés
    }
    addRecent(source);
    const tracks = new Map(list.map((t) => [t.id, t]));
    let tiers = emptyTiers();
    let queue = BT.shuffle(list.map((t) => t.id));
    if (saved) {
      saved.tracks.forEach((t) => { if (!tracks.has(t.id)) tracks.set(t.id, t); });
      tiers = emptyTiers();
      TIERS.forEach((t) => { tiers[t.id] = (saved.tiers[t.id] || []).filter((id) => tracks.has(id)); });
      queue = saved.queue.filter((id) => tracks.has(id));
    }
    G = { source, count: cnt, tracks, tiers, queue, current: null, online: false, viewer: false };
    setupBoardScreen();
    show('board');
    if (!saved) await BT.countdown(3);
    if (G.queue.length) setCurrent(G.queue[0]); else showDone();
  }

  $('#tlSeeResult').addEventListener('click', () => showResult());
  $('#tlFinish').addEventListener('click', async () => {
    if (G.online) {
      if (R && R.isHost && (await BT.confirmBox('Terminer la tier list maintenant pour tout le monde ?', { ok: 'Terminer' }))) hostEnd();
      return;
    }
    if (G.queue.length && !(await BT.confirmBox(`Il reste ${G.queue.length} son${G.queue.length > 1 ? 's' : ''} à classer. Voir la tier list quand même ?`, { ok: 'Voir la tier list' }))) return;
    showResult();
  });
  async function quit() {
    if (R) {
      if (!(await BT.confirmBox(R.isHost ? 'Fermer le salon ? Tous les joueurs seront déconnectés.' : 'Quitter le salon ?', { ok: R.isHost ? 'Fermer le salon' : 'Quitter', danger: true }))) return;
      leaveRoom();
      return;
    }
    audio.pause();
    goHome();
    if (G && !G.viewer) toast('Ta tier list est sauvegardée : tu peux la reprendre ici.', { icon: '💾' });
  }
  $('#tlQuit').addEventListener('click', quit);
  function goHome() {
    audio.pause();
    G = null;
    renderSaved();
    picker.refresh();
    show('home');
    if (location.search && !BT.urlParams.get('peer')) history.replaceState(null, '', location.pathname);
  }
  $('#logoBtn').addEventListener('click', () => { if (R || (G && document.body.dataset.screen === 'board')) quit(); else goHome(); });

  // =========================================================
  //  RÉSULTAT : affichage, image, lien
  // =========================================================
  function showResult(extra = {}) {
    audio.pause();
    $$('.tile.current').forEach((x) => x.classList.remove('current'));
    G.current = null;
    renderBoard($('#finalBoard'));
    const n = placedCount();
    const by = G.by || BT.displayName();
    $('#resBy').textContent = G.online ? `👥 ${extra.players || ''} joueurs` : `par ${by}`;
    $('#resTitle').innerHTML = `${G.online ? 'Tier list du groupe' : 'Tier list'} : <span class="grad">${esc(G.source.name)}</span>`;
    $('#resSub').textContent = `${n} son${n > 1 ? 's' : ''} classé${n > 1 ? 's' : ''}${G.queue.length ? ` · ${G.queue.length} non classé${G.queue.length > 1 ? 's' : ''}` : ''} · clique sur une pochette pour l'écouter`;
    const chips = TIERS.map((t) => `<span class="res-chip" style="--c:${t.color}"><b>${t.id}</b>${G.tiers[t.id].length}</span>`).join('');
    $('#resStats').innerHTML = `<div class="res-chips">${chips}</div>${extra.html || ''}`;
    $('#resEdit').classList.toggle('hidden', !!G.online || !!G.viewer);
    $('#resMine').classList.toggle('hidden', !G.viewer);
    $('#resMsg').classList.add('hidden');
    show('result');
    if (!G.viewer) setTimeout(() => BT.confetti(160), 300);
  }
  $('#resEdit').addEventListener('click', () => { setupBoardScreen(); show('board'); setCurrent(G.queue[0] ?? null, { autoplay: false }); if (!G.queue.length) { $('#now').classList.add('done'); $('#nowDone').classList.remove('hidden'); } });
  $('#resNew').addEventListener('click', () => { if (R) leaveRoom(); else goHome(); });
  $('#resMine').addEventListener('click', () => { const s = G.source; const c = G.count; goHome(); startSolo(s, c); });

  function shareUrl() {
    const t = TIERS.filter((x) => G.tiers[x.id].length).map((x) => `${x.id}-${G.tiers[x.id].map((id) => id.toString(36)).join('.')}`).join('_');
    const p = new URLSearchParams({ s: sourceKey(G.source), n: String(G.count), by: G.online ? 'Le groupe' : BT.displayName(), t });
    return `${location.origin}${location.pathname}?${p}`;
  }
  $('#resShare').addEventListener('click', async () => {
    const url = shareUrl();
    const text = `🏆 Ma tier list ${G.source.name} sur TierList. T'es d'accord ?`;
    const msg = $('#resMsg');
    try {
      if (navigator.share && location.protocol.startsWith('http')) { await navigator.share({ title: 'TierList', text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      msg.textContent = '✅ Lien copié ! Envoie-le à tes potes.';
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      msg.textContent = url;
    }
    msg.classList.remove('hidden');
  });

  // ---------- Export en image ----------
  const loadImg = (url) => new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.crossOrigin = 'anonymous'; // indispensable pour pouvoir enregistrer l'image ; sinon on dessine le titre
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 6000);
  });
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
  }
  function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    const shown = lines.slice(0, maxLines);
    if (lines.length > maxLines) shown[maxLines - 1] = `${shown[maxLines - 1].slice(0, 12)}…`;
    const start = y - ((shown.length - 1) * lineH) / 2;
    shown.forEach((l, i) => ctx.fillText(l, x, start + i * lineH));
  }
  async function exportImage() {
    const btn = $('#resImage');
    btn.disabled = true;
    btn.textContent = '⏳ Création de l\'image…';
    try {
      const W = 1400; const PAD = 40; const LABEL = 150; const TILE = 112; const GAP = 10; const HEAD = 150;
      const perRow = Math.floor((W - PAD * 2 - LABEL - GAP) / (TILE + GAP));
      const rows = TIERS.map((t) => ({ t, ids: G.tiers[t.id], lines: Math.max(1, Math.ceil(G.tiers[t.id].length / perRow)) }));
      const H = HEAD + rows.reduce((h, r) => h + r.lines * (TILE + GAP) + GAP + 12, 0) + 70;
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      const bg = ctx.createLinearGradient(0, 0, W, H);
      bg.addColorStop(0, '#1a0b22'); bg.addColorStop(0.5, '#0b0b16'); bg.addColorStop(1, '#08182a');
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff'; ctx.font = '900 54px Outfit, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`Tier list : ${G.source.name}`.slice(0, 44), PAD, 62);
      ctx.fillStyle = '#a1a1bd'; ctx.font = '600 26px Outfit, system-ui, sans-serif';
      ctx.fillText(G.online ? 'Tier list du groupe' : `par ${G.by || BT.displayName()}`, PAD, 112);
      const imgs = new Map();
      await BT.pool(rows.flatMap((r) => r.ids), 8, async (id) => { imgs.set(id, await loadImg(art(G.tracks.get(id), 250))); });
      let y = HEAD;
      for (const r of rows) {
        const h = r.lines * (TILE + GAP) + GAP;
        ctx.fillStyle = 'rgba(255,255,255,.05)'; roundRect(ctx, PAD, y, W - PAD * 2, h, 18); ctx.fill();
        ctx.fillStyle = r.t.color; roundRect(ctx, PAD, y, LABEL, h, 18); ctx.fill();
        ctx.fillStyle = '#14141e'; ctx.textAlign = 'center';
        ctx.font = '900 60px Outfit, system-ui, sans-serif'; ctx.fillText(r.t.id, PAD + LABEL / 2, y + h / 2 - 12);
        ctx.font = '700 18px Outfit, system-ui, sans-serif'; ctx.fillText(r.t.name, PAD + LABEL / 2, y + h / 2 + 30);
        r.ids.forEach((id, i) => {
          const x = PAD + LABEL + GAP + (i % perRow) * (TILE + GAP);
          const ty = y + GAP + Math.floor(i / perRow) * (TILE + GAP);
          const img = imgs.get(id);
          ctx.save(); roundRect(ctx, x, ty, TILE, TILE, 14); ctx.clip();
          if (img) ctx.drawImage(img, x, ty, TILE, TILE);
          else {
            const g = ctx.createLinearGradient(x, ty, x + TILE, ty + TILE);
            g.addColorStop(0, '#3b1d4d'); g.addColorStop(1, '#16304a');
            ctx.fillStyle = g; ctx.fillRect(x, ty, TILE, TILE);
            ctx.fillStyle = '#fff'; ctx.font = '700 15px Outfit, system-ui, sans-serif'; ctx.textAlign = 'center';
            wrapText(ctx, G.tracks.get(id).title, x + TILE / 2, ty + TILE / 2, TILE - 12, 18, 4);
          }
          ctx.restore();
        });
        y += h + 12;
      }
      ctx.fillStyle = '#6f6f8c'; ctx.font = '600 22px Outfit, system-ui, sans-serif'; ctx.textAlign = 'right';
      ctx.fillText('Fait avec TierList 🎧', W - PAD, H - 36);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `tierlist-${BT.norm(G.source.name).replace(/\s+/g, '-') || 'artiste'}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('Image téléchargée !', { icon: '📸' });
    } catch (err) {
      toast('Impossible de créer l\'image. Fais une capture d\'écran à la place.', { icon: '⚠️', ms: 5000 });
    }
    btn.disabled = false;
    btn.textContent = '📸 Télécharger en image';
  }
  $('#resImage').addEventListener('click', exportImage);

  // ---------- Ouverture d'un lien partagé ----------
  async function openShared(p) {
    show('loading');
    $('#loadingText').textContent = 'Ouverture de la tier list…';
    try {
      const key = p.get('s') || '';
      const source = key[0] === 'c' ? CHARTS.find((c) => String(c.id) === key.slice(1)) : await api.artist(+key.slice(1));
      if (!source || source.id === undefined) throw new Error('Lien invalide.');
      const cnt = ['15', '30', '50', '100', 'all'].includes(p.get('n')) ? p.get('n') : '50';
      const tiers = emptyTiers();
      (p.get('t') || '').split('_').forEach((part) => {
        const [tid, ids] = part.split('-');
        if (TIER[tid] && ids) tiers[tid] = ids.split('.').map((x) => parseInt(x, 36)).filter(Boolean).slice(0, 300);
      });
      let list = [];
      try { list = await loadTracks(source, cnt); } catch { /* on complètera morceau par morceau */ }
      const tracks = new Map(list.map((t) => [t.id, t]));
      const missing = TIERS.flatMap((t) => tiers[t.id]).filter((id) => !tracks.has(id));
      await BT.pool(missing, 5, async (id) => {
        const d = await api.track(id);
        if (d && d.id) tracks.set(d.id, { id: d.id, title: d.title_short || d.title, artistName: d.artist ? d.artist.name : source.name, album: d.album ? d.album.title : '', cover: d.album ? (d.album.cover_big || d.album.cover_medium || '') : '', coverSmall: '', preview: d.preview, link: d.link || '', rank: d.rank || 0 });
      });
      TIERS.forEach((t) => { tiers[t.id] = tiers[t.id].filter((id) => tracks.has(id)); });
      G = { source, count: cnt, tracks, tiers, queue: [], current: null, online: false, viewer: true, by: (p.get('by') || 'Un ami').slice(0, 16) };
      if (!placedCount()) throw new Error('Cette tier list est vide ou le lien est abîmé.');
      showResult();
    } catch (err) {
      G = null;
      homeError(err.message || 'Impossible d\'ouvrir cette tier list.');
    }
  }

  // =========================================================
  //  EN LIGNE
  // =========================================================
  const playersList = () => [...R.players.values()];
  const cleanName = (n) => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) || 'Joueur';
  const cleanAvatar = (a) => (BT.AVATARS.includes(a) ? a : '🎧');
  const inviteUrl = () => {
    const p = new URLSearchParams({ room: R.room.code });
    if (BT.urlParams.get('peer')) p.set('peer', BT.urlParams.get('peer'));
    return `${location.origin}${location.pathname}?${p}`;
  };

  function renderLobby() {
    $('#roomCode').textContent = R.room.code;
    const list = playersList();
    $('#playerCount').textContent = `${list.length}`;
    $('#lobbyPlayers').innerHTML = list.map((p) => `<li class="${p.id === R.myId ? 'me' : ''}"><span class="p-avatar">${esc(p.avatar)}</span><span class="p-name">${esc(p.name)}${p.id === R.myId ? ' <small>(toi)</small>' : ''}</span>${p.host ? '<span class="p-tag">👑 Hôte</span>' : '<span class="p-tag ready">Prêt</span>'}</li>`).join('');
    if (R.info) {
      $('#lobbyConfig').innerHTML = `<div class="cfg-sources"><span class="chip">${sourcePic(R.info.source, 'mini')}${esc(R.info.source.name)}</span></div>
        <div class="cfg-tags"><span>🏆 Tier list du groupe</span><span>🎵 ${R.info.total} sons</span><span>🔊 Écoute synchronisée</span></div>`;
    }
    $('#lobbyHost').classList.toggle('hidden', !R.isHost);
    $('#lobbyWaiting').classList.toggle('hidden', R.isHost);
    $('#lobbyStart').textContent = list.length > 1 ? `▶ Lancer la tier list (${list.length} joueurs)` : '▶ Lancer la tier list (seul pour l\'instant)';
  }

  function renderVotes(reveal) {
    if (!R) return;
    $('#voteList').innerHTML = playersList().map((p) => {
      const v = reveal && reveal[p.id];
      const tag = v ? `<span class="vote-tier" style="--c:${TIER[v].color}">${v}</span>`
        : reveal ? '<span class="vote-wait">–</span>'
        : R.voted && R.voted.has(p.id) ? '<span class="vote-ok">✔</span>' : '<span class="vote-wait"><span class="dots"><i></i><i></i><i></i></span></span>';
      return `<li class="${p.id === R.myId ? 'me' : ''}"><span>${esc(p.avatar)}</span><b>${esc(p.name)}</b>${tag}</li>`;
    }).join('');
  }

  // ---------- Hôte ----------
  async function startOnline(source, cnt) {
    if (!BT.profile.name && !(await openProfile('👤 Ton pseudo pour le salon', true))) return;
    audio.pause();
    show('loading');
    $('#loadingText').textContent = `Chargement des sons de ${source.name}…`;
    try {
      const list = await loadTracks(source, cnt);
      $('#loadingText').textContent = 'Création du salon…';
      const room = await BT.Room.create(PREFIX);
      addRecent(source);
      G = { source, count: cnt, tracks: new Map(list.map((t) => [t.id, t])), tiers: emptyTiers(), queue: BT.shuffle(list.map((t) => t.id)), current: null, online: true, viewer: false, log: {} };
      R = { room, isHost: true, myId: 'host', players: new Map([['host', { id: 'host', name: BT.displayName(), avatar: BT.profile.avatar, host: true }]]), votes: new Map(), voted: new Set(), phase: 'lobby', myVote: null, info: { source: slimSource(source), total: list.length }, timers: new Set() };
      room.onMessage = hostMessage;
      room.onLeave = (id) => {
        const p = R.players.get(id);
        if (!p) return;
        R.players.delete(id);
        R.votes.delete(id);
        toast(`${p.name} a quitté le salon`, { icon: '👋' });
        sendPlayers();
        if (R.phase === 'vote') checkVotes();
      };
      renderLobby();
      show('lobby');
    } catch (err) {
      R = null; G = null;
      homeError(err.message || 'Impossible de créer le salon.');
    }
  }

  const later = (fn, ms) => { const t = setTimeout(() => { R && R.timers.delete(t); if (R) fn(); }, ms); R.timers.add(t); return t; };
  const bcast = (msg) => R.room.broadcast(msg);
  function sendPlayers() {
    const msg = { t: 'players', players: playersList(), info: R.info, phase: R.phase };
    bcast(msg);
    onPlayers(msg);
  }
  const snapshot = () => ({ t: 'snap', source: slimSource(G.source), count: G.count, tracks: [...G.tracks.values()], tiers: G.tiers, queue: G.queue, current: G.current, phase: R.phase, players: playersList(), pos: audio.currentTime || 0, paused: audio.paused, voted: [...R.votes.keys()] });

  function hostMessage(id, msg) {
    if (msg.t === 'hello') {
      if (R.players.size >= 12) { R.room.sendTo(id, { t: 'full' }); return; }
      const p = { id, name: cleanName(msg.name), avatar: cleanAvatar(msg.avatar), host: false };
      R.players.set(id, p);
      R.room.sendTo(id, { t: 'welcome', id });
      sendPlayers();
      BT.sfx('join');
      toast(`${p.name} a rejoint le salon`, { icon: p.avatar });
      if (R.phase !== 'lobby') R.room.sendTo(id, snapshot());
      return;
    }
    if (!R.players.has(id)) return;
    if (msg.t === 'vote' && R.phase === 'vote' && msg.id === G.current && TIER[msg.tier]) hostVote(id, msg.tier);
    else if (msg.t === 'ctl' && ['play', 'pause', 'replay'].includes(msg.a) && R.phase !== 'lobby' && R.phase !== 'end') hostCtl(msg.a);
  }

  function hostStart() {
    if (!R || !R.isHost || R.phase !== 'lobby') return;
    R.phase = 'play';
    const msg = { t: 'start', source: slimSource(G.source), count: G.count, tracks: [...G.tracks.values()], queue: G.queue, players: playersList() };
    bcast(msg);
    onStart(msg);
    later(hostSong, 3400);
  }
  $('#lobbyStart').addEventListener('click', hostStart);

  function hostSong() {
    if (!R || !R.isHost) return;
    if (!G.queue.length) { hostEnd(); return; }
    R.votes.clear();
    R.phase = 'vote';
    const msg = { t: 'song', id: G.queue[0], n: placedCount() + 1, total: total() };
    bcast(msg);
    onSong(msg);
  }
  function hostVote(pid, tier) {
    R.votes.set(pid, tier);
    const msg = { t: 'voted', ids: [...R.votes.keys()] };
    bcast(msg);
    onVoted(msg);
    checkVotes();
  }
  function checkVotes() {
    clearTimeout(R.finalTimer);
    if (R.phase === 'vote' && R.votes.size >= R.players.size && R.votes.size > 0) R.finalTimer = later(hostFinalize, 800);
  }
  function hostFinalize() {
    if (!R || R.phase !== 'vote' || !R.votes.size) return;
    R.phase = 'placed';
    const vals = [...R.votes.values()].map((t) => TIER[t].v);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length + 1e-9);
    const tier = TIERS.find((t) => t.v === avg).id;
    const msg = { t: 'placed', id: G.current, tier, votes: Object.fromEntries(R.votes) };
    bcast(msg);
    onPlaced(msg);
    later(hostSong, 3000);
  }
  $('#tlForce').addEventListener('click', () => { if (R && R.isHost) { if (R.votes.size) hostFinalize(); else toast('Il faut au moins un vote', { icon: '🗳️' }); } });
  function hostSkip() {
    if (!R || R.phase !== 'vote' || G.queue.length < 2) return;
    G.queue = [...G.queue.slice(1), G.queue[0]];
    bcast({ t: 'queue', queue: G.queue });
    hostSong();
  }
  function hostCtl(a) {
    const msg = { t: 'ctl', a, pos: a === 'replay' ? 0 : (audio.currentTime || 0) };
    bcast(msg);
    localCtl(a, msg.pos);
  }
  function hostEnd() {
    if (!R || !R.isHost) return;
    R.phase = 'end';
    const msg = { t: 'end', tiers: G.tiers, queue: G.queue, log: G.log, players: playersList() };
    bcast(msg);
    onEnd(msg);
  }

  // ---------- Invité ----------
  async function joinRoom(code) {
    code = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) { toast('Le code doit faire 6 caractères', { icon: '⚠️' }); return; }
    if (!(await openProfile(`🌐 Rejoindre le salon ${code}`, true))) return;
    audio.pause();
    show('loading');
    $('#loadingText').textContent = `Connexion au salon ${code}…`;
    try {
      const room = await BT.Room.join(PREFIX, code);
      R = { room, isHost: false, myId: null, players: new Map(), votes: new Map(), voted: new Set(), phase: 'lobby', myVote: null, info: null, timers: new Set() };
      room.onMessage = (_, msg) => clientMessage(msg);
      room.onClosed = () => { if (!R) return; toast("L'hôte a fermé le salon", { icon: '🚪', ms: 4000 }); R = null; goHome(); };
      room.send({ t: 'hello', name: BT.displayName(), avatar: BT.profile.avatar });
    } catch (err) {
      R = null;
      homeError(err.message || 'Connexion impossible.');
    }
  }

  function clientMessage(msg) {
    switch (msg.t) {
      case 'welcome': R.myId = msg.id; BT.sfx('join'); break;
      case 'players': onPlayers(msg); break;
      case 'start': onStart(msg); break;
      case 'snap': onSnap(msg); break;
      case 'song': onSong(msg); break;
      case 'voted': onVoted(msg); break;
      case 'placed': onPlaced(msg); break;
      case 'queue': if (G) { G.queue = msg.queue.filter((id) => G.tracks.has(id)); renderProgress(); } break;
      case 'ctl': localCtl(msg.a, msg.pos); break;
      case 'end': onEnd(msg); break;
      case 'full': toast('Ce salon est plein', { icon: '⚠️' }); leaveRoom(); break;
      default: break;
    }
  }

  // ---------- Commun (hôte et invités) ----------
  function onPlayers(msg) {
    R.players = new Map(msg.players.map((p) => [p.id, p]));
    if (msg.info) R.info = msg.info;
    renderLobby();
    renderVotes();
    if (msg.phase === 'lobby' && !R.isHost && document.body.dataset.screen !== 'lobby') show('lobby');
    if (msg.phase !== 'lobby' && !R.isHost && document.body.dataset.screen === 'loading') $('#loadingText').textContent = 'Tier list en cours : tu arrives…';
  }

  function buildGame(msg) {
    G = { source: msg.source, count: msg.count, tracks: new Map(msg.tracks.map((t) => [t.id, t])), tiers: msg.tiers || emptyTiers(), queue: msg.queue.slice(), current: null, online: true, viewer: false, log: {} };
    if (msg.players) R.players = new Map(msg.players.map((p) => [p.id, p]));
    setupBoardScreen();
    renderVotes();
    show('board');
  }
  function onStart(msg) {
    R.phase = 'play';
    if (!R.isHost) buildGame(msg); else { setupBoardScreen(); renderVotes(); show('board'); }
    $('#nowTitle').textContent = 'Prêts ?';
    $('#nowSub').textContent = `${msg.tracks.length} sons à classer ensemble`;
    $('#nowCount').textContent = '';
    BT.countdown(3);
  }
  function onSnap(msg) {
    R.phase = msg.phase;
    buildGame(msg);
    if (msg.phase === 'end') { onEnd({ tiers: msg.tiers, queue: msg.queue, log: {}, players: msg.players }); return; }
    R.voted = new Set(msg.voted || []);
    if (msg.current) { setCurrent(msg.current, { autoplay: false }); if (!msg.paused) playTrack(G.tracks.get(msg.current), msg.pos || 0); }
    renderVotes();
  }
  function onSong(msg) {
    R.phase = 'vote';
    R.myVote = null;
    R.voted = new Set();
    if (!G.queue.includes(msg.id)) return;
    G.queue = [msg.id, ...G.queue.filter((x) => x !== msg.id)];
    setCurrent(msg.id);
    $('#nowCount').textContent = `Son ${msg.n} sur ${msg.total}`;
    $('#nowAsk').textContent = 'Vote : dans quel rang tu le mets ?';
    $$('.tier-btn').forEach((b) => { b.classList.remove('active'); b.disabled = false; });
    renderVotes();
  }
  function vote(tierId) {
    if (!R || R.phase !== 'vote' || !G.current) return;
    R.myVote = tierId;
    $$('.tier-btn').forEach((b) => b.classList.toggle('active', b.dataset.tier === tierId));
    $('#nowAsk').textContent = `Ton vote : ${tierId}. Tu peux encore changer tant que tout le monde n'a pas voté.`;
    BT.sfx('pop');
    if (R.isHost) hostVote('host', tierId); else R.room.send({ t: 'vote', id: G.current, tier: tierId });
  }
  function onVoted(msg) {
    R.voted = new Set(msg.ids);
    renderVotes();
  }
  function onPlaced(msg) {
    R.phase = 'placed';
    G.log[msg.id] = { tier: msg.tier, votes: msg.votes };
    $$('.tier-btn').forEach((b) => { b.disabled = true; b.classList.toggle('active', b.dataset.tier === msg.tier); });
    const n = Object.keys(msg.votes).length;
    $('#nowAsk').innerHTML = `Verdict du groupe : <b style="color:${TIER[msg.tier].color}">rang ${msg.tier}</b> (${n} vote${n > 1 ? 's' : ''})`;
    renderVotes(msg.votes);
    place(msg.id, msg.tier, undefined, { advance: false });
    G.current = msg.id;
  }

  function onEnd(msg) {
    R.phase = 'end';
    clearTimers();
    G.tiers = msg.tiers;
    G.queue = (msg.queue || []).filter((id) => G.tracks.has(id));
    if (msg.players) R.players = new Map(msg.players.map((p) => [p.id, p]));
    const log = msg.log && Object.keys(msg.log).length ? msg.log : G.log;
    // accord de chaque joueur avec le verdict du groupe
    const rows = playersList().map((p) => {
      let sum = 0; let n = 0;
      Object.values(log).forEach((e) => { const v = e.votes[p.id]; if (v) { sum += 1 - Math.abs(TIER[v].v - TIER[e.tier].v) / 5; n++; } });
      return { p, pct: n ? Math.round((sum / n) * 100) : null, n };
    }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
    const html = rows.length > 1 || (rows[0] && rows[0].n) ? `<h3 class="agree-title">Qui est le plus d'accord avec le groupe ?</h3><ul class="agree">${rows.map((r, i) => `<li class="${r.p.id === R.myId ? 'me' : ''}"><span>${i === 0 && r.pct !== null ? '👑' : esc(r.p.avatar)}</span><b>${esc(r.p.name)}</b><div class="agree-bar"><i style="width:${r.pct ?? 0}%"></i></div><em>${r.pct === null ? '–' : r.pct + ' %'}</em></li>`).join('')}</ul>` : '';
    showResult({ players: R.players.size, html });
  }

  function clearTimers() { if (R) { R.timers.forEach(clearTimeout); R.timers.clear(); clearTimeout(R.finalTimer); } }
  function leaveRoom() {
    if (!R) return;
    clearTimers();
    const room = R.room;
    R = null;
    room.close();
    goHome();
  }
  $('#lobbyLeave').addEventListener('click', quit);
  const copyInvite = async () => {
    try { await navigator.clipboard.writeText(inviteUrl()); toast('Lien d\'invitation copié !', { icon: '🔗' }); } catch { prompt('Copie ce lien :', inviteUrl()); }
  };
  $('#copyInvite').addEventListener('click', copyInvite);
  $('#roomCode').addEventListener('click', copyInvite);

  $('#joinForm').addEventListener('submit', (e) => { e.preventDefault(); joinRoom($('#joinCode').value); });
  $('#joinCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });

  // =========================================================
  //  DÉMARRAGE
  // =========================================================
  document.body.dataset.screen = 'home';
  applyVolume();
  renderProfile();
  renderSaved();
  const params = BT.urlParams;
  if (params.get('room')) { $('#joinCode').value = params.get('room').toUpperCase(); joinRoom(params.get('room')); }
  else if (params.get('t') && params.get('s')) openShared(params);

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  BT.TierList = { get game() { return G; }, get room() { return R; } };
})();
