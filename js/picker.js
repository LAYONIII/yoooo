/* =========================================================
   picker.js : sélecteur d'artiste réutilisable (recherche Deezer,
   onglets par catégorie, onglet « Tous » avec barre A-Z et filtre,
   playlists, liste qui défile, photos chargées à l'affichage).
   BT.ArtistPicker(conteneur, { onPick(source) })
   ========================================================= */
(() => {
  'use strict';
  const { $, $$, esc, api, CHARTS, sourceKey, initials, fmtFans, toast } = BT;

  BT.ArtistPicker = function ArtistPicker(root, { onPick, recentKey = 'tl_recent' }) {
    const CATS = BT.CATEGORIES;
    const ALL = [...new Set(CATS.flatMap((c) => c.artists))].sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }));
    const TABS = [{ id: 'all', label: '⭐ Tous', desc: `Tous les artistes, de A à Z · ${ALL.length} artistes` },
      ...CATS.map((c) => ({ id: c.id, label: c.label, desc: `${c.desc} · ${c.artists.length} artistes` })),
      { id: 'charts', label: '📈 Playlists', desc: 'Les classements Deezer du moment' },
      { id: 'recent', label: '🕘 Récents', desc: 'Tes derniers choix' }];
    let cat = 'all';
    let seq = 0;

    root.innerHTML = `
      <form class="search pk-search" autocomplete="off">
        <span class="search-ico">🔎</span>
        <input type="search" class="pk-input" placeholder="Rechercher n'importe quel artiste sur Deezer…" aria-label="Rechercher un artiste">
      </form>
      <div class="artist-grid compact pk-results"></div>
      <div class="cat-bar"><div class="tabs pk-tabs" role="tablist">${TABS.map((t) => `<button type="button" class="tab${t.id === cat ? ' active' : ''}" data-cat="${t.id}">${esc(t.label)}</button>`).join('')}</div></div>
      <div class="cat-head">
        <p class="muted pk-desc"></p>
        <div class="cat-tools">
          <input class="filter-input pk-filter" type="search" placeholder="Filtrer la liste…" aria-label="Filtrer les artistes affichés">
          <button type="button" class="btn btn-glass btn-sm pk-random">🎲 Au hasard</button>
        </div>
      </div>
      <div class="letter-bar pk-letters"></div>
      <div class="artist-grid scroll-grid pk-grid"></div>`;
    const q = (sel) => $(sel, root);
    const grid = q('.pk-grid');

    function card(src, preset) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `artist${src.type === 'chart' ? ' chart' : ''}`;
      b.dataset.tilt = '16';
      b.dataset.name = src.name;
      if (src.id !== undefined) b.dataset.key = sourceKey(src);
      const pic = src.type === 'chart' ? `<div class="avatar chart-ico">${esc(src.emoji)}</div>`
        : src.picture ? `<img class="avatar" src="${esc(src.picture)}" alt="" loading="lazy">` : `<div class="avatar">${esc(initials(src.name))}</div>`;
      b.innerHTML = `${pic}<div class="artist-name">${esc(src.name)}</div><div class="artist-fans">${src.type === 'chart' ? esc(src.desc) : src.fans ? fmtFans(src.fans) : '&nbsp;'}</div>`;
      b.addEventListener('click', async () => {
        let s = src;
        if (preset && s.id === undefined) {
          b.classList.add('loading');
          try { s = await api.resolve(src.name); } catch (err) { toast(err.message, { icon: '⚠️' }); b.classList.remove('loading'); return; }
          b.classList.remove('loading');
        }
        onPick(s);
      });
      return b;
    }

    // photos chargées seulement quand la carte devient visible
    const queue = [];
    let running = 0;
    let observer = null;
    function swap(name) {
      const old = $(`.artist[data-name="${CSS.escape(name)}"]`, grid);
      if (!old || old.dataset.key) return;
      const c = card(api.presetCache[name], true);
      c.style.animation = 'none';
      if (old.classList.contains('hidden')) c.classList.add('hidden');
      old.replaceWith(c);
    }
    function pump() {
      while (running < 4 && queue.length) {
        const job = queue.shift();
        if (job.seq !== seq) continue;
        if (api.presetCache[job.name]) { swap(job.name); continue; }
        running++;
        api.resolve(job.name).then(() => { if (job.seq === seq) swap(job.name); }).catch(() => {}).finally(() => { running--; pump(); });
      }
    }
    function lazyPictures() {
      const my = ++seq;
      queue.length = 0;
      if (observer) observer.disconnect();
      observer = new IntersectionObserver((entries) => {
        entries.forEach((e) => { if (e.isIntersecting) { observer.unobserve(e.target); if (!e.target.dataset.key) queue.push({ name: e.target.dataset.name, seq: my }); } });
        pump();
      }, { rootMargin: '200px' });
      $$('.artist:not([data-key])', grid).forEach((c) => observer.observe(c));
    }

    const firstLetter = (name) => { const c = BT.norm(name).charAt(0).toUpperCase(); return /[A-Z]/.test(c) ? c : '#'; };
    function applyFilter() {
      const f = BT.norm(q('.pk-filter').value);
      $$('.artist', grid).forEach((c) => c.classList.toggle('hidden', !!f && !BT.norm(c.dataset.name).includes(f)));
    }

    function render() {
      grid.innerHTML = '';
      const tab = TABS.find((t) => t.id === cat);
      q('.pk-desc').textContent = tab.desc;
      q('.pk-random').classList.toggle('hidden', cat === 'recent' || cat === 'charts');
      const letters = q('.pk-letters');
      letters.classList.toggle('hidden', cat !== 'all');
      if (cat === 'all') {
        const present = new Set(ALL.map(firstLetter));
        letters.innerHTML = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((l) => `<button type="button" data-letter="${l}" ${present.has(l) ? '' : 'disabled'}>${l}</button>`).join('');
      }
      if (cat === 'recent') {
        const rec = BT.store.get(recentKey, []);
        if (!rec.length) grid.innerHTML = '<p class="empty">Les artistes que tu as classés apparaîtront ici.</p>';
        rec.forEach((s) => grid.appendChild(card(s)));
      } else if (cat === 'charts') {
        CHARTS.forEach((c) => grid.appendChild(card(c)));
      } else {
        const names = cat === 'all' ? ALL : CATS.find((c) => c.id === cat).artists;
        names.forEach((name, i) => {
          const c = card(api.presetCache[name] || { type: 'artist', name }, true);
          c.style.animationDelay = `${Math.min(i, 20) * 25}ms`;
          grid.appendChild(c);
        });
        lazyPictures();
      }
      applyFilter();
      grid.scrollTop = 0;
    }

    q('.pk-tabs').addEventListener('click', (e) => {
      const t = e.target.closest('.tab');
      if (!t) return;
      $$('.tab', root).forEach((x) => x.classList.toggle('active', x === t));
      t.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      cat = t.dataset.cat;
      q('.pk-filter').value = '';
      render();
    });
    q('.pk-filter').addEventListener('input', applyFilter);
    q('.pk-letters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-letter]');
      if (!b) return;
      const c = $$('.artist:not(.hidden)', grid).find((x) => firstLetter(x.dataset.name) === b.dataset.letter);
      if (c) grid.scrollTo({ top: c.offsetTop - 8, behavior: 'smooth' });
      $$('button', q('.pk-letters')).forEach((x) => x.classList.toggle('active', x === b));
    });
    q('.pk-random').addEventListener('click', async () => {
      const names = cat === 'all' ? ALL : (CATS.find((c) => c.id === cat) || { artists: ALL }).artists;
      try { onPick(await api.resolve(names[BT.rand(names.length)])); } catch (err) { toast(err.message, { icon: '⚠️' }); }
    });

    // recherche Deezer
    let sseq = 0;
    let deb = 0;
    async function search() {
      const v = q('.pk-input').value.trim();
      const box = q('.pk-results');
      if (!v) { box.innerHTML = ''; return; }
      const my = ++sseq;
      box.innerHTML = '<p class="empty"><span class="dots"><i></i><i></i><i></i></span> Recherche…</p>';
      try {
        const res = await api.search(v);
        if (my !== sseq) return;
        box.innerHTML = res.length ? '' : `<p class="empty">Aucun artiste trouvé pour « ${esc(v)} »</p>`;
        res.forEach((a) => box.appendChild(card(a)));
      } catch (err) { if (my === sseq) box.innerHTML = `<p class="empty">${esc(err.message)}</p>`; }
    }
    q('.pk-search').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(deb); search(); });
    q('.pk-input').addEventListener('input', (e) => {
      clearTimeout(deb);
      const v = e.target.value.trim();
      if (!v) { q('.pk-results').innerHTML = ''; return; }
      if (v.length >= 2) deb = setTimeout(search, 400);
    });

    render();
    return { refresh: render };
  };
})();
