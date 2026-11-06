/* =========================================================
   fx3d.js : tous les effets visuels.
   - Cartes qui pivotent en 3D sous la souris + halo qui suit le curseur (CSS)
   - Fond 3D (Three.js) : particules et formes néon qui réagissent à la
     musique et aux réponses (vert = bonne réponse, rouge = erreur)
   - Platine vinyle 3D sur l'accueil, avec les photos des artistes
     choisis qui tournent autour
   Si Three.js ne se charge pas (hors ligne, vieux téléphone…), le site
   marche normalement avec la version CSS.
   ========================================================= */
(() => {
  'use strict';
  const { $ } = BT;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const small = innerWidth < 700;
  const mouse = { x: 0, y: 0 };

  // ---------- Cartes 3D + halo du curseur ----------
  if (fine && !reduce) {
    let current = null;
    const resetCard = (el) => { el.style.transform = ''; el.classList.remove('tilting'); };
    document.addEventListener('pointermove', (e) => {
      document.documentElement.style.setProperty('--cx', `${e.clientX}px`);
      document.documentElement.style.setProperty('--cy', `${e.clientY}px`);
      const el = e.target.closest ? e.target.closest('[data-tilt]') : null;
      if (current && current !== el) resetCard(current);
      current = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      const max = +el.dataset.tilt || 12;
      el.classList.add('tilting');
      el.style.transform = `perspective(700px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) scale(1.03)`;
      el.style.setProperty('--gx', `${x * 100}%`);
      el.style.setProperty('--gy', `${y * 100}%`);
    }, { passive: true });
    document.addEventListener('pointerleave', () => { if (current) resetCard(current); current = null; });
  }
  window.addEventListener('pointermove', (e) => {
    mouse.x = (e.clientX / innerWidth) * 2 - 1;
    mouse.y = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  if (reduce) return;

  // ---------- Chargement de Three.js ----------
  const URLS = [
    'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
    'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  ];
  function loadThree(i = 0) {
    if (window.THREE) return Promise.resolve();
    if (i >= URLS.length) return Promise.reject(new Error('three'));
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = URLS[i];
      s.onload = resolve;
      s.onerror = () => { s.remove(); loadThree(i + 1).then(resolve, reject); };
      document.head.appendChild(s);
    });
  }

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 4;
    return tex;
  }
  const dotTexture = () => canvasTexture(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  });

  const PALETTE = ['#ff2e93', '#8b5cf6', '#22d3ee', '#f5f5fb'];
  const visible = () => !document.hidden;

  // =========================================================
  //  FOND 3D
  // =========================================================
  function initBackground() {
    const canvas = $('#bg3d');
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, small ? 1 : 1.5));
    renderer.setSize(innerWidth, innerHeight, false);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 200);
    camera.position.z = 30;

    // particules
    const N = small ? 700 : 1600;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const r = 18 + Math.random() * 50;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.6;
      pos[i * 3 + 2] = r * Math.cos(ph) - 20;
      c.set(PALETTE[i % PALETTE.length]);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const pMat = new THREE.PointsMaterial({ size: 0.55, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending });
    const points = new THREE.Points(geo, pMat);
    scene.add(points);

    // formes néon qui flottent
    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const l1 = new THREE.PointLight(0xff2e93, 2, 80); l1.position.set(-20, 12, 12); scene.add(l1);
    const l2 = new THREE.PointLight(0x22d3ee, 2, 80); l2.position.set(20, -12, 12); scene.add(l2);
    const geos = [
      new THREE.IcosahedronGeometry(2.2, 0), new THREE.TorusGeometry(1.7, 0.5, 16, 48), new THREE.OctahedronGeometry(2),
      new THREE.TorusKnotGeometry(1.3, 0.38, 90, 12), new THREE.DodecahedronGeometry(1.9), new THREE.TorusGeometry(2.4, 0.12, 8, 64),
    ];
    const shapes = geos.slice(0, small ? 4 : 6).map((g, i) => {
      const color = new THREE.Color(PALETTE[i % 3]);
      const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, metalness: 0.6, roughness: 0.25, wireframe: i % 2 === 0, transparent: true, opacity: 0.6 });
      const m = new THREE.Mesh(g, mat);
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (33 + Math.random() * 10), (Math.random() - 0.5) * 26, -14 - Math.random() * 16);
      m.userData = { base: m.position.clone(), sp: 0.3 + Math.random() * 0.5, ph: Math.random() * 6 };
      scene.add(m);
      return m;
    });

    const white = new THREE.Color(1, 1, 1);
    const flashColor = new THREE.Color();
    const st = { speed: 1, flash: 0, burst: 0, shake: 0 };
    BT.FX.pulse = (status) => {
      if (status === 'ok') { flashColor.set('#34d399'); st.flash = 1; st.burst = 1; }
      else if (status === 'ko' || status === 'timeout') { flashColor.set('#fb4d6d'); st.flash = 1; st.shake = 0.8; }
    };
    BT.FX.burst = () => { st.burst = 1; flashColor.set('#facc15'); st.flash = 1; };

    let t = 0;
    let last = performance.now();
    function frame(now) {
      requestAnimationFrame(frame);
      if (!visible()) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      const playing = document.body.classList.contains('is-playing');
      st.speed += ((playing ? 5 : 1) - st.speed) * 0.04;
      points.rotation.y += 0.02 * dt * st.speed;
      points.rotation.x = Math.sin(t * 0.1) * 0.08;
      // « battement » pendant la musique
      const beat = playing ? Math.pow(Math.max(0, Math.sin(t * 7.5)), 8) * 0.06 : 0;
      st.burst *= 0.93;
      points.scale.setScalar(1 + beat + st.burst * 0.25);
      st.flash *= 0.94;
      pMat.color.copy(white).lerp(flashColor, st.flash);
      pMat.size = 0.55 + st.flash * 0.5 + beat * 3;
      shapes.forEach((m, i) => {
        const u = m.userData;
        m.rotation.x += dt * u.sp * st.speed * 0.5;
        m.rotation.y += dt * u.sp * 0.7 * st.speed * 0.5;
        m.position.y = u.base.y + Math.sin(t * u.sp + u.ph) * 1.5;
        m.material.emissiveIntensity = 0.35 + st.flash * 0.8 + beat * 4;
        if (st.flash > 0.05) m.material.emissive.copy(new THREE.Color(PALETTE[i % 3])).lerp(flashColor, st.flash);
      });
      st.shake *= 0.88;
      camera.position.x += (mouse.x * 3 - camera.position.x) * 0.04 + (Math.random() - 0.5) * st.shake;
      camera.position.y += (-mouse.y * 2 - camera.position.y) * 0.04 + (Math.random() - 0.5) * st.shake;
      camera.lookAt(0, 0, -10);
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    window.addEventListener('resize', () => {
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight, false);
    });
    document.body.classList.add('has-3d');
  }

  // =========================================================
  //  PLATINE VINYLE 3D (accueil)
  // =========================================================
  function vinylTexture() {
    return canvasTexture(1024, 1024, (ctx, w) => {
      const cx = w / 2;
      ctx.fillStyle = '#09090d';
      ctx.beginPath(); ctx.arc(cx, cx, cx, 0, Math.PI * 2); ctx.fill();
      for (let r = 190; r < 505; r += 3) {
        ctx.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.045})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke();
      }
      if (ctx.createConicGradient) {
        const cg = ctx.createConicGradient(0.6, cx, cx);
        cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(0.08, 'rgba(255,255,255,.13)'); cg.addColorStop(0.16, 'rgba(255,255,255,0)');
        cg.addColorStop(0.5, 'rgba(255,255,255,0)'); cg.addColorStop(0.58, 'rgba(255,255,255,.1)'); cg.addColorStop(0.66, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(cx, cx, 505, 0, Math.PI * 2); ctx.fill();
      }
      const lg = ctx.createLinearGradient(cx - 175, cx - 175, cx + 175, cx + 175);
      lg.addColorStop(0, '#ff2e93'); lg.addColorStop(0.55, '#8b5cf6'); lg.addColorStop(1, '#22d3ee');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(cx, cx, 175, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '900 64px Outfit, system-ui, sans-serif';
      ctx.fillText('BLIND', cx, cx - 58);
      ctx.fillText('TEST', cx, cx + 62);
      ctx.font = '600 22px Outfit, system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,.8)';
      ctx.fillText('★ 33 ⅓ RPM ★', cx, cx + 122);
      ctx.fillStyle = '#09090d'; ctx.beginPath(); ctx.arc(cx, cx, 14, 0, Math.PI * 2); ctx.fill();
    });
  }

  function noteTexture(glyph) {
    return canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = '#fff'; ctx.shadowBlur = 16;
      ctx.font = '96px serif';
      ctx.fillText(glyph, 64, 70);
    });
  }

  function initHero() {
    const wrap = $('.hero-visual');
    const canvas = $('#hero3d');
    if (!wrap || !canvas) return;
    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(0, 7.2, 11.6);
    camera.lookAt(0, -0.4, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9); dir.position.set(3, 8, 5); scene.add(dir);
    const pink = new THREE.PointLight(0xff2e93, 3, 14); pink.position.set(-4, 2.5, 3); scene.add(pink);
    const cyan = new THREE.PointLight(0x22d3ee, 1.6, 14); cyan.position.set(5, 3.5, -3); scene.add(cyan);

    const deck = new THREE.Group();
    scene.add(deck);
    // socle
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.5, 6.6), new THREE.MeshStandardMaterial({ color: 0x14141e, metalness: 0.55, roughness: 0.3 }));
    base.position.y = -0.4;
    deck.add(base);
    const neon = new THREE.Mesh(new THREE.BoxGeometry(6.7, 0.05, 6.7), new THREE.MeshBasicMaterial({ color: 0x8b5cf6 }));
    neon.position.y = -0.62;
    deck.add(neon);
    // plateau
    const platter = new THREE.Mesh(new THREE.CylinderGeometry(2.85, 2.85, 0.14, 96), new THREE.MeshStandardMaterial({ color: 0x2a2a36, metalness: 0.9, roughness: 0.25 }));
    platter.position.set(-0.4, -0.08, 0);
    deck.add(platter);
    // vinyle
    const topMat = new THREE.MeshStandardMaterial({ map: vinylTexture(), metalness: 0.35, roughness: 0.32 });
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x050507, roughness: 0.5 });
    const vinyl = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.7, 0.05, 128), [sideMat, topMat, sideMat]);
    vinyl.position.set(-0.4, 0.02, 0);
    deck.add(vinyl);
    // bras de lecture
    const arm = new THREE.Group();
    arm.position.set(2.45, 0.05, -2.35);
    const metal = new THREE.MeshStandardMaterial({ color: 0xd9d9e6, metalness: 0.95, roughness: 0.2 });
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.4, 32), metal);
    pivot.position.y = 0.15;
    arm.add(pivot);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.6, 12), metal);
    rod.rotation.x = Math.PI / 2;
    rod.position.set(0, 0.36, 1.75);
    arm.add(rod);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.55), new THREE.MeshStandardMaterial({ color: 0xff2e93, metalness: 0.4, roughness: 0.3, emissive: 0xff2e93, emissiveIntensity: 0.35 }));
    head.position.set(0, 0.3, 3.55);
    arm.add(head);
    arm.rotation.y = -0.42;
    deck.add(arm);
    // bouton lumineux
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 32), new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.8 }));
    knob.position.set(2.5, -0.1, 2.5);
    deck.add(knob);

    // notes de musique qui s'envolent
    const notes = ['♪', '♫', '♬', '♪', '♫', '♩'].map((g, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: noteTexture(g), color: new THREE.Color(PALETTE[i % 3]), transparent: true, depthWrite: false }));
      sp.scale.setScalar(0.7);
      sp.userData = { ph: i / 6, x: (Math.random() - 0.5) * 6, z: (Math.random() - 0.5) * 4 };
      scene.add(sp);
      return sp;
    });

    // photos des artistes choisis, en orbite autour de la platine
    const covers = new THREE.Group();
    scene.add(covers);
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin('anonymous');
    let coverKey = '';
    BT.FX.setCovers = (urls) => {
      const list = urls.filter(Boolean).slice(0, 8);
      const key = list.join('|');
      if (key === coverKey) return;
      coverKey = key;
      while (covers.children.length) { const m = covers.children.pop(); m.geometry.dispose(); m.material.dispose(); }
      list.forEach((url, i) => {
        loader.load(url, (tex) => {
          if (coverKey !== key) return;
          const m = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
          m.userData = { a: (i / list.length) * Math.PI * 2, y: 0.9 + (i % 3) * 0.55 };
          covers.add(m);
        }, undefined, () => { /* image sans CORS : on l'ignore */ });
      });
    };

    let active = true;
    new IntersectionObserver(([e]) => { active = e.isIntersecting; }).observe(wrap);
    function resize() {
      const r = wrap.getBoundingClientRect();
      const s = Math.max(200, Math.min(r.width, innerWidth < 960 ? 300 : 500));
      renderer.setSize(s, s, false);
      canvas.style.width = canvas.style.height = `${s}px`;
      camera.aspect = 1;
      camera.updateProjectionMatrix();
    }
    resize();
    window.addEventListener('resize', resize);

    let t = 0;
    let last = performance.now();
    let spin = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!active || !visible() || document.body.dataset.screen !== 'home') return;
      t += dt;
      spin += dt * 2.2;
      vinyl.rotation.y = -spin;
      deck.rotation.y += ((mouse.x * 0.35 - 0.3) - deck.rotation.y) * 0.05;
      deck.rotation.x += ((mouse.y * 0.18 + 0.05) - deck.rotation.x) * 0.05;
      deck.position.y = Math.sin(t * 1.2) * 0.12;
      arm.rotation.y = -0.42 + Math.sin(t * 0.8) * 0.015;
      knob.material.emissiveIntensity = 0.6 + Math.sin(t * 4) * 0.3;
      notes.forEach((n) => {
        const k = (t * 0.18 + n.userData.ph) % 1;
        n.position.set(n.userData.x + Math.sin(t + n.userData.ph * 9) * 0.4, 0.4 + k * 4, n.userData.z);
        n.material.opacity = Math.sin(k * Math.PI);
      });
      covers.children.forEach((m) => {
        const a = m.userData.a + t * 0.35;
        m.position.set(Math.cos(a) * 3.9 - 0.4, m.userData.y + Math.sin(t * 1.5 + m.userData.a) * 0.15, Math.sin(a) * 3.2);
        m.lookAt(camera.position);
      });
      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
    wrap.classList.add('is-3d');
  }

  function start() {
    loadThree().then(() => {
      try { initBackground(); } catch (e) { /* pas de WebGL */ return; }
      try { initHero(); } catch (e) { /* la version CSS reste affichée */ }
      if (BT.refreshCovers) BT.refreshCovers();
    }).catch(() => { /* Three.js indisponible : version CSS */ });
  }
  if (document.readyState === 'complete') setTimeout(start, 100);
  else window.addEventListener('load', () => setTimeout(start, 100));
})();
