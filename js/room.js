/* =========================================================
   room.js : un petit « salon » en ligne réutilisable (PeerJS / WebRTC).
   Les navigateurs se connectent directement entre eux : pas de serveur.
   - BT.Room.create(prefix)      -> l'hôte ouvre un salon et reçoit un code
   - BT.Room.join(prefix, code)  -> un invité rejoint le salon
   L'objet renvoyé expose :
     room.onMessage(fromId, msg)   reçu (chez l'hôte, fromId = id du joueur ;
                                   chez l'invité, fromId = 'host')
     room.onLeave(id)              (hôte) un joueur est parti
     room.onClosed()               (invité) l'hôte a fermé le salon
     room.broadcast(msg) / room.sendTo(id, msg)   (hôte)
     room.send(msg)                                (invité -> hôte)
     room.close()
   ========================================================= */
(() => {
  'use strict';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const URLS = [
    'https://cdn.jsdelivr.net/npm/peerjs@1.5.4/dist/peerjs.min.js',
    'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js',
  ];

  function loadLib(i = 0) {
    if (window.Peer) return Promise.resolve();
    if (i >= URLS.length) return Promise.reject(new Error('Impossible de charger le module en ligne. Vérifie ta connexion.'));
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = URLS[i];
      s.onload = resolve;
      s.onerror = () => { s.remove(); loadLib(i + 1).then(resolve, reject); };
      document.head.appendChild(s);
    });
  }

  // ?peer=hote:port permet d'utiliser son propre serveur PeerJS (tests en local)
  function peerOptions() {
    const p = BT.urlParams.get('peer');
    if (p) { const [host, port] = p.split(':'); return { host, port: +port || 9000, path: '/', secure: false, debug: 0 }; }
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

  const safeSend = (conn, msg) => { try { if (conn && conn.open) conn.send(msg); } catch { /* ignore */ } };
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[BT.rand(CODE_CHARS.length)]).join('');

  async function create(prefix) {
    await loadLib();
    let peer = null;
    let code = '';
    for (let i = 0; i < 5 && !peer; i++) {
      code = newCode();
      try { peer = await openPeer(prefix + code); } catch (e) { if (e.type !== 'unavailable-id') throw e; }
    }
    if (!peer) throw new Error('Impossible de créer un salon, réessaie.');
    const room = {
      isHost: true, code, peer, conns: new Map(), closed: false,
      onMessage() {}, onLeave() {}, onClosed() {},
      broadcast(msg) { room.conns.forEach((c) => safeSend(c, msg)); },
      sendTo(id, msg) { safeSend(room.conns.get(id), msg); },
      close() {
        if (room.closed) return;
        room.closed = true;
        room.broadcast({ t: 'closed' });
        setTimeout(() => { try { peer.destroy(); } catch { /* ignore */ } }, 300);
      },
    };
    peer.on('connection', (conn) => {
      conn.on('data', (msg) => {
        if (room.closed || !msg || typeof msg !== 'object') return;
        if (!room.conns.has(conn.peer)) room.conns.set(conn.peer, conn);
        room.onMessage(conn.peer, msg);
      });
      const drop = () => { if (room.conns.delete(conn.peer) && !room.closed) room.onLeave(conn.peer); };
      conn.on('close', drop);
      conn.on('error', drop);
    });
    peer.on('disconnected', () => { if (!room.closed) peer.reconnect(); });
    window.addEventListener('beforeunload', () => room.close());
    return room;
  }

  async function join(prefix, rawCode) {
    const code = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length !== 6) throw new Error('Le code doit faire 6 caractères.');
    await loadLib();
    const peer = await openPeer();
    const room = {
      isHost: false, code, peer, closed: false,
      onMessage() {}, onClosed() {},
      send() {},
      close() { if (room.closed) return; room.closed = true; try { peer.destroy(); } catch { /* ignore */ } },
    };
    await new Promise((resolve, reject) => {
      const conn = peer.connect(prefix + code, { reliable: true });
      const timer = setTimeout(() => reject(new Error('Le salon ne répond pas. Vérifie le code ou demande à ton pote de rester sur la page.')), 15000);
      peer.on('error', (e) => { if (e.type === 'peer-unavailable') { clearTimeout(timer); reject(new Error(`Salon ${code} introuvable. Vérifie le code.`)); } });
      conn.on('open', () => { clearTimeout(timer); room.send = (msg) => safeSend(conn, msg); resolve(); });
      conn.on('data', (msg) => {
        if (room.closed || !msg || typeof msg !== 'object') return;
        if (msg.t === 'closed') { room.closed = true; room.onClosed(); try { peer.destroy(); } catch { /* ignore */ } return; }
        room.onMessage('host', msg);
      });
      const gone = () => { if (!room.closed) { room.closed = true; room.onClosed(); } };
      conn.on('close', gone);
      conn.on('error', gone);
    }).catch((err) => { try { peer.destroy(); } catch { /* ignore */ } throw err; });
    return room;
  }

  BT.Room = { create, join };
})();
